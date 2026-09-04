import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Security rules, exercised against the emulator.
 *
 * These are the tests the whole access model rests on. Two of them are the
 * reason firestore.rules exists at all: nobody reads another company, and
 * nobody reads a private project they are not a member of. The rest cover the
 * bootstrap and invitation paths, which are easy to get subtly wrong — the
 * first version of the bootstrap wrote everything in one batch and failed,
 * because rules evaluate against the database as it is, not as the batch will
 * leave it.
 *
 * Run with the emulator up:
 *   npx firebase-tools emulators:exec --only firestore "pnpm --filter @truenorth/core test"
 */

const FOUNDER = 'sergio@aditumcr.com';
const rulesPath = resolve(import.meta.dirname, '../../../firestore.rules');

let env: RulesTestEnvironment;

/** A signed-in context with an email claim, which the rules depend on. */
function as(uid: string, email: string, verified = true) {
  return env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'truenorth-rules-test',
    firestore: {
      rules: readFileSync(rulesPath, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

/** Puts a company and one owner in place, bypassing rules. */
async function seedCompany(companyId = 'c1', ownerUid = 'u_owner') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`companies/${companyId}`).set({ createdBy: ownerUid, name: 'ADITUM' });
    await db.doc(`companies/${companyId}/members/${ownerUid}`).set({
      displayName: 'Sergio',
      email: FOUNDER,
      initials: 'SC',
      roleTitle: 'CTO',
      roleDescription: '',
      access: 'owner',
    });
  });
}

describe('bootstrap', () => {
  it('lets a founder create a company that records them as its creator', async () => {
    const db = as('u1', FOUNDER);
    await assertSucceeds(db.doc('companies/c1').set({ createdBy: 'u1', name: 'ADITUM' }));
  });

  it('matches the founder list regardless of the casing they signed up with', async () => {
    const db = as('u1', 'Sergio@AditumCR.com');
    await assertSucceeds(db.doc('companies/c1').set({ createdBy: 'u1', name: 'ADITUM' }));
  });

  it('refuses a company to anybody who is not a founder', async () => {
    const db = as('u2', 'alguien@ejemplo.com');
    await assertFails(db.doc('companies/c1').set({ createdBy: 'u2', name: 'Mía' }));
  });

  it('refuses a company created in somebody else’s name', async () => {
    const db = as('u1', FOUNDER);
    await assertFails(db.doc('companies/c1').set({ createdBy: 'u2', name: 'ADITUM' }));
  });

  it('lets the creator add themselves as the first member', async () => {
    const db = as('u1', FOUNDER);
    await db.doc('companies/c1').set({ createdBy: 'u1', name: 'ADITUM' });
    await assertSucceeds(
      db.doc('companies/c1/members/u1').set({ roleTitle: 'CTO', access: 'owner' }),
    );
  });

  it('refuses a stranger adding themselves to a company they did not create', async () => {
    await seedCompany();
    const db = as('u_intruder', 'intruso@ejemplo.com');
    await assertFails(
      db.doc('companies/c1/members/u_intruder').set({ roleTitle: 'CTO', access: 'owner' }),
    );
  });

  it('accepts the starting data once the member document exists', async () => {
    const db = as('u1', FOUNDER);
    await db.doc('companies/c1').set({ createdBy: 'u1', name: 'ADITUM' });
    await db.doc('companies/c1/members/u1').set({ roleTitle: 'CTO', access: 'owner' });

    // This is the step that failed when the whole bootstrap was one batch.
    await assertSucceeds(db.doc('companies/c1/objectives/o1').set({ title: 'Meta' }));
    await assertSucceeds(
      db.doc('companies/c1/projects/p1').set({ name: 'Proyecto', visibility: 'company' }),
    );
    await assertSucceeds(db.doc('companies/c1/tasks/t1').set({ title: 'Tarea' }));
    // A plan is not starting data: only the engine writes one, so a person
    // seeding their own is refused — that is what keeps Today honest.
    await assertFails(db.doc('companies/c1/plans/d_u1').set({ uid: 'u1', items: [] }));
  });
});

describe('company isolation', () => {
  it('refuses reading a company you do not belong to', async () => {
    await seedCompany();
    const db = as('u_outsider', 'fuera@ejemplo.com');
    await assertFails(db.doc('companies/c1').get());
  });

  it('refuses reading the objectives of a company you do not belong to', async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('companies/c1/objectives/o1').set({ title: 'Meta' });
    });
    const db = as('u_outsider', 'fuera@ejemplo.com');
    await assertFails(db.doc('companies/c1/objectives/o1').get());
  });

  it('lets a member read their own company', async () => {
    await seedCompany();
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(db.doc('companies/c1').get());
  });
});

