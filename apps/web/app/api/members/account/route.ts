import { NextResponse } from 'next/server';
import { isFounder } from '@truenorth/core';
import { adminAuth, adminCredentials, adminDb, authorizeCaller } from '../../../../server/admin';
import { detachAccountFromCompany } from '../../../../server/members';
import { temporaryPassword } from '../../../../server/password';

/**
 * What can be done to an account from the Team screen, founders only.
 *
 *   POST /api/members/account  { companyId, uid, action }
 *
 *   disable / enable  — the account cannot or can sign in; the person stays
 *                       on the team either way, and the member documents
 *                       carry `disabled` so the screen can say so.
 *   resetPassword     — a new temporary password, shown once like the first.
 *   delete            — the Firebase account, its user document and every
 *                       membership go; in each company the person either
 *                       stays on the team without an account (when records
 *                       still name them) or leaves it.
 *
 * Nobody does any of this to their own account from here.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Action = 'disable' | 'enable' | 'resetPassword' | 'delete';

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: { companyId?: string; uid?: string; action?: Action };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const caller = await authorizeCaller(request, body.companyId ?? null, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isFounder(caller.email)) return NextResponse.json({ error: 'founders only' }, { status: 403 });

  const uid = body.uid ?? '';
  const action = body.action;
  if (!uid || !action || !['disable', 'enable', 'resetPassword', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'uid and action required' }, { status: 400 });
  }
  if (uid === caller.uid) return NextResponse.json({ error: 'not your own account' }, { status: 400 });

  const db = adminDb();
  const auth = adminAuth();

  // Every company this account belongs to, from the mirror that lists them.
  const memberships = await db.collection('users').doc(uid).collection('memberships').get();
  const companyIds = memberships.docs.map((d) => d.id);

  try {
    if (action === 'disable' || action === 'enable') {
      const disabled = action === 'disable';
      await auth.updateUser(uid, { disabled });
      if (disabled) await auth.revokeRefreshTokens(uid);
      for (const companyId of companyIds) {
        await db
          .collection('companies')
          .doc(companyId)
          .collection('members')
          .doc(uid)
          .set({ disabled }, { merge: true });
      }
      return NextResponse.json({ ok: true, disabled });
    }

    if (action === 'resetPassword') {
      const password = temporaryPassword();
      await auth.updateUser(uid, { password });
      await auth.revokeRefreshTokens(uid);
      const user = await auth.getUser(uid);
      return NextResponse.json({ ok: true, email: user.email ?? '', password });
    }

    // delete
    let kept = 0;
    for (const companyId of companyIds) {
      const result = await detachAccountFromCompany(companyId, uid);
      if (result.kept) kept += 1;
    }
    await db.recursiveDelete(db.collection('users').doc(uid));
    await auth.deleteUser(uid).catch((cause: { code?: string }) => {
      if (cause.code !== 'auth/user-not-found') throw cause;
    });
    return NextResponse.json({ ok: true, deleted: true, keptOnTeamIn: kept });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
