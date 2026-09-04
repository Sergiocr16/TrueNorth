import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { syncCompany } from '../../../../server/notion/sync';

/**
 * Runs the Notion sync for one company, now.
 *
 *   POST /api/notion/sync?company=<id>[&source=<id>][&full=1]
 *
 * Two callers: an admin of the company from the Integrations screen, with
 * their ID token; or the Pi's timer with the local shared secret. The daily
 * engine also calls the sync in-process before it captures, so a timer for
 * this route is optional — it only keeps the app fresh during the day.
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
    const reports = await syncCompany(companyId, {
      full: url.searchParams.get('full') === '1',
      only: url.searchParams.get('source') ?? undefined,
    });
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
