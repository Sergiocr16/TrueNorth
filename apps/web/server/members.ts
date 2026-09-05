import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './admin';

/**
 * Giving a person's records to their new account.
 *
 * The rules key every permission off `companies/{id}/members/{uid}`, so the
 * document that represents a person has to be named after their Firebase uid
 * the moment they have one. Before that they are named `p_…`: the Notion sync
 * creates a member for every name it finds on a task, which is how *Equipo*
 * and *Seguimiento* work for people who have never opened the app.
 *
 * So handing somebody an account is a rename, and a rename has to take the
 * references with it. Otherwise the person appears twice — once with their
 * tasks and no account, once with an account and nothing to do — which is
 * exactly what happened when the invitation was redeemed at sign-in and simply
 * wrote a second member document.
 *
 * The day's plans, follow-ups and analyses are not rewritten. Their ids carry
 * the uid and the date, they are recomputed every morning, and yesterday's are
 * read by nobody.
 */

/** Every place inside a company that names a person. */
const REFERENCES = [
  { collection: 'tasks', field: 'assigneeUserIds', array: true },
  { collection: 'projects', field: 'memberUserIds', array: true },
  { collection: 'projects', field: 'ownerUserId', array: false },
  { collection: 'objectives', field: 'ownerUserId', array: false },
  { collection: 'risks', field: 'ownerUserId', array: false },
  { collection: 'situations', field: 'userId', array: false },
] as const;

/** A batch holds 500 operations; a person can easily own more tasks than that. */
const BATCH = 400;

function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  return (first[0] + (words[1]?.[0] ?? '')).toUpperCase();
}

export async function repoint(db: Firestore, companyId: string, from: string, to: string): Promise<number> {
  const base = db.collection('companies').doc(companyId);
  let moved = 0;
  for (const reference of REFERENCES) {
    const snap = await base
      .collection(reference.collection)
      .where(reference.field, reference.array ? 'array-contains' : '==', from)
      .get();
    for (let index = 0; index < snap.docs.length; index += BATCH) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(index, index + BATCH)) {
        if (reference.array) {
          // Swapped in place rather than removed and appended: on a task with
          // several responsible people the order is the order Notion had them,
          // and the first one is the one the app calls the owner.
          const current = (doc.get(reference.field) as string[] | undefined) ?? [];
          const next = current.map((id) => (id === from ? to : id));
          batch.update(doc.ref, { [reference.field]: [...new Set(next)] });
        } else {
          batch.update(doc.ref, { [reference.field]: to });
        }
        moved += 1;
      }
      await batch.commit();
    }
  }
  return moved;
}

export interface LinkResult {
  /** True when a `p_…` member existed for this address and became the account. */
  merged: boolean;
  /** Documents whose reference to the old id was rewritten. */
  repointed: number;
}

/**
 * Makes `uid` a member of the company, absorbing whatever placeholder already
 * stood for that address. Runs with the Admin SDK, so the caller must have
 * checked that whoever asked is an admin of this company.
 */
export async function linkAccountToCompany(
  companyId: string,
  uid: string,
  invite: {
    email: string;
    roleIds: string[];
    roleTitle: string;
    access: string;
    companyName: string;
    /** The member without an account this account is for, when the admin said so. */
    personId?: string;
  },
): Promise<LinkResult> {
  const db = adminDb();
  const base = db.collection('companies').doc(companyId);
  const members = base.collection('members');

  const [mine, sameEmail, named] = await Promise.all([
    members.doc(uid).get(),
    members.where('email', '==', invite.email).get(),
    invite.personId && invite.personId !== uid ? members.doc(invite.personId).get() : null,
  ]);
  // The person named on the form wins; the address is the fallback the sync
  // can sometimes satisfy on its own. Never absorb somebody who already has
  // an account: that would hand one person's work to another.
  const placeholder =
    named?.exists && named.get('hasAccount') === false
      ? named
      : sameEmail.docs.find((doc) => doc.id !== uid && doc.get('hasAccount') !== true);
  const previous = { ...(placeholder?.data() ?? {}), ...(mine.data() ?? {}) };

  const displayName =
    (previous.displayName as string | undefined) || invite.email.split('@')[0] || 'Sin nombre';

  await members.doc(uid).set(
    {
      // What the person already was — their name, what is expected of them, the
      // Notion identity the sync matched — survives the rename. Only what the
      // invitation decides is overwritten.
      ...previous,
      displayName,
      email: invite.email,
      initials: (previous.initials as string | undefined) || initialsFrom(displayName),
      roleTitle: invite.roleTitle,
      roleIds: invite.roleIds,
      activeRoleId: invite.roleIds[0] ?? null,
      access: invite.access,
      hasAccount: true,
    },
    { merge: true },
  );

  let repointed = 0;
  if (placeholder) {
    repointed = await repoint(db, companyId, placeholder.id, uid);
    await placeholder.ref.delete();
  }

  // The mirror the company switcher reads. Without it the person signs in and
  // the app finds no company, which looks exactly like not being invited.
  await db.collection('users').doc(uid).collection('memberships').doc(companyId).set({
    companyName: invite.companyName,
    roleTitle: invite.roleTitle,
    access: invite.access,
  });

  return { merged: Boolean(placeholder), repointed };
}

