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
/** 8080 is what `firebase.json` starts; override both when something else already holds it. */
const emulatorPort = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

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
      port: emulatorPort,
    },
  });
  // Loading the rules into a cold emulator on the Pi can take longer than vitest's 10 s.
}, 60_000);

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
    await db.doc(`companies/${companyId}/roles/r_general`).set({
      name: 'General',
      description: '',
      sourceIds: [],
    });
    await db.doc(`companies/${companyId}/members/${ownerUid}`).set({
      displayName: 'Sergio',
      email: FOUNDER,
      initials: 'SC',
      roleTitle: 'General',
      roleDescription: '',
      roleIds: ['r_general'],
      activeRoleId: 'r_general',
      access: 'owner',
    });
  });
}

describe('users', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/u1').set({ locale: 'es', reminders: [] });
    });
  });

  it('keeps reminders on the person\'s own document, theirs to write and nobody else\'s to read', async () => {
    const mine = as('u1', 'ana@aditumcr.com');
    await assertSucceeds(
      mine.doc('users/u1').update({
        reminders: [{ id: 'rm_1', title: 'Llamar al banco', date: '2026-09-07', time: '09:15', leadMinutes: 10 }],
      }),
    );
    await assertFails(as('u2', 'marco@aditumcr.com').doc('users/u1').get());
    await assertFails(as('u2', 'marco@aditumcr.com').doc('users/u1').update({ reminders: [] }));
  });
});

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
    await assertSucceeds(db.doc('companies/c1/roles/r1').set({ name: 'General', sourceIds: [] }));
    await assertSucceeds(
      db.doc('companies/c1/projects/p1').set({ name: 'Proyecto', visibility: 'company', source: 'app' }),
    );
    await assertSucceeds(db.doc('companies/c1/tasks/t1').set({ title: 'Tarea', source: 'app' }));
    // A plan is not starting data: only the engine writes one, so a person
    // seeding their own is refused — that is what keeps Today honest.
    await assertFails(db.doc('companies/c1/plans/d_u1').set({ uid: 'u1', items: [] }));
  });
});

