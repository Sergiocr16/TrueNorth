import { describe, expect, it } from 'vitest';
import type { DailyPlan, GithubRepo, Membership, NotionSource, Project, PullRequest, Role, Task, User } from './types';
import {
  pickableTasks,
  roleAssignedOnlyIds,
  roleSourceIds,
  scopeFor,
  teamSignals,
  visiblePullRequests,
  visibleProjects,
  visibleSignals,
  visibleTasks,
  type ScopeInput,
} from './visibility';

const project = (
  id: string,
  visibility: Project['visibility'],
  memberUserIds: string[],
  sourceId: string | null = null,
): Project => ({
  id,
  companyId: 'c',
  name: id,
  description: '',
  visibility,
  objectiveIds: [],
  memberUserIds,
  ownerUserId: memberUserIds[0] ?? 'nobody',
  startDate: '2026-01-01',
  targetDate: '2026-12-31',
  progressPct: 0,
  status: 'on_track',
  source: sourceId ? 'notion' : 'app',
  sourceId,
});

const task = (
  id: string,
  projectId: string | null,
  assignee: string | null,
  sourceId: string | null = null,
  extra: Partial<Task> = {},
): Task => ({
  id,
  companyId: 'c',
  projectId,
  code: id.toUpperCase(),
  title: id,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  assigneeUserIds: assignee ? [assignee] : [],
  dependsOn: [],
  source: sourceId ? 'notion' : 'app',
  sourceId,
  ...extra,
});

const source = (id: string): NotionSource => ({
  id,
  companyId: 'c',
  kind: 'tasks',
  title: id,
  databaseId: id,
  dataSourceId: id,
  properties: { title: 'Nombre', status: 'Estado' },
  statusType: 'status',
  statusMap: {},
  mappingHash: '',
  lastSyncAt: null,
  lastFullSyncAt: null,
  lastSyncError: null,
  counts: { pages: 0, open: 0, unmatchedPeople: 0 },
  createdBy: 'ana',
  createdAt: '2026-01-01',
});

const repo = (id: string, projectId: string | null = null): GithubRepo => ({
  id,
  companyId: 'c',
  owner: 'aditum',
  name: id,
  fullName: `aditum/${id}`,
  repoId: 1,
  projectId,
  baseBranch: 'development',
  lastSyncAt: null,
  lastFullSyncAt: null,
  lastSyncError: null,
  counts: { open: 0, awaiting: 0, changesRequested: 0, approved: 0 },
  createdBy: 'ana',
  createdAt: '2026-01-01',
});

const pull = (id: string, repoId: string, people: string[], extra: Partial<PullRequest> = {}): PullRequest => ({
  id,
  companyId: 'c',
  repoId,
  number: 1,
  title: id,
  url: `https://github.com/aditum/${repoId}/pull/1`,
  state: 'open',
  draft: false,
  baseRef: 'development',
  headRef: 'feature/TAR-1',
  authorLogin: people[0] ?? 'nobody',
  authorUserId: people[0] ?? null,
  reviewerLogins: [],
  reviewerUserIds: people.slice(1),
  peopleUserIds: people,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  mergedAt: null,
  closedAt: null,
  lastPushAt: null,
  reviewState: 'none',
  lastReviewAt: null,
  lastReviewBy: null,
  lastAuthorActivityAt: null,
  taskCode: null,
  taskId: null,
  projectId: null,
  syncedAt: '2026-09-01T00:00:00Z',
  ...extra,
});

const role = (id: string, sourceIds: string[], assignedOnlySourceIds?: string[]): Role => ({
  id,
  companyId: 'c',
  name: id,
  description: '',
  sourceIds,
  ...(assignedOnlySourceIds ? { assignedOnlySourceIds } : {}),
  createdAt: '2026-01-01',
});

const member = (id: string, access: Membership['access'], roleIds: string[]): User & { membership: Membership } => ({
  id,
  displayName: id,
  email: `${id}@x`,
  initials: id.slice(0, 2).toUpperCase(),
  timezone: 'America/Costa_Rica',
  notifyHour: 6,
  locale: 'es',
  theme: 'system',
  reduceTransparency: false,
  membership: {
    userId: id,
    companyId: 'c',
    roleTitle: roleIds.join(' · '),
    roleDescription: '',
    roleIds,
    activeRoleId: roleIds[0] ?? null,
    access,
    hasAccount: true,
    expectations: '',
  },
});

