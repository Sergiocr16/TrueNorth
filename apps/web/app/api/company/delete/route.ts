import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { deleteCompany } from '../../../../server/company';

/**
 * Deletes a company and everything under it. Owner only: an admin can empty
 * a company from the browser, but ending it is the owner's call alone.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  if (caller.access !== 'owner') {
    return NextResponse.json({ error: 'owner only' }, { status: 403 });
  }

  try {
    const result = await deleteCompany(body.companyId as string);
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