describe('private projects', () => {
  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/members/u_peer').set({
        displayName: 'Marco',
        email: 'marco@aditumcr.com',
        roleTitle: 'Desarrollo',
        access: 'member',
      });
      await db.doc('companies/c1/projects/p_private').set({
        name: 'Privado',
        visibility: 'private',
        memberUserIds: ['u_owner'],
      });
      await db.doc('companies/c1/projects/p_open').set({
        name: 'Abierto',
        visibility: 'company',
        memberUserIds: ['u_owner'],
      });
    });
  });

  it('hides a private project from a member who is not on it', async () => {
    const db = as('u_peer', 'marco@aditumcr.com');
    await assertFails(db.doc('companies/c1/projects/p_private').get());
  });

  it('shows a private project to somebody who is on it', async () => {
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(db.doc('companies/c1/projects/p_private').get());
  });

  it('shows a company-wide project to any member', async () => {
    const db = as('u_peer', 'marco@aditumcr.com');
    await assertSucceeds(db.doc('companies/c1/projects/p_open').get());
  });

  // Rules are not filters: a rule that inspects the document rejects any query
  // it cannot prove safe. These three pin the contract between the read rule
  // and the two queries the app issues, which is what broke in the first
  // version — an unfiltered listener took down the whole screen.
  it('refuses an unfiltered listener on the projects collection', async () => {
    await assertFails(as('u_owner', FOUNDER).collection('companies/c1/projects').get());
  });

  it('accepts the company-wide projects query the app issues', async () => {
    await assertSucceeds(
      as('u_owner', FOUNDER)
        .collection('companies/c1/projects')
        .where('visibility', '==', 'company')
        .get(),
    );
  });

  it('accepts the my-projects query the app issues', async () => {
    await assertSucceeds(
      as('u_owner', FOUNDER)
        .collection('companies/c1/projects')
        .where('memberUserIds', 'array-contains', 'u_owner')
        .get(),
    );
  });
});

describe('invitations', () => {
  beforeEach(async () => {
    await seedCompany();
  });

  it('lets a member invite somebody at their own level', async () => {
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(
      db.doc('invites/marco@aditumcr.com').set({
        email: 'marco@aditumcr.com',
        companyId: 'c1',
        companyName: 'ADITUM',
        roleTitle: 'Desarrollo',
        access: 'member',
        invitedBy: 'u_owner',
      }),
    );
  });

  it('refuses an invitation from somebody outside the company', async () => {
    const db = as('u_outsider', 'fuera@ejemplo.com');
    await assertFails(
      db.doc('invites/otro@ejemplo.com').set({
        email: 'otro@ejemplo.com',
        companyId: 'c1',
        companyName: 'ADITUM',
        roleTitle: 'Desarrollo',
        access: 'member',
        invitedBy: 'u_outsider',
      }),
    );
  });

  it('refuses a plain member handing out admin access', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('companies/c1/members/u_peer').set({ access: 'member' });
    });
    const db = as('u_peer', 'marco@aditumcr.com');
    await assertFails(
      db.doc('invites/nuevo@ejemplo.com').set({
        email: 'nuevo@ejemplo.com',
        companyId: 'c1',
        companyName: 'ADITUM',
        roleTitle: 'Jefe',
        access: 'admin',
        invitedBy: 'u_peer',
      }),
    );
  });

  it('lets only the addressee read their invitation', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/marco@aditumcr.com').set({
        email: 'marco@aditumcr.com',
        companyId: 'c1',
        access: 'member',
      });
    });
    await assertSucceeds(as('u_peer', 'marco@aditumcr.com').doc('invites/marco@aditumcr.com').get());
    await assertFails(as('u_x', 'otro@ejemplo.com').doc('invites/marco@aditumcr.com').get());
  });

  it('lets a verified invitee join, and refuses an unverified one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('invites/marco@aditumcr.com').set({
        email: 'marco@aditumcr.com',
        companyId: 'c1',
        access: 'member',
      });
    });

    // With password sign-in anyone can type any address, so an unconfirmed
    // account must not be able to redeem somebody else's invitation.
    await assertFails(
      as('u_fake', 'marco@aditumcr.com', false)
        .doc('companies/c1/members/u_fake')
        .set({ roleTitle: 'Desarrollo', access: 'member' }),
    );

    await assertSucceeds(
      as('u_peer', 'marco@aditumcr.com')
        .doc('companies/c1/members/u_peer')
        .set({ roleTitle: 'Desarrollo', access: 'member' }),
    );
  });
});

