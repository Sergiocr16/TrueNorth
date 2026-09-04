import { NextResponse } from 'next/server';
import { TIME_ZONE, todayIso } from '@truenorth/core';
import { adminCredentials, adminDb, adminMessaging } from '../../../../server/admin';

/**
 * The reminder, once per person per day, at the hour they chose.
 *
 * A systemd timer calls this every hour. It finds everybody whose `notifyHour`
 * is the current hour in Costa Rica, and who has a plan for today that has not
 * been announced yet, and sends one push: the plan's headline. Managers with
 * messages still to send get a second one. Data-only payloads, so the service
 * worker decides how the notification looks and where it opens.
 *
 * Tokens that Firebase reports dead are removed, so a phone that was wiped
 * stops being tried every morning.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface Profile {
  notifyHour?: number;
  fcmTokens?: string[];
}

export async function POST(request: Request) {
  const expected = process.env.ENGINE_LOCAL_TOKEN;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  const url = new URL(request.url);
  const hour = Number(
    url.searchParams.get('hour') ??
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TIME_ZONE }).format(
        new Date(),
      ),
  );
  const date = todayIso();

  const db = adminDb();
  const messaging = adminMessaging();
  const report: { sent: number; skipped: number; dead: number; details: string[] } = {
    sent: 0,
    skipped: 0,
    dead: 0,
    details: [],
  };

  const companies = await db.collection('companies').get();
  for (const company of companies.docs) {
    const members = await company.ref.collection('members').get();
    for (const member of members.docs) {
      const uid = member.id;
      const profileSnap = await db.collection('users').doc(uid).get();
      if (!profileSnap.exists) continue;
      const profile = profileSnap.data() as Profile;
      const tokens = (profile.fcmTokens ?? []).filter(Boolean);
      if (tokens.length === 0 || (profile.notifyHour ?? 6) !== hour) {
        report.skipped += 1;
        continue;
      }

      const sends: { ref: FirebaseFirestore.DocumentReference; title: string; body: string; url: string; tag: string }[] = [];

      const planRef = company.ref.collection('plans').doc(`${date}_${uid}`);
      const plan = await planRef.get();
      if (plan.exists && !plan.data()?.pushedAt) {
        sends.push({
          ref: planRef,
          title: 'Tu plan de hoy',
          body: String(plan.data()?.headline ?? ''),
          url: '/today',
          tag: `plan-${date}`,
        });
      }

      const followRef = company.ref.collection('followups').doc(`${date}_${uid}`);
      const follow = await followRef.get();
      if (follow.exists && !follow.data()?.pushedAt) {
        const messages = (follow.data()?.messages ?? []) as { id: string }[];
        const outcome = (follow.data()?.outcome ?? {}) as Record<string, string>;
        const pending = messages.filter((m) => !outcome[m.id]).length;
        if (pending > 0) {
          sends.push({
            ref: followRef,
            title: 'Seguimiento de hoy',
            body: pending === 1 ? '1 mensaje por enviar' : `${pending} mensajes por enviar`,
            url: '/follow-up',
            tag: `followup-${date}`,
          });
        }
      }

      for (const send of sends) {
        const result = await messaging.sendEachForMulticast({
          tokens,
          data: { title: send.title, body: send.body, url: send.url, tag: send.tag },
          apns: { headers: { 'apns-priority': '10' }, payload: { aps: { 'content-available': 1 } } },
          webpush: { headers: { Urgency: 'high' } },
        });
        report.sent += result.successCount;

        const dead = result.responses
          .map((r, i) => (r.success ? null : { token: tokens[i]!, code: r.error?.code ?? '' }))
          .filter((x): x is { token: string; code: string } => Boolean(x))
          // Gone, or never a token at all: either way it will never deliver.
          .filter((x) =>
            ['registration-token-not-registered', 'invalid-registration-token', 'invalid-argument'].some(
              (code) => x.code.includes(code),
            ),
          )
          .map((x) => x.token);
        if (dead.length > 0) {
          report.dead += dead.length;
          await profileSnap.ref.update({ fcmTokens: tokens.filter((t) => !dead.includes(t)) });
        }

        if (result.successCount > 0) {
          await send.ref.update({ pushedAt: new Date().toISOString() });
          report.details.push(`${uid.slice(0, 8)} ${send.tag}`);
        }
      }
    }
  }

  return NextResponse.json({ hour, date, ...report });
}