describe('objectives by scope (ADR-013)', () => {
  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/roles/r_sales').set({ name: 'Ventas', description: '', sourceIds: [] });
      await db.doc('companies/c1/members/u_admin').set({ access: 'admin', roleIds: ['r_general'] });
      await db.doc('companies/c1/members/u_sales').set({ access: 'member', roleIds: ['r_sales'] });
      await db.doc('companies/c1/members/u_peer').set({ access: 'member', roleIds: ['r_general'] });
      await db.doc('companies/c1/objectives/o_general').set({ title: 'General', scope: 'general' });
      await db.doc('companies/c1/objectives/o_legacy').set({ title: 'Before the field' });
      await db.doc('companies/c1/objectives/o_sales').set({ title: 'Ventas', scope: 'role', roleId: 'r_sales' });
    });
  });

  it('lets the owner and an admin write any objective, and everybody read them', async () => {
    await assertSucceeds(as('u_owner', FOUNDER).doc('companies/c1/objectives/o_general').update({ title: 'Meta' }));
    await assertSucceeds(as('u_admin', 'admin@aditumcr.com').doc('companies/c1/objectives/o_sales').update({ title: 'V' }));
    await assertSucceeds(as('u_admin', 'admin@aditumcr.com').doc('companies/c1/objectives/o_legacy').delete());
    await assertSucceeds(as('u_sales', 'ventas@aditumcr.com').doc('companies/c1/objectives/o_general').get());
  });

  it('lets whoever holds a role write that role\'s objectives, and nobody else\'s', async () => {
    const sales = as('u_sales', 'ventas@aditumcr.com');
    await assertSucceeds(sales.doc('companies/c1/objectives/o_sales').update({ title: 'Ventas 2' }));
    await assertSucceeds(
      sales.doc('companies/c1/objectives/o_sales2').set({ title: 'Nuevo', scope: 'role', roleId: 'r_sales' }),
    );
    await assertFails(sales.doc('companies/c1/objectives/o_general').update({ title: 'Mine now' }));
    await assertFails(sales.doc('companies/c1/objectives/o_legacy').update({ title: 'Mine now' }));
    await assertFails(sales.doc('companies/c1/objectives/o_new').set({ title: 'General', scope: 'general' }));
    await assertFails(
      as('u_peer', 'marco@aditumcr.com').doc('companies/c1/objectives/o_sales').update({ title: 'Not mine' }),
    );
    await assertFails(as('u_peer', 'marco@aditumcr.com').doc('companies/c1/objectives/o_sales').delete());
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
        source: 'app',
      });
      await db.doc('companies/c1/projects/p_open').set({
        name: 'Abierto',
        visibility: 'company',
        memberUserIds: ['u_owner'],
        source: 'app',
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
        .where('source', '==', 'app')
        .where('visibility', '==', 'company')
        .get(),
    );
  });

  it('accepts the my-projects query the app issues', async () => {
    await assertSucceeds(
      as('u_owner', FOUNDER)
        .collection('companies/c1/projects')
        .where('source', '==', 'app')
        .where('memberUserIds', 'array-contains', 'u_owner')
        .get(),
    );
  });

  // The old query, without the source clause, can no longer be proven: a
  // synced project with visibility 'company' is not readable by everyone.
  it('refuses the visibility query without the source clause', async () => {
    await assertFails(
      as('u_owner', FOUNDER)
        .collection('companies/c1/projects')
        .where('visibility', '==', 'company')
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

describe('roles and notion sources', () => {
  const peer = () => as('u_peer', 'marco@aditumcr.com');

  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/roles/r_cto').set({ name: 'CTO', sourceIds: ['src_a'] });
      await db.doc('companies/c1/roles/r_ventas').set({ name: 'Ventas', sourceIds: ['src_b'] });
      // A developer reads the task table only through their own assignments
      // and the backlog whole (ADR-009).
      await db.doc('companies/c1/roles/r_dev').set({
        name: 'Dev',
        sourceIds: ['src_a', 'src_b'],
        assignedOnlySourceIds: ['src_a'],
      });
      await db.doc('companies/c1/notionSources/src_a').set({ title: 'Tareas Software', kind: 'tasks' });
      await db.doc('companies/c1/notionSources/src_b').set({ title: 'Ventas', kind: 'tasks' });
      await db.doc('companies/c1/members/u_peer').set({
        displayName: 'Marco',
        access: 'member',
        roleIds: ['r_cto', 'r_ventas'],
        activeRoleId: 'r_cto',
      });
      await db.doc('companies/c1/members/u_norole').set({ displayName: 'Nadie', access: 'member' });
      await db.doc('companies/c1/members/u_dev').set({
        displayName: 'Dana',
        access: 'member',
        roleIds: ['r_dev'],
        activeRoleId: 'r_dev',
      });
      await db.doc('companies/c1/tasks/t_a').set({
        title: 'A',
        source: 'notion',
        sourceId: 'src_a',
        assigneeUserIds: [],
      });
      await db.doc('companies/c1/tasks/t_b').set({
        title: 'B',
        source: 'notion',
        sourceId: 'src_b',
        assigneeUserIds: [],
      });
      await db.doc('companies/c1/tasks/t_a_mine').set({
        title: 'Mine',
        source: 'notion',
        sourceId: 'src_a',
        assigneeUserIds: ['u_dev'],
      });
      await db.doc('companies/c1/tasks/t_a_other').set({
        title: 'Theirs',
        source: 'notion',
        sourceId: 'src_a',
        assigneeUserIds: ['u_peer'],
      });
      await db.doc('companies/c1/tasks/t_b_other').set({
        title: 'Backlog item',
        source: 'notion',
        sourceId: 'src_b',
        assigneeUserIds: ['u_peer'],
      });
      await db.doc('companies/c1/tasks/t_app').set({ title: 'App', source: 'app' });
      await db.doc('companies/c1/projects/p_a').set({
        name: 'PA',
        source: 'notion',
        sourceId: 'src_a',
        visibility: 'company',
        memberUserIds: [],
      });
      await db.doc('companies/c1/projects/p_b').set({
        name: 'PB',
        source: 'notion',
        sourceId: 'src_b',
        visibility: 'company',
        memberUserIds: [],
      });
      await db.doc('companies/c1/projects/p_a_mine').set({
        name: 'PA mine',
        source: 'notion',
        sourceId: 'src_a',
        visibility: 'company',
        memberUserIds: ['u_dev'],
      });
      await db.doc('companies/c1/projects/p_a_other').set({
        name: 'PA theirs',
        source: 'notion',
        sourceId: 'src_a',
        visibility: 'company',
        memberUserIds: ['u_peer'],
      });
    });
  });

  it('lets a person read a task from a source their active role reads', async () => {
    await assertSucceeds(peer().doc('companies/c1/tasks/t_a').get());
  });

  it('hides a task from a source of a role they hold but do not have on', async () => {
    await assertFails(peer().doc('companies/c1/tasks/t_b').get());
  });

  it('switching the active role swaps what is readable', async () => {
    await assertSucceeds(peer().doc('companies/c1/members/u_peer').update({ activeRoleId: 'r_ventas' }));
    await assertSucceeds(peer().doc('companies/c1/tasks/t_b').get());
    await assertFails(peer().doc('companies/c1/tasks/t_a').get());
  });

  it('refuses putting on a role one does not hold, or editing the role list', async () => {
    await assertFails(peer().doc('companies/c1/members/u_peer').update({ activeRoleId: 'r_general' }));
    await assertFails(
      peer().doc('companies/c1/members/u_peer').update({ roleIds: ['r_cto', 'r_ventas', 'r_general'] }),
    );
    await assertFails(
      peer().doc('companies/c1/members/u_peer').update({ activeRoleId: 'r_ventas', roleDescription: 'x' }),
    );
  });

  it('gives a person with no active role app records only', async () => {
    const db = as('u_norole', 'nadie@aditumcr.com');
    await assertSucceeds(db.doc('companies/c1/tasks/t_app').get());
    await assertFails(db.doc('companies/c1/tasks/t_a').get());
  });

  it('accepts the per-source task query for a source on the active role', async () => {
    await assertSucceeds(
      peer()
        .collection('companies/c1/tasks')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .get(),
    );
  });

  it('refuses the per-source query for a source that is not on it', async () => {
    await assertFails(
      peer()
        .collection('companies/c1/tasks')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_b')
        .get(),
    );
  });

  it('accepts the app-records task query and refuses an unfiltered listener', async () => {
    await assertSucceeds(peer().collection('companies/c1/tasks').where('source', '==', 'app').get());
    await assertFails(peer().collection('companies/c1/tasks').get());
    // The source clause is what lets the rule be proven; without it, refused.
    await assertFails(peer().collection('companies/c1/tasks').where('sourceId', '==', 'src_a').get());
  });

  it('hides a synced project whatever its visibility field says', async () => {
    await assertSucceeds(peer().doc('companies/c1/projects/p_a').get());
    await assertFails(peer().doc('companies/c1/projects/p_b').get());
    await assertSucceeds(
      peer()
        .collection('companies/c1/projects')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .get(),
    );
    await assertFails(
      peer()
        .collection('companies/c1/projects')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_b')
        .get(),
    );
  });

  it('keeps Notion records out of the browser’s hands: no creating, no editing', async () => {
    await assertFails(
      peer().doc('companies/c1/tasks/t_new').set({ title: 'X', source: 'notion', sourceId: 'src_a' }),
    );
    await assertFails(peer().doc('companies/c1/tasks/t_a').update({ title: 'Renombrada' }));
    await assertFails(peer().doc('companies/c1/projects/p_a').update({ name: 'Otro' }));
    await assertSucceeds(peer().doc('companies/c1/tasks/t_new').set({ title: 'X', source: 'app' }));
  });

  /* Assigned-only sources (ADR-009). `dev` reads src_a through assignments and src_b whole. */

  const dev = () => as('u_dev', 'dana@aditumcr.com');

  it('shows a person only their own tasks of an assigned-only source, and everything of a whole one', async () => {
    await assertSucceeds(dev().doc('companies/c1/tasks/t_a_mine').get());
    await assertFails(dev().doc('companies/c1/tasks/t_a_other').get());
    // Unowned work in an assigned-only source is as hidden as somebody else's.
    await assertFails(dev().doc('companies/c1/tasks/t_a').get());
    await assertSucceeds(dev().doc('companies/c1/tasks/t_b_other').get());
    await assertSucceeds(dev().doc('companies/c1/tasks/t_b').get());
  });

  it('accepts the assigned-only task query only with the caller’s own array-contains clause', async () => {
    await assertSucceeds(
      dev()
        .collection('companies/c1/tasks')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .where('assigneeUserIds', 'array-contains', 'u_dev')
        .get(),
    );
    // Without the clause the rule cannot be proven; with somebody else's it is false.
    await assertFails(
      dev()
        .collection('companies/c1/tasks')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .get(),
    );
    await assertFails(
      dev()
        .collection('companies/c1/tasks')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .where('assigneeUserIds', 'array-contains', 'u_peer')
        .get(),
    );
    // A source read whole keeps the plain per-source query.
    await assertSucceeds(
      dev()
        .collection('companies/c1/tasks')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_b')
        .get(),
    );
  });

  it('applies the same to synced projects, through their members', async () => {
    await assertSucceeds(dev().doc('companies/c1/projects/p_a_mine').get());
    await assertFails(dev().doc('companies/c1/projects/p_a_other').get());
    await assertFails(dev().doc('companies/c1/projects/p_a').get());
    await assertSucceeds(
      dev()
        .collection('companies/c1/projects')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .where('memberUserIds', 'array-contains', 'u_dev')
        .get(),
    );
    await assertFails(
      dev()
        .collection('companies/c1/projects')
        .where('source', '==', 'notion')
        .where('sourceId', '==', 'src_a')
        .get(),
    );
  });

  it('keeps a role written without the field reading its sources whole', async () => {
    await assertSucceeds(peer().doc('companies/c1/tasks/t_a_other').get());
    await assertSucceeds(peer().doc('companies/c1/tasks/t_a').get());
    await assertSucceeds(peer().doc('companies/c1/tasks/t_a_mine').get());
    await assertSucceeds(peer().doc('companies/c1/projects/p_a_other').get());
  });

  it('lets a member read roles and sources but only an admin write them', async () => {
    await assertSucceeds(peer().doc('companies/c1/roles/r_cto').get());
    await assertSucceeds(peer().doc('companies/c1/notionSources/src_a').get());
    await assertFails(peer().doc('companies/c1/roles/r_cto').update({ sourceIds: ['src_a', 'src_b'] }));
    await assertFails(dev().doc('companies/c1/roles/r_dev').update({ assignedOnlySourceIds: [] }));
    await assertSucceeds(
      as('u_owner', FOUNDER).doc('companies/c1/roles/r_dev').update({ assignedOnlySourceIds: [] }),
    );
    await assertFails(peer().doc('companies/c1/notionSources/src_c').set({ title: 'X' }));
    await assertSucceeds(
      as('u_owner', FOUNDER).doc('companies/c1/roles/r_nuevo').set({ name: 'Nuevo', sourceIds: [] }),
    );
    await assertSucceeds(
      as('u_owner', FOUNDER).doc('companies/c1/members/u_peer').update({ roleIds: ['r_ventas'] }),
    );
  });

  it('keeps a briefing with the person it was written for', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('companies/c1/analyses/d_u_owner_r_cto').set({ uid: 'u_owner', briefing: 'x' });
    });
    await assertFails(peer().doc('companies/c1/analyses/d_u_owner_r_cto').get());
    await assertSucceeds(as('u_owner', FOUNDER).doc('companies/c1/analyses/d_u_owner_r_cto').get());
    await assertFails(as('u_owner', FOUNDER).collection('companies/c1/analyses').get());
    await assertSucceeds(
      as('u_owner', FOUNDER).collection('companies/c1/analyses').where('uid', '==', 'u_owner').get(),
    );
    await assertFails(
      as('u_owner', FOUNDER).doc('companies/c1/analyses/d2').set({ uid: 'u_owner', briefing: 'y' }),
    );
  });
});

