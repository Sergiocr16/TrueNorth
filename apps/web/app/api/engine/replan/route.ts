import { NextResponse } from 'next/server';
import { adminAuth, adminCredentials, adminDb } from '../../../../server/admin';
import { replan } from '../../../../server/engine/run';

/**
 * "Recalcular mi plan", from the Today screen.
 *
 * The caller is a signed-in person, so this verifies their Firebase ID token
 * and then checks, with the Admin SDK, that they are actually a member of the
 * company they name. Only their own plan is recomputed, in the role they have
 * on or the one they name; the role's briefing of the day is reused when it
 * exists, and made along with the plan when it does not.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  const idToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!idToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  let body: { companyId?: string; roleId?: string };
  try {
    body = (await request.json()) as { companyId?: string; roleId?: string };
  } catch {
    body = {};
  }
  const companyId = body.companyId;
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });

  // The rules would refuse a non-member reading the company, but this path
  // runs with admin credentials, so the check is made explicitly here.
  const member = await adminDb()
    .collection('companies')
    .doc(companyId)
    .collection('members')
    .doc(uid)
    .get();
  if (!member.exists) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const report = await replan(companyId, uid, body.roleId);
    const plan = report.plans[0];
    if (!plan?.ok) {
      return NextResponse.json({ error: plan?.error ?? 'replan failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, durationMs: report.durationMs, usage: plan.usage });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
