import { NextResponse } from 'next/server';
import { adminCredentials, adminDb } from '../../../../server/admin';
import { runDaily } from '../../../../server/engine/run';

/**
 * The daily run, triggered by the systemd timer on the Pi at 02:00.
 *
 * Protected by a shared secret rather than a user session, because there is
 * no user at 02:00. The token lives in /etc/truenorth/env; without it the
 * route refuses, so nothing else on the tailnet can start a run by accident.
 *
 * Runs every company it finds. There is no queue: the timer waits for the
 * response, and a company that fails is reported and does not stop the others.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 1800;

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
  const only = url.searchParams.get('company');
  const date = url.searchParams.get('date') ?? undefined;

  const db = adminDb();
  const companies = only
    ? [only]
    : (await db.collection('companies').select().get()).docs.map((d) => d.id);

  const reports = [];
  for (const companyId of companies) {
    try {
      reports.push(await runDaily(companyId, date));
    } catch (cause) {
      reports.push({
        companyId,
        date: date ?? null,
        analysis: { ok: false, error: cause instanceof Error ? cause.message : String(cause) },
        plans: [],
        durationMs: 0,
      });
    }
  }

  const failed = reports.filter((r) => !r.analysis.ok).length;
  const skipped = reports.filter((r) => 'skipped' in r && r.skipped).length;
  return NextResponse.json({ companies: reports.length, skipped, failed, reports }, {
    status: failed === reports.length && reports.length > 0 ? 500 : 200,
  });
}
