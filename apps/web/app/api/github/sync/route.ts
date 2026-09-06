import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { githubSyncInFlight, syncGithub } from '../../../../server/github/sync';

/**
 * Runs the GitHub sync now: every registered repository of the company, or
 * one. Admins from the screen, and the Pi's timer with the local token, after
 * the Notion sync so task codes resolve.
 *
 *   POST /api/github/sync?company=<id>[&repo=<id>][&full=1][&wait=1]
 *
 * Without `wait` the answer is immediate — 202, whether this call started
 * the run or one was already going — and the run carries on in the server;
 * the screen follows it on `integrations/github` (`syncStartedAt`,
 * `lastRun`). A first read of a busy repository takes minutes, longer than
 * a browser keeps a request open. The timer passes `wait=1` so the reports
 * land in its log.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  const url = new URL(request.url);
  const companyId = url.searchParams.get('company');
  const caller = await authorizeCaller(request, companyId, { admin: true, allowLocalToken: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!companyId) return NextResponse.json({ error: 'company required' }, { status: 400 });

  try {
    const joined = githubSyncInFlight(companyId) !== null;
    const run = syncGithub(companyId, {
      full: url.searchParams.get('full') === '1',
      only: url.searchParams.get('repo') ?? undefined,
    });
    if (url.searchParams.get('wait') !== '1') {
      // The run writes its own outcome; nobody is waiting for this promise.
      run.catch(() => undefined);
      return NextResponse.json({ ok: true, started: !joined }, { status: 202 });
    }
    const reports = await run;
    const failed = reports.filter((r) => r.error).length;
    return NextResponse.json(
      { ok: failed === 0, reports },
      { status: failed > 0 && failed === reports.length ? 502 : 200 },
    );
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