describe('plans', () => {
  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/members/u_peer').set({ access: 'member' });
      await db.doc('companies/c1/plans/d_u_owner').set({ uid: 'u_owner', feedback: {} });
    });
  });

  it('keeps a plan private to the person it is for', async () => {
    await assertFails(as('u_peer', 'marco@aditumcr.com').doc('companies/c1/plans/d_u_owner').get());
    await assertSucceeds(as('u_owner', FOUNDER).doc('companies/c1/plans/d_u_owner').get());
  });

  it('allows feedback but not rewriting the plan', async () => {
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(
      db.doc('companies/c1/plans/d_u_owner').update({ feedback: { 0: 'done' } }),
    );
    await assertFails(db.doc('companies/c1/plans/d_u_owner').update({ headline: 'Otra cosa' }));
  });
});

describe('people without an account', () => {
  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('companies/c1/members/u_peer').set({ access: 'member' });
    });
  });

  // A team member with no account is a member document under a made-up id.
  // Admins may create one; nobody can sign in as it, because no uid matches.
  it('lets an admin add somebody who does not use the app', async () => {
    await assertSucceeds(
      as('u_owner', FOUNDER)
        .doc('companies/c1/members/p_abc123')
        .set({ displayName: 'Marco', roleTitle: 'Desarrollo', access: 'member', hasAccount: false }),
    );
  });

  it('refuses a plain member adding people', async () => {
    await assertFails(
      as('u_peer', 'marco@aditumcr.com')
        .doc('companies/c1/members/p_abc123')
        .set({ displayName: 'Marco', roleTitle: 'Desarrollo', access: 'member', hasAccount: false }),
    );
  });
});

describe('situations', () => {
  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/members/u_peer').set({ access: 'member' });
      await db.doc('companies/c1/situations/s1').set({
        userId: 'u_peer',
        kind: 'personal',
        note: 'Semana difícil en la casa',
        discreet: true,
      });
    });
  });

  // The whole feature rests on this one: a note about somebody must not be
  // readable by their peers, and least of all by them.
  it('keeps a private note away from ordinary members', async () => {
    await assertFails(
      as('u_peer', 'marco@aditumcr.com').doc('companies/c1/situations/s1').get(),
    );
    await assertSucceeds(as('u_owner', FOUNDER).doc('companies/c1/situations/s1').get());
  });

  it('refuses a member writing one', async () => {
    await assertFails(
      as('u_peer', 'marco@aditumcr.com')
        .doc('companies/c1/situations/s2')
        .set({ userId: 'u_owner', kind: 'desempeno', note: 'x', discreet: false }),
    );
  });
});

describe('follow-ups', () => {
  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/members/u_admin').set({ access: 'admin' });
      await db.doc('companies/c1/followups/d_u_owner').set({
        managerUid: 'u_owner',
        messages: [],
        outcome: {},
        sentText: {},
      });
    });
  });

  it('keeps one manager out of another manager’s follow-up', async () => {
    await assertFails(
      as('u_admin', 'lucia@aditumcr.com').doc('companies/c1/followups/d_u_owner').get(),
    );
    await assertSucceeds(as('u_owner', FOUNDER).doc('companies/c1/followups/d_u_owner').get());
  });

  it('records what was sent but never rewrites the suggestion', async () => {
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(
      db.doc('companies/c1/followups/d_u_owner').update({
        outcome: { u_peer: 'sent' },
        sentText: { u_peer: 'Lo que realmente mandé' },
      }),
    );
    await assertFails(
      db.doc('companies/c1/followups/d_u_owner').update({ messages: [{ userId: 'u_peer' }] }),
    );
  });

  it('refuses a client creating one at all: the engine writes these', async () => {
    await assertFails(
      as('u_owner', FOUNDER)
        .doc('companies/c1/followups/d2_u_owner')
        .set({ managerUid: 'u_owner', messages: [] }),
    );
  });
});

describe('engine plumbing', () => {
  it('keeps the job queue away from clients entirely', async () => {
    const db = as('u_owner', FOUNDER);
    await assertFails(db.doc('jobs/j1').get());
    await assertFails(db.doc('jobs/j1').set({ type: 'daily' }));
  });

  it('lets a signed-in person read the worker heartbeat but never write it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('workers/pi-01').set({ lastHeartbeatAt: 'now' });
    });
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(db.doc('workers/pi-01').get());
    await assertFails(db.doc('workers/pi-01').set({ lastHeartbeatAt: 'later' }));
  });
});

describe('everything else is closed', () => {
  it('refuses a collection nobody declared', async () => {
    const db = as('u_owner', FOUNDER);
    await assertFails(db.doc('inventado/x').get());
    await assertFails(db.doc('inventado/x').set({ a: 1 }));
  });
});