const ids = <T extends { id: string }>(items: T[]) => items.map((i) => i.id);
const ALL = new Set(['src_sw', 'src_sales']);
const SW = new Set(['src_sw']);
const NONE = new Set<string>();

const projects = [
  project('p_company', 'company', ['ana']),
  project('p_private', 'private', ['ana']),
  project('p_shared', 'shared', ['ana', 'bob']),
  project('p_sw', 'company', ['bob'], 'src_sw'),
  project('p_sales', 'company', ['carla'], 'src_sales'),
];

describe('roleSourceIds', () => {
  it('ignores sources that no longer exist and copes with no role', () => {
    expect([...roleSourceIds(role('r', ['src_sw', 'src_gone']), [source('src_sw')])]).toEqual(['src_sw']);
    expect(roleSourceIds(null, [source('src_sw')]).size).toBe(0);
  });
});

describe('roleAssignedOnlyIds', () => {
  const sources = [source('src_sw'), source('src_sales')];

  it('keeps only ids the role reads at all, among sources that still exist', () => {
    const r = role('r', ['src_sw'], ['src_sw', 'src_sales', 'src_gone']);
    expect([...roleAssignedOnlyIds(r, sources)]).toEqual(['src_sw']);
  });

  it('is empty for a role written without the field, and for no role', () => {
    expect(roleAssignedOnlyIds(role('r', ['src_sw']), sources).size).toBe(0);
    expect(roleAssignedOnlyIds(null, sources).size).toBe(0);
  });
});

describe('visibleProjects', () => {
  it('shows company-wide app projects to everyone', () => {
    expect(ids(visibleProjects(projects, 'dana', NONE))).toEqual(['p_company']);
  });

  it('shows private and shared projects only to the people on them', () => {
    expect(ids(visibleProjects(projects, 'bob', NONE))).toEqual(['p_company', 'p_shared']);
    expect(ids(visibleProjects(projects, 'ana', NONE))).toEqual(['p_company', 'p_private', 'p_shared']);
  });

  it('shows a Notion project only through a source the role reads, whatever its visibility says', () => {
    expect(ids(visibleProjects(projects, 'bob', SW))).toEqual(['p_company', 'p_shared', 'p_sw']);
    expect(ids(visibleProjects(projects, 'carla', SW))).toEqual(['p_company', 'p_sw']);
    expect(ids(visibleProjects(projects, 'carla', ALL))).toEqual(['p_company', 'p_sw', 'p_sales']);
  });

  it('of an assigned-only source, shows a Notion project only to the people on it', () => {
    expect(ids(visibleProjects(projects, 'bob', SW, SW))).toEqual(['p_company', 'p_shared', 'p_sw']);
    expect(ids(visibleProjects(projects, 'carla', SW, SW))).toEqual(['p_company']);
    // Sales stays whole: carla sees it without being on it.
    expect(ids(visibleProjects(projects, 'dana', ALL, SW))).toEqual(['p_company', 'p_sales']);
  });
});

describe('visibleTasks', () => {
  const tasks = [
    task('t1', 'p_company', null),
    task('t2', 'p_private', 'bob'),
    task('t3', null, 'bob'),
    task('t4', 'p_shared', 'ana'),
    task('t5', 'p_sw', 'bob', 'src_sw'),
    task('t6', 'p_sales', 'bob', 'src_sales'),
    task('t7', null, 'bob', 'src_sales'),
  ];

  it('hides a task on a hidden app project even when it is assigned to the person', () => {
    expect(ids(visibleTasks(tasks, projects, 'bob', NONE))).toEqual(['t1', 't3', 't4']);
  });

  it('hides a task from a source the role does not read, assigned or not', () => {
    expect(ids(visibleTasks(tasks, projects, 'bob', SW))).toEqual(['t1', 't3', 't4', 't5']);
  });

  it('keeps a task whose Notion project is hidden, detached from it', () => {
    const sales = new Set(['src_sales']);
    const seen = visibleTasks([task('t8', 'p_sw', 'bob', 'src_sales')], projects, 'bob', sales);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.projectId).toBeNull();
  });

  it('keeps tasks that belong to no project', () => {
    expect(ids(visibleTasks(tasks, projects, 'dana', ALL))).toEqual(['t1', 't3', 't5', 't6', 't7']);
  });

  it('of an assigned-only source, shows only the tasks that name the person', () => {
    const unowned = task('t9', null, null, 'src_sw');
    const all = [...tasks, unowned];
    // bob: his own software task, and everything of sales, which stays whole.
    expect(ids(visibleTasks(all, projects, 'bob', ALL, SW))).toEqual(['t1', 't3', 't4', 't5', 't6', 't7']);
    // ana: nothing of software names her, so neither t5 nor the unowned t9;
    // her app records (the private project's t2, the free-floating t3) stay.
    expect(ids(visibleTasks(all, projects, 'ana', ALL, SW))).toEqual(['t1', 't2', 't3', 't4', 't6', 't7']);
    // App tasks are untouched by the mode.
    expect(ids(visibleTasks(all, projects, 'dana', NONE, SW))).toEqual(['t1', 't3']);
  });
});