describe('github repositories and pull requests', () => {
  const peer = () => as('u_peer', 'marco@aditumcr.com');
  const dev = () => as('u_dev', 'dana@aditumcr.com');

  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Repositories sit on roles in the same list as Notion sources (ADR-010).
      await db.doc('companies/c1/roles/r_cto').set({ name: 'CTO', sourceIds: ['src_a', 'gh_1'] });
      await db.doc('companies/c1/roles/r_dev').set({
        name: 'Dev',
        sourceIds: ['src_a', 'gh_1'],
        assignedOnlySourceIds: ['gh_1'],
      });
      await db.doc('companies/c1/githubRepos/gh_1').set({ fullName: 'aditum/api', projectId: null });
      await db.doc('companies/c1/githubRepos/gh_2').set({ fullName: 'aditum/web', projectId: null });
      await db.doc('companies/c1/members/u_peer').set({
        displayName: 'Marco',
        access: 'member',
        roleIds: ['r_cto'],
        activeRoleId: 'r_cto',
      });
      await db.doc('companies/c1/members/u_dev').set({
        displayName: 'Dana',
        access: 'member',
        roleIds: ['r_dev'],
        activeRoleId: 'r_dev',
      });
      await db.doc('companies/c1/members/u_norole').set({ displayName: 'Nadie', access: 'member' });
      await db.doc('companies/c1/pullRequests/pr_mine').set({ repoId: 'gh_1', peopleUserIds: ['u_dev'] });
      await db.doc('companies/c1/pullRequests/pr_other').set({ repoId: 'gh_1', peopleUserIds: ['u_peer'] });
      await db.doc('companies/c1/pullRequests/pr_nobody').set({ repoId: 'gh_1', peopleUserIds: [] });
      await db.doc('companies/c1/pullRequests/pr_repo2').set({ repoId: 'gh_2', peopleUserIds: ['u_peer'] });
    });
  });

  it('shows every pull request of a repository on the role, and none of one that is not', async () => {
    await assertSucceeds(peer().doc('companies/c1/pullRequests/pr_mine').get());
    await assertSucceeds(peer().doc('companies/c1/pullRequests/pr_other').get());
    await assertSucceeds(peer().doc('companies/c1/pullRequests/pr_nobody').get());
    await assertFails(peer().doc('companies/c1/pullRequests/pr_repo2').get());
    await assertSucceeds(
      peer().collection('companies/c1/pullRequests').where('repoId', '==', 'gh_1').get(),
    );
    await assertFails(peer().collection('companies/c1/pullRequests').where('repoId', '==', 'gh_2').get());
  });

  it('of an assigned-only repository, shows only the pull requests that name the person', async () => {
    await assertSucceeds(dev().doc('companies/c1/pullRequests/pr_mine').get());
    await assertFails(dev().doc('companies/c1/pullRequests/pr_other').get());
    await assertFails(dev().doc('companies/c1/pullRequests/pr_nobody').get());
    await assertSucceeds(
      dev()
        .collection('companies/c1/pullRequests')
        .where('repoId', '==', 'gh_1')
        .where('peopleUserIds', 'array-contains', 'u_dev')
        .get(),
    );
    await assertFails(dev().collection('companies/c1/pullRequests').where('repoId', '==', 'gh_1').get());
    await assertFails(
      dev()
        .collection('companies/c1/pullRequests')
        .where('repoId', '==', 'gh_1')
        .where('peopleUserIds', 'array-contains', 'u_peer')
        .get(),
    );
  });

  it('refuses an unfiltered listener and gives a person with no active role nothing', async () => {
    await assertFails(peer().collection('companies/c1/pullRequests').get());
    await assertFails(as('u_norole', 'nadie@aditumcr.com').doc('companies/c1/pullRequests/pr_nobody').get());
  });

  it('keeps pull requests out of the browser’s hands and repositories with the admins', async () => {
    await assertFails(
      peer().doc('companies/c1/pullRequests/pr_new').set({ repoId: 'gh_1', peopleUserIds: ['u_peer'] }),
    );
    await assertFails(peer().doc('companies/c1/pullRequests/pr_mine').update({ title: 'x' }));
    await assertSucceeds(peer().doc('companies/c1/githubRepos/gh_1').get());
    await assertFails(peer().doc('companies/c1/githubRepos/gh_1').update({ projectId: 'p1' }));
    await assertSucceeds(
      as('u_owner', FOUNDER).doc('companies/c1/githubRepos/gh_1').update({ projectId: 'p1' }),
    );
    await assertSucceeds(peer().doc('companies/c1/integrations/github').get());
    await assertFails(peer().doc('companies/c1/integrations/github').set({ approverRoleIds: [] }));
    await assertSucceeds(
      as('u_owner', FOUNDER).doc('companies/c1/integrations/github').set({ approverRoleIds: ['r_cto'] }),
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

describe('the day log (ADR-014)', () => {
  const peer = () => as('u_peer', 'marco@aditumcr.com');

  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('companies/c1/members/u_peer').set({ access: 'member' });
      await db.doc('companies/c1/updates/2026-10-10_u_owner').set({
        uid: 'u_owner',
        userId: 'u_owner',
        kind: 'day_log',
        date: '2026-10-10',
        text: 'Revisé los PRs de Juan',
        appliedAt: null,
      });
    });
  });

  it('keeps what somebody said they did to themselves', async () => {
    await assertFails(peer().doc('companies/c1/updates/2026-10-10_u_owner').get());
    await assertSucceeds(as('u_owner', FOUNDER).doc('companies/c1/updates/2026-10-10_u_owner').get());
    // Rules are not filters: the list only works with the clause the app sends.
    await assertFails(as('u_owner', FOUNDER).collection('companies/c1/updates').get());
    await assertSucceeds(
      as('u_owner', FOUNDER).collection('companies/c1/updates').where('uid', '==', 'u_owner').get(),
    );
  });

  it('writes a log only in the author own name', async () => {
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(
      db.doc('companies/c1/updates/2026-10-11_u_owner').set({
        uid: 'u_owner',
        userId: 'u_owner',
        kind: 'day_log',
        date: '2026-10-11',
        text: 'Cerré TAR-966',
        appliedAt: null,
      }),
    );
    // No uid, no create: the read rule has nothing to check against.
    await assertFails(
      db.doc('companies/c1/updates/2026-10-11_x').set({ kind: 'day_log', text: 'Algo' }),
    );
    // And never in somebody else's name.
    await assertFails(
      db.doc('companies/c1/updates/2026-10-11_u_peer').set({ uid: 'u_peer', text: 'Algo' }),
    );
  });

  it('stays editable all day, because a day log is never applied', async () => {
    const db = as('u_owner', FOUNDER);
    await assertSucceeds(
      db.doc('companies/c1/updates/2026-10-10_u_owner').update({ text: 'Y también cerré TAR-842' }),
    );
    await assertFails(
      peer().doc('companies/c1/updates/2026-10-10_u_owner').update({ text: 'No fue así' }),
    );
  });

  it('cannot be erased, not even by the person who wrote it', async () => {
    await assertFails(as('u_owner', FOUNDER).doc('companies/c1/updates/2026-10-10_u_owner').delete());
  });
});

