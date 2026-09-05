import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { NotionError } from '../../../../server/notion/client';
import { listTables } from '../../../../server/notion/inspect';

/**
 * Every Notion table the integration can see, for the picker on the
 * Integrations screen. Nothing is registered here: this is the list somebody
 * chooses from, so they never have to paste a link.
 *
 * The list is exactly what has been shared with the integration in Notion. A
 * database missing from it was never shared, which is also why it could not
 * be read even if its link were pasted.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: { companyId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const caller = await authorizeCaller(request, body.companyId ?? null, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  try {
    return NextResponse.json({ tables: await listTables() });
  } catch (cause) {
    if (cause instanceof NotionError) {
      return NextResponse.json(
        { error: cause.message, code: cause.code },
        { status: cause.status === 0 ? 503 : 502 },
      );
    }
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
