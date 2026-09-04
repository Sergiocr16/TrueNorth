import 'server-only';

import type {
  Company,
  DailyPlan,
  Membership,
  Objective,
  Project,
  Risk,
  Signal,
  Situation,
  Task,
  User,
} from '@truenorth/core';
import { atMidnight, computeSignals, shiftIso, todayIso as computeTodayIso } from '@truenorth/core';
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

/**
 * How far back the follow-up looks.
 *
 * A week is enough for "you have not marked a plan in days" to mean something
 * and short enough that a bad fortnight does not haunt somebody forever.
 */
export const FOLLOWUP_WINDOW_DAYS = 7;

export interface Captured {
  company: Company;
  members: MemberRecord[];
  objectives: Objective[];
  /** Every project, private ones included. Filter per person with `visibleTo`. */
  projects: Project[];
  tasks: Task[];
  risks: Risk[];
  /** Private notes about people, for the follow-up. Owners and admins only. */
  situations: Situation[];
  /** Yesterday's plans by uid, for continuity. */
  yesterdayPlans: Map<string, DailyPlan>;
  /** A week of plans for everybody, which is where the engagement signals come from. */
  planHistory: DailyPlan[];
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
  /** Absent means true: every document written before profiles existed is an account. */
  hasAccount?: boolean;
  /** Absent on every document written before expectations existed. */
  expectations?: string;
  notionUserId?: string;
  commsTone?: Membership['commsTone'];
}

export async function captureCompany(
  companyId: string,
  todayIso: string = computeTodayIso(),
): Promise<Captured> {
  const db = adminDb();
  const base = db.collection('companies').doc(companyId);

  const [
    companySnap,
    membersSnap,
    objectivesSnap,
    projectsSnap,
    tasksSnap,
    risksSnap,
    situationsSnap,
  ] = await Promise.all([
    base.get(),
    base.collection('members').get(),
    base.collection('objectives').get(),
    base.collection('projects').get(),
    base.collection('tasks').get(),
    base.collection('risks').get(),
    base.collection('situations').get(),
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
        hasAccount: m.hasAccount ?? true,
        expectations: typeof m.expectations === 'string' ? m.expectations : '',
        notionUserId: m.notionUserId,
        commsTone: m.commsTone,
      },
    };
  });

  const objectives = objectivesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Objective);
  const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task);
  const risks = risksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Risk);

  // A situation with a past end date is over, and reading it would nudge the
  // engine to be gentle about something that is no longer happening.
  const situations = situationsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Situation)
    .filter((s) => !s.endsAt || s.endsAt >= todayIso);

  // A week of plans, for everybody. One range query rather than a get per
  // person per day: the date field carries its own single-field index.
  const yesterdayIso = shiftIso(todayIso, -1);
  const windowStart = shiftIso(todayIso, -FOLLOWUP_WINDOW_DAYS);
  const historySnap = await base
    .collection('plans')
    .where('date', '>=', windowStart)
    .where('date', '<', todayIso)
    .get();
  const planHistory = historySnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyPlan);

  // Yesterday, for continuity: what was asked, what got done.
  const yesterdayPlans = new Map<string, DailyPlan>();
  for (const plan of planHistory) {
    if (plan.date === yesterdayIso) yesterdayPlans.set(plan.userId, plan);
  }

  const today = atMidnight(todayIso);
  const signals = computeSignals({
    today,
    objectives,
    projects,
    tasks,
    users: members,
    planHistory,
  });

  return {
    company,
    members,
    objectives,
    projects,
    tasks,
    risks,
    situations,
    yesterdayPlans,
    planHistory,
    signals,
    today,
    todayIso,
  };
}

