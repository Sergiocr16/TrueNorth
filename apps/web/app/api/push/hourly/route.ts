import { NextResponse } from 'next/server';
import { TIME_ZONE, todayIso, type Locale } from '@truenorth/core';
import { getDictionary } from '../../../../lib/i18n/dictionary';
import { adminCredentials, adminDb } from '../../../../server/admin';
import { authorizedByLocalToken, sendToTokens } from '../../../../server/push';

/**
 * The morning alert, once per person per day, at the hour they chose.
 *
 * A systemd timer calls this every hour. It finds everybody whose `notifyHour`
 * is the current hour in Costa Rica, and who has a plan for today — in the
 * role they have on, since ADR-008 — that has not been announced yet, and
 * sends one push: the plan's headline. Managers with messages still to send
 * get a second one. Data-only payloads, so the service worker decides how
 * the notification looks and where it opens.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface Profile {
  notifyHour?: number;
  fcmTokens?: string[];
  locale?: Locale;
}

export async function POST(request: Request) {
  if (!authorizedByLocalToken(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  const url = new URL(request.url);
  const hour = Number(
    url.searchParams.get('hour') ??
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(
        new Date(),
      ),
  );
  const date = todayIso();

  const db = adminDb();
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
      // The role they have on: the plan and the follow-up are written per role.
      const roleIds = (member.get('roleIds') as string[] | undefined) ?? [];
      const roleId = (member.get('activeRoleId') as string | null | undefined) ?? roleIds[0] ?? null;
      if (tokens.length === 0 || (profile.notifyHour ?? 6) !== hour || !roleId) {
        report.skipped += 1;
        continue;
      }
      const t = getDictionary(profile.locale === 'en' ? 'en' : 'es');

      const sends: { ref: FirebaseFirestore.DocumentReference; title: string; body: string; url: string; tag: string }[] = [];

      const planRef = company.ref.collection('plans').doc(`${date}_${uid}_${roleId}`);
      const plan = await planRef.get();
      if (plan.exists && !plan.data()?.pushedAt) {
        sends.push({
          ref: planRef,
          title: t.push.planTitle,
          body: String(plan.data()?.headline ?? ''),
          url: '/today',
          tag: `plan-${date}`,
        });
      }

      const followRef = company.ref.collection('followups').doc(`${date}_${uid}_${roleId}`);
      const follow = await followRef.get();
      if (follow.exists && !follow.data()?.pushedAt) {
        const messages = (follow.data()?.messages ?? []) as { id: string }[];
        const outcome = (follow.data()?.outcome ?? {}) as Record<string, string>;
        const pending = messages.filter((m) => !outcome[m.id]).length;
        if (pending > 0) {
          sends.push({
            ref: followRef,
            title: t.push.followUpTitle,
            body: t.push.pending(pending),
            url: '/follow-up',
            tag: `followup-${date}`,
          });
        }
      }

      for (const send of sends) {
        const { ref, ...data } = send;
        const result = await sendToTokens(profileSnap.ref, tokens, data);
        report.sent += result.sent;
        report.dead += result.dead.length;
        if (result.sent > 0) {
          await ref.update({ pushedAt: new Date().toISOString() });
          report.details.push(`${uid.slice(0, 8)} ${send.tag} ${roleId}`);
        }
      }
    }
  }

  return NextResponse.json({ hour, date, ...report });
}
