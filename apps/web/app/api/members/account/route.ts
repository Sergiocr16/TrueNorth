import { NextResponse } from 'next/server';
import { isFounder } from '@truenorth/core';
import { adminAuth, adminCredentials, adminDb, authorizeCaller } from '../../../../server/admin';
import { detachAccountFromCompany, renameAccount } from '../../../../server/members';
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
 *   rename            — a new display name, on the account, the user document
 *                       and every member document.
 *
 * Founders do all of this to anybody; a person may rename themselves, and
 * nothing else here is done to one's own account.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Action = 'disable' | 'enable' | 'resetPassword' | 'delete' | 'rename';

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: { companyId?: string; uid?: string; action?: Action; displayName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const caller = await authorizeCaller(request, body.companyId ?? null);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const uid = body.uid ?? '';
  const action = body.action;
  if (!uid || !action || !['disable', 'enable', 'resetPassword', 'delete', 'rename'].includes(action)) {
    return NextResponse.json({ error: 'uid and action required' }, { status: 400 });
  }
  const self = uid === caller.uid;
  if (action === 'rename') {
    if (!self && !isFounder(caller.email)) {
      return NextResponse.json({ error: 'founders only' }, { status: 403 });
    }
    const displayName = (body.displayName ?? '').trim();
    if (displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    }
    try {
      const companies = await renameAccount(uid, displayName);
      return NextResponse.json({ ok: true, displayName, companies });
    } catch (cause) {
      return NextResponse.json(
        { error: cause instanceof Error ? cause.message : String(cause) },
        { status: 500 },
      );
    }
  }
  if (!isFounder(caller.email)) return NextResponse.json({ error: 'founders only' }, { status: 403 });
  if (self) return NextResponse.json({ error: 'not your own account' }, { status: 400 });

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
