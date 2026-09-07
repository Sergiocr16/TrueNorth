import { NextResponse } from 'next/server';
import { dueReminders, minutesUntil, type Locale, type Reminder } from '@truenorth/core';
import { getDictionary } from '../../../../lib/i18n/dictionary';
import { adminCredentials, adminDb } from '../../../../server/admin';
import { authorizedByLocalToken, sendToTokens } from '../../../../server/push';

/**
 * Personal reminders, a few minutes before their time.
 *
 * A systemd timer calls this every minute. For every person with a device
 * subscribed, it takes the reminders that are due now — from `leadMinutes`
 * before their time until a few minutes after, and never later than that —
 * claims each one by writing `notifiedAt` in a transaction, and only then
 * sends the push. Claiming first means two runs can never send the same
 * reminder twice; a push lost to the network is the price, and it shows in
 * the report.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 55;

interface Profile {
  fcmTokens?: string[];
  locale?: Locale;
  reminders?: Reminder[];
}

export async function POST(request: Request) {
  if (!authorizedByLocalToken(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  // `?now=` is for trying the route by hand; the timer never passes it.
  const url = new URL(request.url);
  const forced = url.searchParams.get('now');
  const now = forced ? new Date(forced) : new Date();
  if (Number.isNaN(now.getTime())) return NextResponse.json({ error: 'bad now' }, { status: 400 });

  const db = adminDb();
  const report = { now: now.toISOString(), checked: 0, sent: 0, skipped: 0, dead: 0, details: [] as string[] };

  const users = await db.collection('users').get();
  for (const snap of users.docs) {
    const profile = snap.data() as Profile;
    const tokens = (profile.fcmTokens ?? []).filter(Boolean);
    const reminders = Array.isArray(profile.reminders) ? profile.reminders : [];
    if (tokens.length === 0 || reminders.length === 0) continue;
    report.checked += 1;
    const t = getDictionary(profile.locale === 'en' ? 'en' : 'es');

    for (const due of dueReminders(reminders, now)) {
      // Claim it: re-read, and give up if it is gone, done, already claimed
      // by another run, or moved since this one read it.
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        const list = (fresh.data()?.reminders ?? []) as Reminder[];
        const index = list.findIndex((r) => r.id === due.id);
        const current = list[index];
        if (!current || current.doneAt || current.notifiedAt) return null;
        if (current.date !== due.date || current.time !== due.time) return null;
        const next = [...list];
        next[index] = { ...current, notifiedAt: now.toISOString() };
        tx.update(snap.ref, { reminders: next });
        return next[index];
      });
      if (!claimed) {
        report.skipped += 1;
        continue;
      }

      const body = `${t.reminders.pushBody(claimed.time, minutesUntil(claimed, now))}${claimed.note ? ` — ${claimed.note}` : ''}`;
      const result = await sendToTokens(snap.ref, tokens, {
        title: claimed.title,
        body,
        url: '/reminders',
        tag: `reminder-${claimed.id}`,
      });
      report.sent += result.sent;
      report.dead += result.dead.length;
      report.details.push(`${snap.id.slice(0, 8)} ${claimed.id} ${result.sent > 0 ? 'sent' : 'lost'}`);
    }
  }

  return NextResponse.json(report);
}
