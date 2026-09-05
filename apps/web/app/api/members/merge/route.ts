import { NextResponse } from 'next/server';
import { isFounder } from '@truenorth/core';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { mergePersonIntoAccount } from '../../../../server/members';

/**
 * Folds a member without an account into an account: same person, two
 * identities in Notion. Founders only, like everything that changes who an
 * account is.
 *
 *   POST /api/members/merge  { companyId, personId, uid }
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: { companyId?: string; personId?: string; uid?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const caller = await authorizeCaller(request, body.companyId ?? null, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isFounder(caller.email)) return NextResponse.json({ error: 'founders only' }, { status: 403 });
  if (!body.companyId || !body.personId || !body.uid || body.personId === body.uid) {
    return NextResponse.json({ error: 'personId and uid required' }, { status: 400 });
  }

  try {
    const result = await mergePersonIntoAccount(body.companyId, body.personId, body.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