describe('plan rules (ADR-014)', () => {
  const peer = () => as('u_peer', 'marco@aditumcr.com');

  beforeEach(async () => {
    await seedCompany();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('companies/c1/members/u_peer').set({
        displayName: 'Marco',
        access: 'member',
        roleIds: ['r_general'],
        activeRoleId: 'r_general',
        expectations: 'Cerrar el módulo financiero',
      });
    });
  });

  const rule = [
    {
      id: 'pr_1',
      text: 'En una tarea de otra persona mi acción es dar seguimiento',
      scope: 'general',
      roleId: null,
      status: 'confirmed',
      source: { kind: 'manual' },
      createdAt: '2026-10-11T00:00:00Z',
      confirmedAt: '2026-10-11T00:00:00Z',
    },
  ];

  it('lets a plain member describe how they work', async () => {
    await assertSucceeds(peer().doc('companies/c1/members/u_peer').update({ planRules: rule }));
  });

  it('refuses to let anyone write somebody else rules', async () => {
    await assertFails(peer().doc('companies/c1/members/u_owner').update({ planRules: rule }));
  });

  it('still refuses the fields that were never theirs', async () => {
    const db = peer();
    await assertFails(db.doc('companies/c1/members/u_peer').update({ access: 'admin' }));
    await assertFails(db.doc('companies/c1/members/u_peer').update({ roleIds: ['r_general', 'r_x'] }));
    await assertFails(db.doc('companies/c1/members/u_peer').update({ expectations: 'Nada, en realidad' }));
    // Not even smuggled in alongside a legitimate change.
    await assertFails(
      db.doc('companies/c1/members/u_peer').update({ planRules: rule, access: 'admin' }),
    );
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
