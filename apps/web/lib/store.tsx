'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  computeSignals,
  fixtures,
  healthFrom,
  progressGap,
  type Company,
  type DailyPlan,
  type Indicator,
  type Membership,
  type Objective,
  type PlanItemVerdict,
  type Project,
  type Risk,
  type Signal,
  type Task,
  type User,
  type VoiceUpdate,
} from '@truenorth/core';

/**
 * The editable business data.
 *
 * Everything a person can change about their company lives here: the north
 * star, objectives and their indicators, projects, tasks, roles and risks.
 * Today it is seeded from the ADITUM fixtures and persisted per browser; when
 * Firestore is wired the mutations below become writes and the shape of this
 * context does not change, so no screen has to be rewritten.
 */

/** Bump when the seed shape changes so stale snapshots do not mask it. */
const STORAGE_KEY = 'truenorth.data.v2';

interface Snapshot {
  company: Company;
  users: User[];
  memberships: Membership[];
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  risks: Risk[];
  plan: DailyPlan;
  voiceUpdates: VoiceUpdate[];
}

function seed(): Snapshot {
  return structuredClone({
    company: fixtures.companies[0]!,
    users: fixtures.users,
    memberships: fixtures.memberships,
    objectives: fixtures.objectives,
    projects: fixtures.projects,
    tasks: fixtures.tasks,
    risks: fixtures.risks,
    plan: fixtures.todaysPlan,
    voiceUpdates: [],
  });
}

function load(): Snapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    const base = seed();
    // Merge field by field so a snapshot written by an older build still opens.
    return {
      company: parsed.company ?? base.company,
      users: parsed.users ?? base.users,
      memberships: parsed.memberships ?? base.memberships,
      objectives: parsed.objectives ?? base.objectives,
      projects: parsed.projects ?? base.projects,
      tasks: parsed.tasks ?? base.tasks,
      risks: parsed.risks ?? base.risks,
      plan: parsed.plan ?? base.plan,
      voiceUpdates: parsed.voiceUpdates ?? base.voiceUpdates,
    };
  } catch {
    return seed();
  }
}

function persist(snapshot: Snapshot): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage may be unavailable. Edits still apply for this session.
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

interface StoreValue extends Snapshot {
  today: Date;
  signals: Signal[];
  ready: boolean;

  /** Person currently signed in. Replaced by Firebase Auth later. */
  currentUser: User;
  currentMembership: Membership;

  updateCompany: (patch: Partial<Company>) => void;

  upsertObjective: (objective: Objective) => void;
  deleteObjective: (id: string) => void;
  upsertIndicator: (objectiveId: string, indicator: Indicator) => void;
  deleteIndicator: (objectiveId: string, indicatorId: string) => void;

  upsertProject: (project: Project) => void;
  deleteProject: (id: string) => void;

  upsertTask: (task: Task) => void;
  deleteTask: (id: string) => void;

  updateMembership: (userId: string, patch: Partial<Membership>) => void;

  upsertRisk: (risk: Risk) => void;
  deleteRisk: (id: string) => void;

  setPlanFeedback: (index: number, verdict: PlanItemVerdict | null) => void;
  markPlanStale: (stale: boolean) => void;

  addVoiceUpdate: (update: VoiceUpdate) => void;
  applyVoiceUpdate: (id: string, acceptedIndexes: number[]) => void;