/* ------------------------------------------------------------------ */
/* Scope                                                               */
/* ------------------------------------------------------------------ */

const plan = (userId: string, date: string): DailyPlan => ({
  id: `${date}_${userId}_r`,
  companyId: 'c',
  userId,
  roleId: 'r',
  date,
  headline: '',
  why: '',
  items: [],
  consequenceIfNotDone: '',
  deliveredAt: null,
  stale: false,
  feedback: {},
});

function input(overrides: Partial<ScopeInput> = {}): ScopeInput {
  return {
    today: new Date('2026-09-04T00:00:00'),
    objectives: [],
    projects: [project('p_open', 'company', ['ana'])],
    tasks: [],
    sources: [source('src_sw'), source('src_sales')],
    roles: [
      role('r_cto', ['src_sw']),
      role('r_sales', ['src_sales']),
      role('r_all', ['src_sw', 'src_sales']),
      role('r_none', []),
      // A developer: the backlog (sales here, for want of a third source) whole,
      // the task table only through their own assignments.
      role('r_dev', ['src_sw', 'src_sales'], ['src_sw']),
    ],
    members: [member('ana', 'owner', ['r_cto', 'r_all']), member('bob', 'member', ['r_cto']), member('carla', 'member', ['r_sales'])],
    planHistory: [],
    ...overrides,
  };
}