/** How many records in the company still name this person. */
async function referencesTo(db: Firestore, companyId: string, id: string): Promise<number> {
  const base = db.collection('companies').doc(companyId);
  let total = 0;
  for (const reference of REFERENCES) {
    const snap = await base
      .collection(reference.collection)
      .where(reference.field, reference.array ? 'array-contains' : '==', id)
      .count()
      .get();
    total += snap.data().count;
  }
  return total;
}

export interface DetachResult {
  /** True when the person stayed on the team under a new id; false when nothing named them and they simply left. */
  kept: boolean;
  repointed: number;
}

/**
 * The reverse of linking: the account goes, the person may stay.
 *
 * A member document is named after the uid, so deleting the account has to
 * rename it. If anything in the company still names this person — tasks,
 * projects, a situation — they become a member without an account under a
 * synthetic id, references repointed, so the follow-up does not lose them.
 * If nothing does, the document is simply removed: there was no person
 * behind the account worth keeping.
 */
export async function detachAccountFromCompany(companyId: string, uid: string): Promise<DetachResult> {
  const db = adminDb();
  const base = db.collection('companies').doc(companyId);
  const current = await base.collection('members').doc(uid).get();
  if (!current.exists) return { kept: false, repointed: 0 };

  const references = await referencesTo(db, companyId, uid);
  let repointed = 0;
  let kept = false;
  if (references > 0) {
    const personId = `p_${uid}`;
    const data = current.data() ?? {};
    await base
      .collection('members')
      .doc(personId)
      .set({ ...data, hasAccount: false, disabled: false, access: 'member', activeRoleId: null });
    repointed = await repoint(db, companyId, uid, personId);
    kept = true;
  }
  await current.ref.delete();
  await db.collection('users').doc(uid).collection('memberships').doc(companyId).delete().catch(() => undefined);
  return { kept, repointed };
}

/**
 * A new display name, everywhere it is written: the Firebase account, the
 * user document, and the member document in every company — which is what
 * the screens read, because a member may not read anyone else's user
 * document. Initials follow the name.
 */
export async function renameAccount(uid: string, displayName: string): Promise<number> {
  const db = adminDb();
  const name = displayName.trim();
  const initials = initialsFrom(name);
  await adminAuth().updateUser(uid, { displayName: name });
  await db.collection('users').doc(uid).set({ displayName: name }, { merge: true });
  const memberships = await db.collection('users').doc(uid).collection('memberships').get();
  let companies = 0;
  for (const mirror of memberships.docs) {
    const member = db.collection('companies').doc(mirror.id).collection('members').doc(uid);
    if ((await member.get()).exists) {
      await member.set({ displayName: name, initials }, { merge: true });
      companies += 1;
    }
  }
  return companies;
}

export interface MergeResult {
  repointed: number;
  notionUserIds: string[];
}

/**
 * Two members that are one person: a placeholder the sync created from a
 * Notion identity, and an account. Everything the placeholder was named on
 * moves to the account, the account learns the placeholder's Notion identity
 * on top of its own — so the next sync resolves that identity to the account
 * instead of creating the placeholder again — and the placeholder goes.
 * Whatever the account already says about itself wins; the placeholder only
 * fills what is empty.
 */
export async function mergePersonIntoAccount(
  companyId: string,
  personId: string,
  uid: string,
): Promise<MergeResult> {
  const db = adminDb();
  const members = db.collection('companies').doc(companyId).collection('members');
  const [person, account] = await Promise.all([members.doc(personId).get(), members.doc(uid).get()]);
  if (!person.exists) throw new Error('person not found');
  if (!account.exists) throw new Error('account not found');
  if (person.get('hasAccount') === true) throw new Error('that member has an account');

  const p = person.data() ?? {};
  const a = account.data() ?? {};
  const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x) => typeof x === 'string') : []);
  const notionUserIds = [
    ...new Set(
      [a.notionUserId, ...ids(a.notionUserIds), p.notionUserId, ...ids(p.notionUserIds)].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ];

  await members.doc(uid).set(
    {
      notionUserId: notionUserIds[0] ?? null,
      notionUserIds,
      ...(!a.expectations && p.expectations ? { expectations: p.expectations } : {}),
      ...(!a.roleDescription && p.roleDescription ? { roleDescription: p.roleDescription } : {}),
      ...(ids(a.roleIds).length === 0 && ids(p.roleIds).length > 0
        ? { roleIds: ids(p.roleIds), activeRoleId: ids(p.roleIds)[0] }
        : {}),
    },
    { merge: true },
  );
  const repointed = await repoint(db, companyId, personId, uid);
  await person.ref.delete();
  return { repointed, notionUserIds };
}