  resetToSeed: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSnapshot(load());
    setReady(true);
  }, []);

  const mutate = useCallback((fn: (draft: Snapshot) => void) => {
    setSnapshot((current) => {
      const next = structuredClone(current);
      fn(next);
      // Health is derived, never stored by hand: recompute after every edit so
      // a progress or date change immediately shows the right status.
      const today = new Date(`${fixtures.TODAY}T00:00:00`);
      for (const objective of next.objectives) objective.status = healthFrom(objective, today);
      for (const project of next.projects) project.status = healthFrom(project, today);
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo<StoreValue>(() => {
    const today = new Date(`${fixtures.TODAY}T00:00:00`);
    const currentUser = snapshot.users[0]!;
    const currentMembership =
      snapshot.memberships.find((m) => m.userId === currentUser.id) ?? snapshot.memberships[0]!;

    const signals = computeSignals({
      today,
      objectives: snapshot.objectives,
      projects: snapshot.projects,
      tasks: snapshot.tasks,
      users: snapshot.users,
    });

    return {
      ...snapshot,
      today,
      signals,
      ready,
      currentUser,
      currentMembership,

      updateCompany: (patch) =>
        mutate((draft) => {
          draft.company = { ...draft.company, ...patch };
        }),

      upsertObjective: (objective) =>
        mutate((draft) => {
          const index = draft.objectives.findIndex((o) => o.id === objective.id);
          if (index >= 0) draft.objectives[index] = objective;
          else draft.objectives.push(objective);
        }),

      deleteObjective: (id) =>
        mutate((draft) => {
          draft.objectives = draft.objectives.filter((o) => o.id !== id);
          // Unlink it everywhere rather than leaving dangling references.
          for (const project of draft.projects) {
            project.objectiveIds = project.objectiveIds.filter((oid) => oid !== id);
          }
          draft.risks = draft.risks.filter((r) => r.objectiveId !== id);
        }),

      upsertIndicator: (objectiveId, indicator) =>
        mutate((draft) => {
          const objective = draft.objectives.find((o) => o.id === objectiveId);
          if (!objective) return;
          const index = objective.indicators.findIndex((i) => i.id === indicator.id);
          if (index >= 0) objective.indicators[index] = indicator;
          else objective.indicators.push(indicator);
        }),

      deleteIndicator: (objectiveId, indicatorId) =>
        mutate((draft) => {
          const objective = draft.objectives.find((o) => o.id === objectiveId);
          if (!objective) return;
          objective.indicators = objective.indicators.filter((i) => i.id !== indicatorId);
        }),

      upsertProject: (project) =>
        mutate((draft) => {
          const index = draft.projects.findIndex((p) => p.id === project.id);
          if (index >= 0) draft.projects[index] = project;
          else draft.projects.push(project);
        }),

      deleteProject: (id) =>
        mutate((draft) => {
          draft.projects = draft.projects.filter((p) => p.id !== id);
          for (const task of draft.tasks) {
            if (task.projectId === id) task.projectId = null;
          }
          draft.risks = draft.risks.filter((r) => r.projectId !== id);
        }),

      upsertTask: (task) =>
        mutate((draft) => {
          const index = draft.tasks.findIndex((t) => t.id === task.id);
          if (index >= 0) draft.tasks[index] = task;
          else draft.tasks.push(task);
          draft.plan.stale = true;
        }),

      deleteTask: (id) =>
        mutate((draft) => {
          draft.tasks = draft.tasks.filter((t) => t.id !== id);
          for (const task of draft.tasks) {
            task.dependsOn = task.dependsOn.filter((d) => d !== id);
          }
          draft.plan.stale = true;
        }),

      updateMembership: (userId, patch) =>
        mutate((draft) => {
          const index = draft.memberships.findIndex((m) => m.userId === userId);
          if (index >= 0) draft.memberships[index] = { ...draft.memberships[index]!, ...patch };
        }),

      upsertRisk: (risk) =>
        mutate((draft) => {
          const index = draft.risks.findIndex((r) => r.id === risk.id);
          if (index >= 0) draft.risks[index] = risk;
          else draft.risks.push(risk);
        }),

      deleteRisk: (id) =>
        mutate((draft) => {
          draft.risks = draft.risks.filter((r) => r.id !== id);
        }),

      setPlanFeedback: (index, verdict) =>
        mutate((draft) => {
          if (verdict === null) delete draft.plan.feedback[index];
          else draft.plan.feedback[index] = verdict;
        }),

      markPlanStale: (stale) =>
        mutate((draft) => {
          draft.plan.stale = stale;
        }),

      addVoiceUpdate: (update) =>
        mutate((draft) => {
          draft.voiceUpdates.unshift(update);
        }),

      applyVoiceUpdate: (id, acceptedIndexes) =>
        mutate((draft) => {
          const update = draft.voiceUpdates.find((u) => u.id === id);
          if (!update) return;
          const accepted = new Set(acceptedIndexes);
          update.changes.forEach((change, index) => {
            if (!accepted.has(index)) return;
            const task = draft.tasks.find(
              (t) => t.id === change.taskId || t.code === change.taskCode,
            );
            if (!task) return;
            if (change.field === 'status') {
              task.notionStatus = change.to;
              task.status =
                change.to === 'Depende de otra TAR'
                  ? 'blocked'
                  : change.to === 'Finalizada' || change.to === 'Archivadas'
                    ? 'done'
                    : change.to === 'Sin empezar'
                      ? 'todo'
                      : 'in_progress';
            }
            if (change.field === 'dueDate') task.dueDate = change.to || null;
          });
          update.status = 'applied';
          update.discarded = update.changes
            .map((_, index) => index)
            .filter((index) => !accepted.has(index));
          update.appliedAt = new Date().toISOString();
          update.notionWriteStatus = update.changes.some(
            (c, i) => accepted.has(i) && c.conflict,
          )
            ? 'conflict'
            : 'ok';
          draft.plan.stale = true;
        }),

      resetToSeed: () => {
        const fresh = seed();
        persist(fresh);
        setSnapshot(fresh);
      },
    };
  }, [snapshot, ready, mutate]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

/* ------------------------------------------------------------------ */
/* Derived helpers used across screens                                 */
/* ------------------------------------------------------------------ */

export function useObjectiveProgress(objective: Objective) {
  const { today } = useStore();
  return {
    gap: progressGap(objective, today),
    expected: Math.round(progressGap(objective, today) + objective.progressPct),
  };
}

export function useRiskCount(): number {
  const { signals } = useStore();
  return signals.filter((s) => s.severity !== 'info').length;
}

export function makeObjective(companyId: string, ownerUserId: string): Objective {
  const year = new Date(`${fixtures.TODAY}T00:00:00`).getFullYear();
  return {
    id: newId('o'),
    companyId,
    title: '',
    expectedResult: '',
    startDate: fixtures.TODAY,
    targetDate: `${year}-12-31`,
    priority: 'medium',
    ownerUserId,
    progressPct: 0,
    status: 'on_track',
    indicators: [],
  };
}

export function makeProject(companyId: string, ownerUserId: string): Project {
  const year = new Date(`${fixtures.TODAY}T00:00:00`).getFullYear();
  return {
    id: newId('p'),
    companyId,
    name: '',
    description: '',
    visibility: 'company',
    objectiveIds: [],
    memberUserIds: [ownerUserId],
    ownerUserId,
    startDate: fixtures.TODAY,
    targetDate: `${year}-12-31`,
    progressPct: 0,
    status: 'on_track',
    source: 'app',
  };
}

export function makeTask(companyId: string, projectId: string | null): Task {
  return {
    id: newId('t'),
    companyId,
    projectId,
    code: '',
    title: '',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    assigneeUserId: null,
    dependsOn: [],
    source: 'app',
  };
}

export function makeIndicator(): Indicator {
  return {
    id: newId('i'),
    name: '',
    unit: '',
    baseline: 0,
    current: 0,
    target: 100,
    direction: 'up',
  };
}

export function makeRisk(companyId: string, ownerUserId: string | null): Risk {
  return {
    id: newId('r'),
    companyId,
    description: '',
    severity: 'medium',
    ownerUserId,
    source: 'manual',
  };
}
