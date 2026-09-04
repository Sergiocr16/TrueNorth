import 'server-only';

import type {
  Company,
  DailyPlan,
  Membership,
  Objective,
  Project,
  Risk,
  Signal,
  Task,
  User,
} from '@truenorth/core';
import { atMidnight, computeSignals, shiftIso } from '@truenorth/core';
import { adminDb } from '../admin';

/**
 * Reading a company for the engine.
 *
 * This runs with the Admin SDK, which sees everything, so the visibility the
 * security rules enforce for people has to be re-applied here by hand: a
 * private project is stripped from any member who is not on it before their
 * prompt is built. That filter lives in @truenorth/core/visibility, with tests.
 */

export interface MemberRecord extends User {
  membership: Membership;
}

export interface Captured {
  company: Company;
  members: MemberRecord[];
  objectives: Objective[];
  /** Every project, private ones included. Filter per person with `visibleTo`. */
  projects: Project[];
  tasks: Task[];
  risks: Risk[];
  /** Yesterday's plans by uid, for continuity. */
  yesterdayPlans: Map<string, DailyPlan>;
  signals: Signal[];
  today: Date;
  todayIso: string;
}

interface MemberDoc {
  displayName: string;
  email: string;
  initials: string;
  roleTitle: string;
  roleDescription: string;
  access: Membership['access'];
}

export async function captureCompany(companyId: string, todayIso: string): Promise<Captured> {
  const db = adminDb();
  const base = db.collection('companies').doc(companyId);

  const [companySnap, membersSnap, objectivesSnap, projectsSnap, tasksSnap, risksSnap] =
    await Promise.all([
      base.get(),
      base.collection('members').get(),
      base.collection('objectives').get(),
      base.collection('projects').get(),
      base.collection('tasks').get(),
      base.collection('risks').get(),
    ]);

  if (!companySnap.exists) {
    throw new Error(`company ${companyId} does not exist`);
  }

  const company = { id: companySnap.id, ...(companySnap.data() as Omit<Company, 'id'>) };

  const members: MemberRecord[] = membersSnap.docs.map((d) => {
    const m = d.data() as MemberDoc;
    return {
      id: d.id,
      displayName: m.displayName,
      email: m.email,
      initials: m.initials,
      timezone: 'America/Costa_Rica',
      notifyHour: 6,
      locale: 'es',
      theme: 'system',
      reduceTransparency: false,
      membership: {
        userId: d.id,
        companyId,
        roleTitle: m.roleTitle,
        roleDescription: m.roleDescription,
        access: m.access,
      },
    };
  });

  const objectives = objectivesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Objective);
  const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task);
  const risks = risksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Risk);

  // Yesterday, for continuity: what was asked, what got done.
  const yesterdayIso = shiftIso(todayIso, -1);
  const yesterdayPlans = new Map<string, DailyPlan>();
  const yesterdaySnaps = await Promise.all(
    members.map((m) => base.collection('plans').doc(`${yesterdayIso}_${m.id}`).get()),
  );
  for (const snap of yesterdaySnaps) {
    if (snap.exists) {
      const plan = { id: snap.id, ...snap.data() } as DailyPlan;
      yesterdayPlans.set(plan.userId, plan);
    }
  }

  const today = atMidnight(todayIso);
  const signals = computeSignals({
    today,
    objectives,
    projects,
    tasks,
    users: members,
  });

  return {
    company,
    members,
    objectives,
    projects,
    tasks,
    risks,
    yesterdayPlans,
    signals,
    today,
    todayIso,
  };
}

