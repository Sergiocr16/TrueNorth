import 'server-only';
import { adminBucket, adminDb } from './admin';

/**
 * Deleting a company, all of it.
 *
 * "Vaciar los datos" on the Settings screen leaves the company standing and
 * clears what the browser may write; it cannot touch what only the engine
 * writes (briefings, plans, follow-ups), nor the mirrors under other people's
 * user documents, nor the logo. This is the other thing: the company and
 * every trace of it, done with the Admin SDK because half of those pieces are
 * out of a client's reach by design. Owner only, from a route that checks so.
 *
 * Order matters for whoever is still signed in elsewhere: the mirrors go last,
 * so the company disappears from their switcher only once there is nothing
 * left behind it to open.
 */
export async function deleteCompany(companyId: string): Promise<{
  invites: number;
  mirrors: number;
  logoFiles: number;
}> {
  const db = adminDb();
  const ref = db.collection('companies').doc(companyId);

  // 1. The company document and every subcollection under it, recursively.
  await db.recursiveDelete(ref);

  // 2. Invitations into it: an invite to a company that no longer exists
  //    would still be redeemable as a member document pointing nowhere.
  const invites = await db.collection('invites').where('companyId', '==', companyId).get();
  for (const invite of invites.docs) await invite.ref.delete();

  // 3. The logo. The upload route writes under logos/{companyId}/.
  let logoFiles = 0;
  try {
    const [files] = await adminBucket().getFiles({ prefix: `logos/${companyId}/` });
    logoFiles = files.length;
    if (files.length > 0) await adminBucket().deleteFiles({ prefix: `logos/${companyId}/` });
  } catch {
    // A missing bucket or a Storage hiccup should not leave the company half
    // deleted; the object is an orphan at worst.
  }

  // 4. The mirrors under every user, which is what the switcher lists. There
  //    is no index across users/{uid}/memberships by document id, and the
  //    roster is small, so walk it.
  let mirrors = 0;
  const users = await db.collection('users').get();
  for (const user of users.docs) {
    const mirror = user.ref.collection('memberships').doc(companyId);
    if ((await mirror.get()).exists) {
      await mirror.delete();
      mirrors += 1;
    }
  }

  return { invites: invites.size, mirrors, logoFiles };
}
