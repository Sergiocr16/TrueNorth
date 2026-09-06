import 'server-only';

import type {
  Company,
  DailyPlan,
  GithubIntegration,
  GithubRepo,
  Membership,
  NotionSource,
  Objective,
  Project,
  PullRequest,
  Risk,
  Role,
  Scoped,
  Situation,
  Task,
  User,
} from '@truenorth/core';
import { atMidnight, scopeFor, shiftIso, todayIso as computeTodayIso } from '@truenorth/core';
import { adminDb } from '../admin';
import type { CompanyContext } from './prompts';

/**
 * Reading a company for the engine.
 *
 * This runs with the Admin SDK, which sees everything, so the visibility the
 * security rules enforce for people has to be re-applied here by hand — and
 * since ADR-008 that means per role: what a person's active role reads is
 * the whole of what their prompt may contain, signals included. Nothing is
 * computed here beyond reading; `scopeOf()` is the one door to a person's
 * view, and it lives in @truenorth/core with its tests.
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
  roles: Role[];
  sources: NotionSource[];
  objectives: Objective[];
  /** Every project, private ones and every source included. Never prompt from this. */
  projects: Project[];
  /** Every task. Never prompt from this. */
  tasks: Task[];
  risks: Risk[];
  /** GitHub repositories registered as sources, and their pull requests (ADR-010). */
  repos: GithubRepo[];
  pullRequests: PullRequest[];
  github: GithubIntegration | null;
  /** Private notes about people, for the follow-up. Owners and admins only. */
  situations: Situation[];
  /** Yesterday's plans by `${uid}_${roleId}`, for continuity. */
  yesterdayPlans: Map<string, DailyPlan>;
  /** A week of plans for everybody, which is where the engagement signals come from. */
  planHistory: DailyPlan[];
  today: Date;
  todayIso: string;
}

interface MemberDoc {
  displayName: string;
  email: string;
  initials: string;
  roleTitle: string;
  roleDescription: string;
  roleIds?: string[];
  activeRoleId?: string | null;
  access: Membership['access'];
  /** Absent means true: every document written before profiles existed is an account. */
  hasAccount?: boolean;
  /** Absent on every document written before expectations existed. */
  expectations?: string;
  notionUserId?: string;
  notionUserIds?: string[];
  githubLogin?: string;
  githubLogins?: string[];
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
    rolesSnap,
    sourcesSnap,
    objectivesSnap,
    projectsSnap,
    tasksSnap,
    risksSnap,
    situationsSnap,
    reposSnap,
    pullsSnap,
    githubSnap,
  ] = await Promise.all([
    base.get(),
    base.collection('members').get(),
    base.collection('roles').get(),
    base.collection('notionSources').get(),
    base.collection('objectives').get(),
    base.collection('projects').get(),
    base.collection('tasks').get(),
    base.collection('risks').get(),
    base.collection('situations').get(),
    base.collection('githubRepos').get(),
    base.collection('pullRequests').get(),
    base.collection('integrations').doc('github').get(),
  ]);

  if (!companySnap.exists) {
    throw new Error(`company ${companyId} does not exist`);
  }

  const company = { id: companySnap.id, ...(companySnap.data() as Omit<Company, 'id'>) };
  const roles = rolesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Role);
  const sources = sourcesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotionSource);

  const members: MemberRecord[] = membersSnap.docs.map((d) => {
    const m = d.data() as MemberDoc;
    const roleIds = m.roleIds ?? [];
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
        roleIds,
        activeRoleId: m.activeRoleId ?? roleIds[0] ?? null,
        access: m.access,
        hasAccount: m.hasAccount ?? true,
        expectations: typeof m.expectations === 'string' ? m.expectations : '',
        notionUserId: m.notionUserId,
        notionUserIds: m.notionUserIds,
        githubLogin: m.githubLogin,
        githubLogins: m.githubLogins,
        commsTone: m.commsTone,
      },
    };
  });

  const objectives = objectivesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Objective);
  const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task);
  const risks = risksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Risk);
  const repos = reposSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as GithubRepo);
  const pullRequests = pullsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PullRequest);
  const github = githubSnap.exists ? (githubSnap.data() as GithubIntegration) : null;

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

  // Yesterday, for continuity: what was asked, what got done — in that role.
  const yesterdayPlans = new Map<string, DailyPlan>();
  for (const plan of planHistory) {
    if (plan.date === yesterdayIso) yesterdayPlans.set(`${plan.userId}_${plan.roleId ?? ''}`, plan);
  }

  return {
    company,
    members,
    roles,
    sources,
    objectives,
    projects,
    tasks,
    risks,
    repos,
    pullRequests,
    github,
    situations,
    yesterdayPlans,
    planHistory,
    today: atMidnight(todayIso),
    todayIso,
  };
}

/**
 * One person's view in one role, signals included. The only way a prompt
 * gets projects, tasks or signals; see visibility.ts for what it hides.
 */
export function scopeOf(captured: Captured, userId: string, roleId: string | null): Scoped {
  return scopeFor(
    {
      today: captured.today,
      objectives: captured.objectives,
      projects: captured.projects,
      tasks: captured.tasks,
      sources: captured.sources,
      roles: captured.roles,
      members: captured.members,
      planHistory: captured.planHistory,
      repos: captured.repos,
      pullRequests: captured.pullRequests,
      approverRoleIds: captured.github?.approverRoleIds ?? [],
      finishedStatuses: captured.github?.finishedStatuses,
    },
    userId,
    roleId,
  );
}

/** The prompt context built from a scope and nothing else. */
export function contextFor(captured: Captured, scope: Scoped): CompanyContext {
  return {
    company: captured.company,
    objectives: scope.objectives,
    projects: scope.projects,
    tasks: scope.tasks,
    members: scope.users as MemberRecord[],
    signals: scope.signals,
    role: scope.role,
    sources: captured.sources.filter((s) => scope.sourceIds.includes(s.id)),
    assignedOnlySourceIds: scope.assignedOnlySourceIds,
    repos: captured.repos.filter((r) => scope.repoIds.includes(r.id)),
    pullRequests: scope.pullRequests,
    approverUserIds: scope.approverUserIds,
    today: captured.today,
    todayIso: captured.todayIso,
  };
}

/** The role a person works in when nobody asked for one: the one they have on. */
export function roleFor(member: MemberRecord, requested?: string | null): string | null {
  const { roleIds, activeRoleId } = member.membership;
  if (requested) return roleIds.includes(requested) ? requested : null;
  return activeRoleId ?? roleIds[0] ?? null;
}
