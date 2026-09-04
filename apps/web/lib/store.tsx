'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
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
  type Company,
  type CompanyAnalysis,
  type DailyPlan,
  type Indicator,
  type Membership,
  type Objective,
  type PlanItemVerdict,
  type Project,
  type Reading,
  type Risk,
  type Signal,
  type Task,
  type User,
  type VoiceUpdate,
} from '@truenorth/core';
import { useAuth } from './auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firebase } from './firebase';

/**
 * The editable business data, backed by Firestore.
 *
 * Everything a person can change about their company lives here: the north
 * star, objectives and their indicators, projects, tasks, roles and risks.
 * Screens read this context and never touch Firestore directly, so the shape
 * below is the contract between the data layer and the interface.
 *
 * Identity note: security rules let a person read only their own `users/{uid}`
 * document, so a member's display name and initials are denormalised onto
 * `companies/{cid}/members/{uid}`. `users` and `memberships` below are both
 * derived from those member documents.
 */

const COMPANY_KEY = 'truenorth.companyId';

/**
 * Adds today's value to a history, replacing any entry already recorded today.
 * Kept short: a year of daily edits is 365 small objects, well inside a
 * document, and Reports only ever plots the recent tail.
 */
function appendReading(history: Reading[] | undefined, value: number): Reading[] {
  const date = fixtures.TODAY;
  const rest = (history ?? []).filter((entry) => entry.date !== date);
  return [...rest, { date, value }].slice(-180);
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** One member document: role plus the identity the team screens need. */
interface MemberDoc {
  displayName: string;
  email: string;
  initials: string;
  roleTitle: string;
  roleDescription: string;
  access: Membership['access'];
}

/** One row in the company switcher, from the mirror under the user. */
export interface CompanyRef {
  id: string;
  companyName: string;
  roleTitle: string;
  access: Membership['access'];
  /** Mirrored so the switcher does not have to read every company document. */
  logoUrl?: string | null;
}

export interface PendingInvite {
  companyId: string;
  companyName: string;
  roleTitle: string;
  access: Membership['access'];
}

interface StoreValue {
  ready: boolean;
  /** Signed in, verified, but belonging to no company yet. */
  needsBootstrap: boolean;
  /** Whether this account is allowed to create a company from scratch. */
  canFound: boolean;
  /** An invitation waiting for this address, if any. */
  pendingInvite: PendingInvite | null;
  /** Every company this person belongs to, for the switcher. */
  companyList: CompanyRef[];
  error: string | null;

  today: Date;
  signals: Signal[];

  company: Company;
  users: User[];
  memberships: Membership[];
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  risks: Risk[];
  plan: DailyPlan;
  /** My own daily plans, newest first, for the briefing calendar. */
  planHistory: DailyPlan[];
  /** Company analyses by date, newest first. Written by the engine. */
  analyses: CompanyAnalysis[];
  voiceUpdates: VoiceUpdate[];

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

  /** Creates the first company and loads the starting data. Founders only. */
  bootstrap: () => Promise<void>;
  /** Creates an additional, empty company. Founders only. */
  createCompany: (name: string, northStar: string) => Promise<void>;
  /** Opens a different company this person belongs to. */
  switchCompany: (companyId: string) => void;
  /** Uploads a logo for a company and stores its download URL. */
  uploadCompanyLogo: (companyId: string, file: File) => Promise<void>;
  removeCompanyLogo: (companyId: string) => Promise<void>;
  /** Joins the company that invited this address. */
  acceptInvite: () => Promise<void>;
  /** Shares this company with somebody who already has an account. */
  inviteMember: (email: string, roleTitle: string, access: Membership['access']) => Promise<void>;
  resetToSeed: () => Promise<void>;
}

/**
 * Who may create a company from scratch. Mirrors `founders()` in
 * firestore.rules, which is where it is actually enforced; this copy only
 * decides which screen to show.
 */
const FOUNDERS = ['sergio@aditumcr.com'];

const StoreContext = createContext<StoreValue | null>(null);

/** Shown while data is loading, so screens never read undefined. */
const EMPTY_COMPANY: Company = {
  id: '',
  name: '',
  slug: '',
  northStar: '',
  northStarDeadline: fixtures.TODAY,
  plans: { m3: '', m6: '', m12: '' },
};

function emptyPlan(companyId: string, userId: string): DailyPlan {
  return {
    id: `${fixtures.TODAY}_${userId}`,
    companyId,
    userId,
    date: fixtures.TODAY,
    headline: '',
    why: '',
    items: [],
    consequenceIfNotDone: '',
    deliveredAt: null,
    stale: false,
    feedback: {},
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company>(EMPTY_COMPANY);
  const [members, setMembers] = useState<Record<string, MemberDoc>>({});
  const [objectives, setObjectives] = useState<Objective[]>([]);
  // Projects arrive from two queries; see the listeners below for why.
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [ownProjects, setOwnProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [planHistory, setPlanHistory] = useState<DailyPlan[]>([]);
  const [analyses, setAnalyses] = useState<CompanyAnalysis[]>([]);
  const [voiceUpdates, setVoiceUpdates] = useState<VoiceUpdate[]>([]);
  const [ready, setReady] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
  const [companyList, setCompanyList] = useState<CompanyRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uid = user?.uid ?? null;

  // Which company this browser last opened. A person can belong to several.
  useEffect(() => {
    if (!uid) return;
    try {
      setCompanyId(window.localStorage.getItem(COMPANY_KEY));
    } catch {
      setCompanyId(null);
    }
  }, [uid]);

  // Every company this person belongs to. The mirror under the user document
  // exists precisely so this needs no collection-group query. It runs always,
  // not only at first load, because it is also what the switcher lists.
  useEffect(() => {
    if (!uid) return;
    const { db } = firebase();
    return onSnapshot(
      collection(db, 'users', uid, 'memberships'),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<CompanyRef, 'id'>) }) satisfies CompanyRef,
        );
        setCompanyList(list);

        const first = list[0];
        if (first) {
          // Only choose one when nothing is open yet, or when the open one is
          // gone; otherwise switching would be undone on every snapshot.
          setCompanyId((current) => {
            if (current && list.some((row) => row.id === current)) return current;
            try {
              window.localStorage.setItem(COMPANY_KEY, first.id);
            } catch {
              /* remembering is a convenience */
            }
            return first.id;
          });
          setNeedsBootstrap(false);
        } else {
          // No membership yet. An invitation is the other way in, so look for
          // one addressed to this account before deciding there is nothing.
          void getDoc(doc(db, 'invites', (user?.email ?? '').toLowerCase()))
            .then((invite) => {
              setPendingInvite(
                invite.exists() ? (invite.data() as PendingInvite) : null,
              );
            })
            .catch(() => setPendingInvite(null))
            .finally(() => {
              setNeedsBootstrap(true);
              setReady(true);
            });
        }
      },
      (cause) => setError(cause.message),
    );
  }, [uid, user]);

  // Live subscriptions. Everything a screen shows updates without a refresh,
  // which is what makes an edit on the phone appear on the desktop.
  useEffect(() => {
    if (!uid || !companyId) return;
    const { db } = firebase();
    const base = doc(db, 'companies', companyId);
    const fail = (cause: { message: string }) => setError(cause.message);

    const subs = [
      onSnapshot(
        base,
        (snap) => {
          if (!snap.exists()) {
            setNeedsBootstrap(true);
            setReady(true);
            return;
          }
          const next = { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
          setCompany(next);
          setNeedsBootstrap(false);
          setReady(true);
          // Keep the switcher's mirror in step with the name and the logo.
          if (uid) {
            void setDoc(
              doc(db, 'users', uid, 'memberships', snap.id),
              { companyName: next.name, logoUrl: next.logoUrl ?? null },
              { merge: true },
            ).catch(() => {
              /* the mirror is a convenience; the app works without it */
            });
          }
        },
        fail,
      ),
      onSnapshot(
        collection(base, 'members'),
        (snap) => {
          const next: Record<string, MemberDoc> = {};
          snap.forEach((d) => {
            next[d.id] = d.data() as MemberDoc;
          });
          setMembers(next);
        },
        fail,
      ),
      onSnapshot(
        collection(base, 'objectives'),
        (snap) => setObjectives(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Objective)),
        fail,
      ),
      // Two listeners, not one. Firestore rules are not filters: a rule that
      // inspects the document rejects any query it cannot prove safe, so an
      // unfiltered listener on this collection is refused. Each query below
      // matches one branch of the read rule, and the results are merged.
      onSnapshot(
        query(collection(base, 'projects'), where('visibility', '==', 'company')),
        (snap) =>
          setSharedProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project)),
        fail,
      ),
      onSnapshot(
        query(collection(base, 'projects'), where('memberUserIds', 'array-contains', uid)),
        (snap) => setOwnProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project)),
        fail,
      ),
      onSnapshot(
        collection(base, 'tasks'),
        (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task)),
        fail,
      ),
      onSnapshot(
        collection(base, 'risks'),
        (snap) => setRisks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Risk)),
        fail,
      ),
      // The calendar of past days. Filtered by uid because the read rule
      // inspects it, and rules are not filters.
      onSnapshot(
        query(
          collection(base, 'plans'),
          where('uid', '==', uid),
          orderBy('date', 'desc'),
          limit(120),
        ),
        (snap) =>
          setPlanHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyPlan)),
        () => setPlanHistory([]),
      ),
      onSnapshot(
        query(collection(base, 'analyses'), orderBy('date', 'desc'), limit(120)),
        (snap) =>
          setAnalyses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CompanyAnalysis)),
        () => setAnalyses([]),
      ),
      onSnapshot(
        doc(base, 'plans', `${fixtures.TODAY}_${uid}`),
        (snap) => setPlan(snap.exists() ? ({ id: snap.id, ...snap.data() } as DailyPlan) : null),
        // A missing plan is normal before the engine has run; do not shout.
        () => setPlan(null),
      ),
    ];

    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [uid, companyId]);

  const write = useCallback(
    (fn: (db: Firestore, cid: string) => Promise<unknown>) => {
      if (!companyId) return;
      const { db } = firebase();
      void fn(db, companyId).catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.'),
      );
    },
    [companyId],
  );

  /** Health is derived, never stored by hand, so it is recomputed on write. */
  const withHealth = useCallback(
    <T extends { startDate: string; targetDate: string; progressPct: number }>(item: T) => ({
      ...item,
      status: healthFrom(item, new Date(`${fixtures.TODAY}T00:00:00`)),
    }),
    [],
  );

  const bootstrap = useCallback(async () => {
    if (!uid || !user) return;
    const { db } = firebase();
    const cid = newId('c');
    const seed = fixtures.companies[0]!;
    const base = doc(db, 'companies', cid);

    // Order matters, and it cannot be a single batch. Rules are evaluated
    // against the database as it is *now*, so a batched write cannot depend on
    // another document created in the same batch: `isCreator` would not find
    // the company, and `isMember` would not find the member document. Hence
    // three steps, each one making the next one legal.

    // 1. The company. `createdBy` is what later lets this person add
    //    themselves as the first member, which no admin could do because
    //    being an admin requires the very document being created.
    await setDoc(base, {
      createdBy: uid,
      createdAt: serverTimestamp(),
      name: seed.name,
      slug: seed.slug,
      northStar: seed.northStar,
      northStarDeadline: seed.northStarDeadline,
      plans: seed.plans,
    });

    // 2. Their own membership. Now `isCreator(cid)` can read the company.
    const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Sin nombre';
    await setDoc(doc(base, 'members', uid), {
      displayName,
      email: user.email ?? '',
      initials: initialsFrom(displayName),
      roleTitle: fixtures.memberships[0]!.roleTitle,
      roleDescription: fixtures.memberships[0]!.roleDescription,
      access: 'owner',
    });

    // 3. The starting data. Now `isMember(cid)` succeeds, so this can be one
    //    batch and either all of it lands or none of it does.
    const batch = writeBatch(db);
    const remap = (id: string | null) => (id === fixtures.users[0]!.id ? uid : null);

    for (const objective of fixtures.objectives) {
      const { id, ...rest } = objective;
      batch.set(doc(base, 'objectives', id), { ...rest, companyId: cid, ownerUserId: uid });
    }
    for (const project of fixtures.projects) {
      const { id, ...rest } = project;
      batch.set(doc(base, 'projects', id), {
        ...rest,
        companyId: cid,
        ownerUserId: uid,
        memberUserIds: [uid],
      });
    }
    for (const task of fixtures.tasks) {
      const { id, ...rest } = task;
      batch.set(doc(base, 'tasks', id), {
        ...rest,
        companyId: cid,
        assigneeUserId: remap(task.assigneeUserId),
      });
    }
    for (const risk of fixtures.risks) {
      const { id, ...rest } = risk;
      batch.set(doc(base, 'risks', id), { ...rest, companyId: cid, ownerUserId: uid });
    }

    // Until the engine runs, seed today's plan so the app is usable end to end.
    const seedPlan = fixtures.todaysPlan;
    batch.set(doc(base, 'plans', `${fixtures.TODAY}_${uid}`), {
      companyId: cid,
      uid,
      userId: uid,
      date: fixtures.TODAY,
      headline: seedPlan.headline,
      why: seedPlan.why,
      items: seedPlan.items,
      consequenceIfNotDone: seedPlan.consequenceIfNotDone,
      deliveredAt: seedPlan.deliveredAt,
      stale: false,
      feedback: {},
    });

    // A short run of past days, so the briefing calendar is not empty on the
    // first launch. Sample data, like the rest of the seed.
    for (const past of fixtures.pastPlans) {
      batch.set(doc(base, 'plans', `${past.date}_${uid}`), {
        companyId: cid,
        uid,
        userId: uid,
        date: past.date,
        headline: past.headline,
        why: past.why,
        items: past.items.map((item) => ({ ...item, signalIds: item.signalIds })),
        consequenceIfNotDone: past.consequenceIfNotDone,
        deliveredAt: `${past.date}T06:30:00-06:00`,
        stale: false,
        feedback: past.feedback,
      });
    }

    await batch.commit();

    // 4. The mirror that makes this company findable on the next sign-in. A
    //    trigger takes this over once Cloud Functions exist.
    await setDoc(doc(db, 'users', uid, 'memberships', cid), {
      companyName: seed.name,
      roleTitle: fixtures.memberships[0]!.roleTitle,
      access: 'owner',
    });

    try {
      window.localStorage.setItem(COMPANY_KEY, cid);
    } catch {
      /* convenience only */
    }
    setCompanyId(cid);
    setNeedsBootstrap(false);
  }, [uid, user]);

  // Merge the two project queries, keeping one entry per id.
  const projects = useMemo(() => {
    const byId = new Map<string, Project>();
    for (const project of [...sharedProjects, ...ownProjects]) byId.set(project.id, project);
    return [...byId.values()];
  }, [sharedProjects, ownProjects]);

  const value = useMemo<StoreValue>(() => {
    const today = new Date(`${fixtures.TODAY}T00:00:00`);

    // users and memberships both come from the member documents.
    const users: User[] = Object.entries(members).map(([id, m]) => ({
      id,
      displayName: m.displayName,
      email: m.email,
      initials: m.initials || initialsFrom(m.displayName),
      timezone: 'America/Costa_Rica',
      notifyHour: 6,
      locale: 'es',
      theme: 'system',
      reduceTransparency: false,
    }));

    const memberships: Membership[] = Object.entries(members).map(([id, m]) => ({
      userId: id,
      companyId,
      roleTitle: m.roleTitle,
      roleDescription: m.roleDescription,
      access: m.access,
    })) as Membership[];

    const currentUser: User =
      users.find((u) => u.id === uid) ??
      ({
        id: uid ?? '',
        displayName: user?.displayName ?? '',
        email: user?.email ?? '',
        initials: initialsFrom(user?.displayName ?? user?.email ?? '?'),
        timezone: 'America/Costa_Rica',
        notifyHour: 6,
        locale: 'es',
        theme: 'system',
        reduceTransparency: false,
      } satisfies User);

    const currentMembership: Membership =
      memberships.find((m) => m.userId === uid) ??
      ({
        userId: uid ?? '',
        companyId: companyId ?? '',
        roleTitle: '',
        roleDescription: '',
        access: 'member',
      } satisfies Membership);

    const signals = computeSignals({ today, objectives, projects, tasks, users });
    const currentPlan = plan ?? emptyPlan(companyId ?? '', uid ?? '');

    return {
      ready,
      needsBootstrap,
      canFound: FOUNDERS.includes((user?.email ?? '').toLowerCase()),
      pendingInvite,
      companyList,
      error,
      today,
      signals,
      company,
      users,
      memberships,
      objectives,
      projects,
      tasks,
      risks,
      plan: currentPlan,
      planHistory,
      analyses,
      voiceUpdates,
      currentUser,
      currentMembership,

      updateCompany: (patch) =>
        write((db, cid) => updateDoc(doc(db, 'companies', cid), patch)),

      upsertObjective: (objective) =>
        write((db, cid) => {
          const { id, ...rest } = withHealth(objective);
          const previous = objectives.find((o) => o.id === id);
          return setDoc(doc(db, 'companies', cid, 'objectives', id), {
            ...rest,
            companyId: cid,
            // A reading per change, so Reports can plot a trend instead of a
            // single number. One entry per day: editing twice in a day
            // corrects the day rather than adding a second point.
            history: appendReading(previous?.history, rest.progressPct),
            indicators: rest.indicators.map((indicator) => {
              const before = previous?.indicators.find((i) => i.id === indicator.id);
              return before && before.current === indicator.current
                ? indicator
                : { ...indicator, history: appendReading(before?.history, indicator.current) };
            }),
          });
        }),

      deleteObjective: (id) =>
        write(async (db, cid) => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'companies', cid, 'objectives', id));
          // Unlink rather than leave dangling references behind.
          for (const project of projects) {
            if (project.objectiveIds.includes(id)) {
              batch.update(doc(db, 'companies', cid, 'projects', project.id), {
                objectiveIds: project.objectiveIds.filter((oid) => oid !== id),
              });
            }
          }
          for (const risk of risks) {
            if (risk.objectiveId === id) {
              batch.delete(doc(db, 'companies', cid, 'risks', risk.id));
            }
          }
          return batch.commit();
        }),

      upsertIndicator: (objectiveId, indicator) =>
        write((db, cid) => {
          const objective = objectives.find((o) => o.id === objectiveId);
          if (!objective) return Promise.resolve();
          const index = objective.indicators.findIndex((i) => i.id === indicator.id);
          const indicators =
            index >= 0
              ? objective.indicators.map((i, n) => (n === index ? indicator : i))
              : [...objective.indicators, indicator];
          return updateDoc(doc(db, 'companies', cid, 'objectives', objectiveId), { indicators });
        }),

      deleteIndicator: (objectiveId, indicatorId) =>
        write((db, cid) => {
          const objective = objectives.find((o) => o.id === objectiveId);
          if (!objective) return Promise.resolve();
          return updateDoc(doc(db, 'companies', cid, 'objectives', objectiveId), {
            indicators: objective.indicators.filter((i) => i.id !== indicatorId),
          });
        }),

      upsertProject: (project) =>
        write((db, cid) => {
          const { id, ...rest } = withHealth(project);
          return setDoc(doc(db, 'companies', cid, 'projects', id), { ...rest, companyId: cid });
        }),

      deleteProject: (id) =>
        write(async (db, cid) => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'companies', cid, 'projects', id));
          for (const task of tasks) {
            if (task.projectId === id) {
              batch.update(doc(db, 'companies', cid, 'tasks', task.id), { projectId: null });
            }
          }
          for (const risk of risks) {
            if (risk.projectId === id) {
              batch.delete(doc(db, 'companies', cid, 'risks', risk.id));
            }
          }
          return batch.commit();
        }),

      upsertTask: (task) =>
        write((db, cid) => {
          const { id, ...rest } = task;
          return setDoc(doc(db, 'companies', cid, 'tasks', id), { ...rest, companyId: cid });
        }),

      deleteTask: (id) =>
        write(async (db, cid) => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'companies', cid, 'tasks', id));
          for (const task of tasks) {
            if (task.dependsOn.includes(id)) {
              batch.update(doc(db, 'companies', cid, 'tasks', task.id), {
                dependsOn: task.dependsOn.filter((d) => d !== id),
              });
            }
          }
          return batch.commit();
        }),

      updateMembership: (userId, patch) =>
        write((db, cid) =>
          updateDoc(doc(db, 'companies', cid, 'members', userId), {
            ...(patch.roleTitle !== undefined ? { roleTitle: patch.roleTitle } : {}),
            ...(patch.roleDescription !== undefined
              ? { roleDescription: patch.roleDescription }
              : {}),
            ...(patch.access !== undefined ? { access: patch.access } : {}),
          }),
        ),

      upsertRisk: (risk) =>
        write((db, cid) => {
          const { id, ...rest } = risk;
          return setDoc(doc(db, 'companies', cid, 'risks', id), { ...rest, companyId: cid });
        }),

      deleteRisk: (id) => write((db, cid) => deleteDoc(doc(db, 'companies', cid, 'risks', id))),

      setPlanFeedback: (index, verdict) =>
        write((db, cid) => {
          const feedback = { ...currentPlan.feedback };
          if (verdict === null) delete feedback[index];
          else feedback[index] = verdict;
          return updateDoc(doc(db, 'companies', cid, 'plans', currentPlan.id), { feedback });
        }),

      markPlanStale: (stale) =>
        write((db, cid) =>
          updateDoc(doc(db, 'companies', cid, 'plans', currentPlan.id), { stale }),
        ),

      // Voice updates are local until the worker and the Notion writer exist;
      // see ADR-004 for who is allowed to perform the write itself.
      addVoiceUpdate: (update) => setVoiceUpdates((current) => [update, ...current]),

      applyVoiceUpdate: (id, acceptedIndexes) => {
        const update = voiceUpdates.find((u) => u.id === id);
        if (!update) return;
        const accepted = new Set(acceptedIndexes);
        write(async (db, cid) => {
          const batch = writeBatch(db);
          update.changes.forEach((change, index) => {
            if (!accepted.has(index)) return;
            const task = tasks.find(
              (t) => t.id === change.taskId || t.code === change.taskCode,
            );
            if (!task) return;
            const ref = doc(db, 'companies', cid, 'tasks', task.id);
            if (change.field === 'status') {
              batch.update(ref, {
                notionStatus: change.to,
                status:
                  change.to === 'Depende de otra TAR'
                    ? 'blocked'
                    : change.to === 'Finalizada' || change.to === 'Archivadas'
                      ? 'done'
                      : change.to === 'Sin empezar'
                        ? 'todo'
                        : 'in_progress',
              });
            }
            if (change.field === 'dueDate') batch.update(ref, { dueDate: change.to || null });
          });
          return batch.commit();
        });
        setVoiceUpdates((current) =>
          current.map((u) =>
            u.id === id
              ? { ...u, status: 'applied', appliedAt: new Date().toISOString() }
              : u,
          ),
        );
      },

      bootstrap,

      createCompany: async (name, northStar) => {
        if (!uid || !user) return;
        const { db } = firebase();
        const cid = newId('c');
        const year = new Date(`${fixtures.TODAY}T00:00:00`).getFullYear() + 1;

        // Same three-step ordering as the bootstrap: the company has to exist
        // before its creator can add themselves, because the rule that lets
        // them reads the company.
        await setDoc(doc(db, 'companies', cid), {
          createdBy: uid,
          createdAt: serverTimestamp(),
          name: name.trim(),
          slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          northStar: northStar.trim(),
          northStarDeadline: `${year}-12-31`,
          plans: { m3: '', m6: '', m12: '' },
        });

        const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Sin nombre';
        await setDoc(doc(db, 'companies', cid, 'members', uid), {
          displayName,
          email: user.email ?? '',
          initials: initialsFrom(displayName),
          roleTitle: currentMembership.roleTitle || 'Owner',
          roleDescription: '',
          access: 'owner',
        });

        await setDoc(doc(db, 'users', uid, 'memberships', cid), {
          companyName: name.trim(),
          roleTitle: currentMembership.roleTitle || 'Owner',
          access: 'owner',
        });

        try {
          window.localStorage.setItem(COMPANY_KEY, cid);
        } catch {
          /* convenience only */
        }
        setCompanyId(cid);
      },

      uploadCompanyLogo: async (targetCompanyId, file) => {
        const { db, storage } = firebase();
        // The extension keeps the object recognisable in the console; the name
        // is fixed so a new upload replaces the old one instead of piling up.
        const extension = (file.name.split('.').pop() ?? 'png').toLowerCase().slice(0, 5);
        const objectRef = ref(storage, `logos/${targetCompanyId}/logo.${extension}`);
        await uploadBytes(objectRef, file, { contentType: file.type });
        const logoUrl = await getDownloadURL(objectRef);
        await updateDoc(doc(db, 'companies', targetCompanyId), { logoUrl });
      },

      removeCompanyLogo: async (targetCompanyId) => {
        const { db } = firebase();
        // The object itself is left in Storage: it is small, and deleting it
        // would break any URL already rendered elsewhere.
        await updateDoc(doc(db, 'companies', targetCompanyId), { logoUrl: null });
      },

      switchCompany: (nextId) => {
        if (nextId === companyId) return;
        // Clear the previous company's data so a screen never shows a mix of
        // two while the new listeners settle.
        setCompany(EMPTY_COMPANY);
        setMembers({});
        setObjectives([]);
        setSharedProjects([]);
        setOwnProjects([]);
        setTasks([]);
        setRisks([]);
        setPlan(null);
        try {
          window.localStorage.setItem(COMPANY_KEY, nextId);
        } catch {
          /* convenience only */
        }
        setCompanyId(nextId);
      },

      acceptInvite: async () => {
        if (!uid || !user || !pendingInvite) return;
        const { db } = firebase();
        const cid = pendingInvite.companyId;
        const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Sin nombre';

        // Redeeming is three writes: the member document the rules key access
        // off, the mirror that makes the company findable next time, and the
        // invitation itself, which is consumed.
        await setDoc(doc(db, 'companies', cid, 'members', uid), {
          displayName,
          email: user.email ?? '',
          initials: initialsFrom(displayName),
          roleTitle: pendingInvite.roleTitle,
          roleDescription: '',
          access: pendingInvite.access,
        });
        await setDoc(doc(db, 'users', uid, 'memberships', cid), {
          companyName: pendingInvite.companyName,
          roleTitle: pendingInvite.roleTitle,
          access: pendingInvite.access,
        });
        await deleteDoc(doc(db, 'invites', (user.email ?? '').toLowerCase())).catch(() => {
          // Leaving a spent invitation behind is untidy, not harmful.
        });

        try {
          window.localStorage.setItem(COMPANY_KEY, cid);
        } catch {
          /* convenience only */
        }
        setPendingInvite(null);
        setCompanyId(cid);
        setNeedsBootstrap(false);
      },

      inviteMember: async (inviteEmail, roleTitle, access) => {
        if (!companyId || !uid) return;
        const { db } = firebase();
        const address = inviteEmail.trim().toLowerCase();
        await setDoc(doc(db, 'invites', address), {
          email: address,
          companyId,
          companyName: company.name,
          roleTitle,
          access,
          invitedBy: uid,
          createdAt: serverTimestamp(),
        });
      },

      resetToSeed: async () => {
        if (!companyId || !uid) return;
        const { db } = firebase();
        const batch = writeBatch(db);
        const base = doc(db, 'companies', companyId);
        for (const objective of objectives) batch.delete(doc(base, 'objectives', objective.id));
        for (const project of projects) batch.delete(doc(base, 'projects', project.id));
        for (const task of tasks) batch.delete(doc(base, 'tasks', task.id));
        for (const risk of risks) batch.delete(doc(base, 'risks', risk.id));
        await batch.commit();
        try {
          window.localStorage.removeItem(COMPANY_KEY);
        } catch {
          /* convenience only */
        }
        setCompanyId(null);
        setNeedsBootstrap(true);
      },
    };
  }, [
    ready,
    needsBootstrap,
    pendingInvite,
    companyList,
    error,
    company,
    members,
    objectives,
    projects,
    tasks,
    risks,
    plan,
    planHistory,
    analyses,
    voiceUpdates,
    companyId,
    uid,
    user,
    write,
    withHealth,
    bootstrap,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

export function useRiskCount(): number {
  const { signals } = useStore();
  return signals.filter((s) => s.severity !== 'info').length;
}

/* ------------------------------------------------------------------ */
/* Factories for the editing sheets                                    */
/* ------------------------------------------------------------------ */

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