describe('scopeFor', () => {
  it('a role with no sources sees only app records', () => {
    const scope = scopeFor(
      input({ tasks: [task('t_app', null, 'ana'), task('t_sw', null, 'ana', 'src_sw')] }),
      'ana',
      'r_none',
    );
    expect(ids(scope.tasks)).toEqual(['t_app']);
    expect(scope.partial).toBe(true);
    expect(scope.sourceIds).toEqual([]);
  });

  it('an unknown role behaves like one with no sources', () => {
    const scope = scopeFor(input({ tasks: [task('t_sw', null, 'ana', 'src_sw')] }), 'ana', 'r_missing');
    expect(scope.role).toBeNull();
    expect(scope.tasks).toEqual([]);
  });

  // Six of Bob's seven tasks live in the software source. Somebody reading only
  // sales must not learn that Bob is overloaded: the average is computed from
  // what they see, and from that Bob looks like anyone else.
  it('never leaks a workload built from hidden tasks', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task(`sw${i}`, null, 'bob', 'src_sw')),
      task('sales_b', null, 'bob', 'src_sales'),
      task('sales_c', null, 'carla', 'src_sales'),
    ];
    const cto = scopeFor(input({ tasks }), 'ana', 'r_all');
    expect(cto.signals.some((s) => s.id === 'workload:bob')).toBe(true);

    const sales = scopeFor(input({ tasks }), 'carla', 'r_sales');
    expect(sales.signals.some((s) => s.id === 'workload:bob')).toBe(false);
  });

  it('does not report "no owned work" about somebody whose work is all hidden', () => {
    const tasks = [task('sw0', null, 'bob', 'src_sw'), task('sales_c', null, 'carla', 'src_sales')];
    const sales = scopeFor(input({ tasks }), 'carla', 'r_sales');
    expect(sales.signals.some((s) => s.id === 'no_owned_work:bob')).toBe(false);
    expect(ids(sales.users)).toEqual(['ana', 'carla']); // ana owns the open app project

    // The viewer themselves, with nothing visible to do, is still told so.
    const idle = scopeFor(input({ tasks }), 'ana', 'r_sales');
    expect(idle.signals.some((s) => s.id === 'no_owned_work:ana')).toBe(true);
  });

  it('drops "empty objective" from a partial view and keeps it from a full one', () => {
    const objectives = [
      {
        id: 'o1',
        companyId: 'c',
        title: 'Obj',
        expectedResult: '',
        startDate: '2026-01-01',
        targetDate: '2026-12-31',
        priority: 'medium' as const,
        ownerUserId: 'ana',
        progressPct: 50,
        status: 'on_track' as const,
        indicators: [],
      },
    ];
    const partial = scopeFor(input({ objectives }), 'ana', 'r_cto');
    expect(partial.partial).toBe(true);
    expect(partial.signals.some((s) => s.kind === 'empty_objective')).toBe(false);

    const full = scopeFor(input({ objectives }), 'ana', 'r_all');
    expect(full.partial).toBe(false);
    expect(full.signals.some((s) => s.kind === 'empty_objective')).toBe(true);
  });

  it('restricts plan history to the viewer for a member and to the visible people for a manager', () => {
    const planHistory = [plan('ana', '2026-09-03'), plan('bob', '2026-09-03'), plan('carla', '2026-09-03')];
    const tasks = [task('sw0', null, 'bob', 'src_sw')];
    const asMember = scopeFor(input({ planHistory, tasks }), 'bob', 'r_cto');
    expect(asMember.planHistory.map((p) => p.userId)).toEqual(['bob']);

    const asManager = scopeFor(input({ planHistory, tasks }), 'ana', 'r_cto');
    expect(asManager.planHistory.map((p) => p.userId).sort()).toEqual(['ana', 'bob']);
  });

  it('an assigned-only source makes the view partial and hides the other people in it', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task(`sw${i}`, null, 'ana', 'src_sw')),
      task('sw_bob', null, 'bob', 'src_sw'),
      task('sw_free', null, null, 'src_sw'),
      task('sales_c', null, 'carla', 'src_sales'),
    ];
    const dev = scopeFor(input({ tasks }), 'bob', 'r_dev');
    expect(dev.partial).toBe(true);
    expect(dev.sourceIds.sort()).toEqual(['src_sales', 'src_sw']);
    expect(dev.assignedOnlySourceIds).toEqual(['src_sw']);
    expect(ids(dev.tasks)).toEqual(['sw_bob', 'sales_c']);
    // Ana's six software tasks are out of view, so no workload about her and
    // she is not among the people in this view.
    expect(dev.signals.some((s) => s.id === 'workload:ana')).toBe(false);
    expect(ids(dev.users).sort()).toEqual(['ana', 'bob', 'carla']); // ana only through the app project
    expect(dev.users.some((u) => u.id === 'ana')).toBe(true);
  });

  it('tells a person with nothing of their own in an assigned-only source that they have no work', () => {
    const tasks = [task('sw_ana', null, 'ana', 'src_sw'), task('sw_free', null, null, 'src_sw')];
    const dev = scopeFor(input({ tasks }), 'bob', 'r_dev');
    expect(ids(dev.tasks)).toEqual([]);
    expect(dev.signals.some((s) => s.id === 'no_owned_work:bob')).toBe(true);
  });

  // The regression guard: reading everything must give exactly the company-wide answer.
  it('with every source visible, the signals are the company-wide ones', () => {
    const tasks = [
      task('a', 'p_open', 'ana', null, { dueDate: '2026-09-01' }),
      task('b', null, 'bob', 'src_sw', { dueDate: '2026-09-01', status: 'in_progress' }),
      task('c', null, 'carla', 'src_sales', { status: 'blocked' }),
    ];
    const scope = scopeFor(input({ tasks }), 'ana', 'r_all');
    const kinds = scope.signals.map((s) => s.id).sort();
    expect(kinds).toContain('overdue:a');
    expect(kinds).toContain('overdue:b');
    expect(kinds).toContain('blocked:c');
    expect(scope.partial).toBe(false);
  });
});

