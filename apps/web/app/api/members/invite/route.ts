import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { isFounder } from '@truenorth/core';
import { adminAuth, adminCredentials, adminDb, authorizeCaller } from '../../../../server/admin';
import { linkAccountToCompany } from '../../../../server/members';
import { temporaryPassword } from '../../../../server/password';

/**
 * Shares the app with somebody, account included.
 *
 *   POST /api/members/invite  { companyId, email, roleIds, access }
 *
 * An invitation on its own is not enough to let a person in: it is redeemed on
 * their first sign-in, and signing in needs an account that, until now, an
 * admin had to go and create in the Firebase console. Nobody on this team has
 * that console open, so the invitation sat there and the person never got in.
 *
 * So the account is created here, with a password shown once to the admin who
 * pressed the button and never stored anywhere. An address that already has an
 * account keeps its password: this route hands out a first key, it does not
 * reset an existing one, or an admin could take over any account by inviting
 * its address.
 *
 * The membership is written here too, not left for the person to redeem at
 * sign-in. They are in the team from this moment, marked as having an account,
 * and whatever the Notion sync already knew about them — their name, their
 * tasks, what is expected of them — comes along instead of turning into a
 * second, emptier copy of the same person. `personId` names that person
 * explicitly: the sync knows people by the address Notion has for them,
 * which is rarely the one the account gets.
 *
 * Founders only. Sharing a company is every member's call; creating the
 * account that lets somebody into the app is not.
 */

export const dynamic = 'force-dynamic';

interface Body {
  companyId?: string;
  email?: string;
  roleIds?: string[];
  access?: 'owner' | 'admin' | 'member';
  /** A member without an account (`p_…`) this account is for. */
  personId?: string;
}

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const companyId = body.companyId ?? null;
  const caller = await authorizeCaller(request, companyId, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  if (!isFounder(caller.email)) {
    return NextResponse.json({ error: 'founders only' }, { status: 403 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }
  const access = body.access ?? 'member';
  if (access !== 'owner' && access !== 'admin' && access !== 'member') {
    return NextResponse.json({ error: 'invalid access' }, { status: 400 });
  }
  const roleIds = Array.isArray(body.roleIds) ? body.roleIds.filter((id) => typeof id === 'string') : [];

  const db = adminDb();
  const base = db.collection('companies').doc(companyId);

  // The invite carries the company and role names so the sign-in screen can
  // say what is being joined before the person has read access to any of it.
  const [companySnap, roleSnaps] = await Promise.all([
    base.get(),
    base.collection('roles').get(),
  ]);
  const roleName = new Map(roleSnaps.docs.map((doc) => [doc.id, String(doc.data().name ?? '')]));
  const roleTitle = roleIds
    .map((id) => roleName.get(id))
    .filter((name): name is string => Boolean(name))
    .join(' · ');

  // The account first: everything after it is about a uid.
  let password: string | null = null;
  let created = false;
  let uid: string;
  try {
    uid = (await adminAuth().getUserByEmail(email)).uid;
  } catch (cause) {
    if ((cause as { code?: string }).code !== 'auth/user-not-found') {
      return NextResponse.json(
        { error: cause instanceof Error ? cause.message : String(cause) },
        { status: 500 },
      );
    }
    password = temporaryPassword();
    try {
      uid = (await adminAuth().createUser({ email, password, emailVerified: false })).uid;
      created = true;
    } catch (failure) {
      return NextResponse.json(
        { error: failure instanceof Error ? failure.message : String(failure) },
        { status: 500 },
      );
    }
  }

  const companyName = String(companySnap.data()?.name ?? '');
  const link = await linkAccountToCompany(companyId, uid, {
    email,
    roleIds,
    roleTitle,
    access,
    companyName,
    personId: typeof body.personId === 'string' && body.personId ? body.personId : undefined,
  });

  // A spent invitation left lying around is redeemed on the next sign-in and
  // writes the membership a second time, so it goes now that there is nothing
  // left to redeem.
  await db.collection('invites').doc(email).delete().catch(() => undefined);

  // `password` is null whenever the account already existed, which is what
  // tells the screen to say "this address already has one" instead of showing
  // a key that would not work.
  return NextResponse.json({ ok: true, email, created, password, ...link });
}
