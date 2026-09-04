import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { regenerateFollowUp } from '../../../../server/engine/run';

/**
 * Today's team follow-up for one manager in one role, on demand.
 *
 * The nightly run writes the follow-up for the role each manager had on.
 * When they switch to another role and there is none for it yet, the
 * Follow-up screen offers to generate it, which lands here. Managers only:
 * a plain member has nobody to follow up with.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: { companyId?: string; roleId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const caller = await authorizeCaller(request, body.companyId ?? null, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!body.companyId || !caller.uid) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  try {
    const result = await regenerateFollowUp(body.companyId, caller.uid, body.roleId);
    if (!result.ok) return NextResponse.json({ error: result.error ?? 'failed' }, { status: 502 });
    return NextResponse.json({ ok: true, messages: result.messages, usage: result.usage });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