describe('visiblePullRequests and repos on roles', () => {
  const pulls = [
    pull('pr_bob', 'gh_api', ['bob', 'ana']),
    pull('pr_carla', 'gh_api', ['carla']),
    pull('pr_web', 'gh_web', ['bob']),
  ];

  it('shows a pull request only through a repository the role reads', () => {
    expect(ids(visiblePullRequests(pulls, 'bob', new Set(['gh_api'])))).toEqual(['pr_bob', 'pr_carla']);
    expect(ids(visiblePullRequests(pulls, 'bob', new Set()))).toEqual([]);
  });

  it('of an assigned-only repository, shows only the pull requests that name the person', () => {
    const api = new Set(['gh_api']);
    expect(ids(visiblePullRequests(pulls, 'bob', api, api))).toEqual(['pr_bob']);
    expect(ids(visiblePullRequests(pulls, 'ana', api, api))).toEqual(['pr_bob']);
    expect(ids(visiblePullRequests(pulls, 'dana', api, api))).toEqual([]);
  });

  it('puts repositories on roles like sources, without touching "partial", and names the approvers', () => {
    const base = input({
      repos: [repo('gh_api', 'p_open'), repo('gh_web')],
      pullRequests: pulls,
      roles: [role('r_all', ['src_sw', 'src_sales', 'gh_api']), role('r_dev', ['src_sw', 'src_sales', 'gh_api'], ['gh_api'])],
      members: [member('ana', 'owner', ['r_all']), member('bob', 'member', ['r_dev']), member('carla', 'member', ['r_dev'])],
      approverRoleIds: ['r_all'],
    });
    const cto = scopeFor(base, 'ana', 'r_all');
    expect(cto.repoIds).toEqual(['gh_api']);
    expect(cto.sourceIds).toContain('gh_api');
    expect(ids(cto.pullRequests)).toEqual(['pr_bob', 'pr_carla']);
    expect(cto.partial).toBe(false);
    expect(cto.approverUserIds).toEqual(['ana']);
    expect(ids(cto.users).sort()).toEqual(['ana', 'bob', 'carla']);

    const dev = scopeFor(base, 'bob', 'r_dev');
    expect(ids(dev.pullRequests)).toEqual(['pr_bob']);
    expect(dev.partial).toBe(false);
  });
});

describe('pickableTasks', () => {
  it('offers unowned open work from the app and from sources seen whole, highest priority first', () => {
    const tasks = [
      task('sw_free', null, null, 'src_sw'),
      task('sales_low', null, null, 'src_sales', { priority: 'low' }),
      task('sales_high', null, null, 'src_sales', { priority: 'high' }),
      task('sales_owned', null, 'carla', 'src_sales'),
      task('sales_done', null, null, 'src_sales', { status: 'done' }),
      task('app_free', null, null),
    ];
    const dev = scopeFor(input({ tasks }), 'bob', 'r_dev');
    expect(ids(pickableTasks(dev))).toEqual(['sales_high', 'app_free', 'sales_low']);
  });

  it('is empty when every visible source is assigned-only and nothing app-native is free', () => {
    const tasks = [task('sw_free', null, null, 'src_sw'), task('sw_bob', null, 'bob', 'src_sw')];
    const scope = scopeFor(
      input({ tasks, roles: [role('r_only', ['src_sw'], ['src_sw'])], members: [member('bob', 'member', ['r_only'])] }),
      'bob',
      'r_only',
    );
    expect(ids(scope.tasks)).toEqual(['sw_bob']);
    expect(pickableTasks(scope)).toEqual([]);
  });
});

describe('visibleSignals and teamSignals', () => {
  const tasks = [
    task('sw_bob', null, 'bob', 'src_sw', { dueDate: '2026-09-01' }),
    task('sales_carla', null, 'carla', 'src_sales', { dueDate: '2026-09-01' }),
    task('app_ana', null, 'ana', null, { dueDate: '2026-09-01' }),
  ];

  it('gives the viewer only what concerns them', () => {
    const scope = scopeFor(input({ tasks }), 'ana', 'r_all');
    expect(ids(visibleSignals(scope, 'ana'))).toEqual(['overdue:app_ana']);
  });

  it('groups the team by person and leaves out whoever has nothing visible', () => {
    const scope = scopeFor(input({ tasks }), 'ana', 'r_cto');
    const grouped = teamSignals(scope);
    expect([...grouped.keys()].sort()).toEqual(['ana', 'bob']);
    expect(grouped.has('carla')).toBe(false);
    expect(ids(grouped.get('bob') ?? [])).toEqual(['overdue:sw_bob']);
  });

  it('drops signals that are about nobody in particular', () => {
    const scope = scopeFor(input({ tasks: [] }), 'ana', 'r_all');
    for (const s of teamSignals(scope).values()) {
      expect(s.every((x) => x.userId || x.userIds?.length)).toBe(true);
    }
  });
});
