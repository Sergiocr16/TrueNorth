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
  atMidnight,
  computeSignals,
  roleSourceIds,
  shiftIso,
  todayIso,
  healthFrom,
  type Company,
  type CompanyAnalysis,
  type DailyPlan,
  type Indicator,
  type Membership,
  type NotionSource,
  type Role,
  type AskAction,
  type CitedSignal,
  type FollowUpOutcome,
  type Situation,
  type TeamFollowUp,
  type Objective,
  type PlanItemVerdict,
  type Project,
  type Reading,
  type Risk,
  type Signal,
  type Task,
  type User,
  type VoiceUpdate,
  type WorkerHeartbeat,
} from '@truenorth/core';
import type { InspectResult, SyncReport } from '../server/notion/types';
import type { NotionTableSummary } from '@truenorth/core';
import { useAuth } from './auth';
import { firebase } from './firebase';
import { currentPushToken, disablePush, enablePush, type PushState } from './push';

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

/** The engine that serves this app. One Pi, one id; see run.ts. */
const WORKER_ID = 'pi-01';

/** Today in Costa Rica, fixed when the module loads. A reload picks up a new day. */
const TODAY = todayIso();

/**
 * The sample data is written against a frozen date. When it is seeded, its
 * relative dates are shifted so "yesterday" in the fixture is yesterday here.
 */
/**
 * Adds today's value to a history, replacing any entry already recorded today.
 * Kept short: a year of daily edits is 365 small objects, well inside a
 * document, and Reports only ever plots the recent tail.
 */
function appendReading(history: Reading[] | undefined, value: number): Reading[] {
  const date = TODAY;
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
  /** Absent on documents written before roles existed. */
  roleIds?: string[];
  activeRoleId?: string | null;
  access: Membership['access'];
  /** Absent means true: an account. False is a person on the team without one. */
  hasAccount?: boolean;
  /** Absent on every document written before expectations existed. */
  expectations?: string;
  notionUserId?: string;
  commsTone?: Membership['commsTone'];
}

/** What comes back from /api/engine/ask. */
export interface AskAnswer {
  answer: string;
  followUp: string | null;
  signals: CitedSignal[];
  /** A proposal the person confirms; the app then writes it. */
  action: (AskAction & { userName?: string }) | null;
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
  /** The roles the inviter chose. Absent on invitations written before roles existed. */
  roleIds?: string[];
  access: Membership['access'];
}

/** The names of a person's roles, joined, which is what `roleTitle` now is. */
export function roleTitleFor(roleIds: string[], roles: Pick<Role, 'id' | 'name'>[]): string {
  return roleIds
    .map((id) => roles.find((r) => r.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(' · ');
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
  /** The company's roles. Everybody sees the list; admins shape it. */
  roles: Role[];
  /** The registered Notion databases. */
  sources: NotionSource[];
  /** The role I have on, which decides what I see. Null between roles. */
  activeRole: Role | null;
  /** The sources my active role reads. */
  activeSourceIds: string[];
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  risks: Risk[];
  /** Private notes about people. Empty for anybody who is not an admin. */
  situations: Situation[];
  /** Today's team follow-up for me, if I am a manager and the engine has run. */
  followUp: TeamFollowUp | null;
  plan: DailyPlan;
  /** My own daily plans, newest first, for the briefing calendar. */
  planHistory: DailyPlan[];
  /** Company analyses by date, newest first. Written by the engine. */
  analyses: CompanyAnalysis[];
  voiceUpdates: VoiceUpdate[];
  /** The engine heartbeat from the Pi, or null before it has ever run. */
  engine: WorkerHeartbeat | null;

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

  updateMembership: (userId: string, patch: Partial<Membership> & { displayName?: string }) => void;
  /** Adds somebody to the team who does not use the app. Admins only. */
  addPerson: (person: { displayName: string; roleIds: string[]; roleDescription: string; expectations: string }) => void;
  /** Puts on one of my roles. Everything I see follows it. */
  setActiveRole: (roleId: string) => void;
  upsertRole: (role: Role) => void;
  /** Removes a role and takes it off everybody who held it. */
  deleteRole: (id: string) => void;
  upsertSource: (source: NotionSource) => void;
  /** Removes a registered database and takes it off every role. Its records go on the next sync. */
  deleteSource: (id: string) => void;
  /** Every Notion table the integration can see, to pick from. Admins only. */
  listNotionTables: () => Promise<NotionTableSummary[]>;
  /** Reads a database's schema on the server and suggests a mapping. Admins only. */
  inspectDatabase: (input: string, dataSourceId?: string) => Promise<InspectResult>;
  /** Runs the Notion sync now, for one source or all. Admins only. */
  syncNow: (options?: { sourceId?: string; full?: boolean }) => Promise<SyncReport[]>;
  /** Asks the engine for today's follow-up in a role, e.g. after switching to it. */
  generateFollowUp: (roleId: string) => Promise<void>;
  /** Removes a person without an account. Accounts are removed by revoking access, not here. */
  removePerson: (memberId: string) => void;

  upsertRisk: (risk: Risk) => void;
  deleteRisk: (id: string) => void;

  upsertSituation: (situation: Situation) => void;
  deleteSituation: (id: string) => void;
  /** Records what I did with a suggested message, and what I actually sent. */
  markFollowUp: (messageId: string, outcome: FollowUpOutcome, sentText?: string) => void;

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
  inviteMember: (email: string, roleIds: string[], access: Membership['access']) => Promise<void>;
  resetToSeed: () => Promise<void>;
  /** Asks the engine on this server to recompute my plan for today, in a role (mine by default). */
  replan: (roleId?: string) => Promise<void>;

  /** Local hour at which this person wants the plan announced. */
  notifyHour: number;
  setNotifyHour: (hour: number) => void;
  /** Whether this device is subscribed to push. */
  pushEnabled: boolean;
  enablePush: () => Promise<PushState>;
  disablePush: () => Promise<void>;
  /** One question about today, answered from the day's context. */
  ask: (question: string, history: { role: 'user' | 'assistant'; text: string }[]) => Promise<AskAnswer>;
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
  northStarDeadline: TODAY,
  plans: { m3: '', m6: '', m12: '' },
};

function emptyPlan(companyId: string, userId: string, roleId: string): DailyPlan {
  return {
    id: `${TODAY}_${userId}_${roleId}`,
    companyId,
    userId,
    roleId,
    date: TODAY,
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
  const [roles, setRoles] = useState<Role[]>([]);
  const [sources, setSources] = useState<NotionSource[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  // App projects arrive from two queries; see the listeners below for why.
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [ownProjects, setOwnProjects] = useState<Project[]>([]);
  const [appTasks, setAppTasks] = useState<Task[]>([]);
  // Notion records arrive one listener per source the active role reads.
  const [sourceTasks, setSourceTasks] = useState<Record<string, Task[]>>({});
  const [sourceProjects, setSourceProjects] = useState<Record<string, Project[]>>({});
  const [risks, setRisks] = useState<Risk[]>([]);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [followUp, setFollowUp] = useState<TeamFollowUp | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [planHistory, setPlanHistory] = useState<DailyPlan[]>([]);
  const [analyses, setAnalyses] = useState<CompanyAnalysis[]>([]);
  const [voiceUpdates, setVoiceUpdates] = useState<VoiceUpdate[]>([]);
  const [engine, setEngine] = useState<WorkerHeartbeat | null>(null);
  const [profile, setProfile] = useState<{ notifyHour: number; fcmTokens: string[] }>({
    notifyHour: 6,
    fcmTokens: [],
  });
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
    // The person's own document: the hour they want the plan, and the devices
    // subscribed to push. Nobody else can read it, so it is not a member field.
    const stopProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.data() ?? {};
        setProfile({
          notifyHour: typeof data.notifyHour === 'number' ? data.notifyHour : 6,
          fcmTokens: Array.isArray(data.fcmTokens) ? (data.fcmTokens as string[]) : [],
        });
      },
      () => undefined,
    );
    const stopMemberships = onSnapshot(
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
    return () => {
      stopProfile();
      stopMemberships();
    };
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
        collection(base, 'roles'),
        (snap) => setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Role)),
        fail,
      ),
      onSnapshot(
        collection(base, 'notionSources'),
        (snap) => setSources(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotionSource)),
        fail,
      ),
      onSnapshot(
        collection(base, 'objectives'),
        (snap) => setObjectives(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Objective)),
        fail,
      ),
      // Filtered listeners, not one. Firestore rules are not filters: a rule
      // that inspects the document rejects any query it cannot prove safe, so
      // an unfiltered listener on these collections is refused. Each query
      // below matches one branch of the read rule, and the results are merged.
      // Notion records come through the per-source listeners further down.
      onSnapshot(
        query(
          collection(base, 'projects'),
          where('source', '==', 'app'),
          where('visibility', '==', 'company'),
        ),
        (snap) =>
          setSharedProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project)),
        fail,
      ),
      onSnapshot(
        query(
          collection(base, 'projects'),
          where('source', '==', 'app'),
          where('memberUserIds', 'array-contains', uid),
        ),
        (snap) => setOwnProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project)),
        fail,
      ),
      onSnapshot(
        query(collection(base, 'tasks'), where('source', '==', 'app')),
        (snap) => setAppTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task)),
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
      // My own briefings, one per role per day. Filtered by uid because the
      // read rule inspects it; the active role is picked out client-side.
      onSnapshot(
        query(
          collection(base, 'analyses'),
          where('uid', '==', uid),
          orderBy('date', 'desc'),
          limit(120),
        ),
        (snap) =>
          setAnalyses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CompanyAnalysis)),
        () => setAnalyses([]),
      ),
      // Both of these are admin-only reads. A plain member's listener is
      // refused, which is the correct answer, so it empties rather than shouts.
      onSnapshot(
        collection(base, 'situations'),
        (snap) =>
          setSituations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Situation)),
        () => setSituations([]),
      ),
      onSnapshot(
        doc(db, 'workers', WORKER_ID),
        (snap) => {
          if (!snap.exists()) {
            setEngine(null);
            return;
          }
          const data = snap.data();
          const at: unknown = data.lastHeartbeatAt;
          setEngine({
            id: snap.id,
            lastHeartbeatAt:
              at && typeof at === 'object' && 'toDate' in at
                ? (at as { toDate: () => Date }).toDate().toISOString()
                : null,
            version: String(data.version ?? ''),
            hostname: String(data.hostname ?? ''),
            lastRun: data.lastRun,
          });
        },
        () => setEngine(null),
      ),
    ];

    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [uid, companyId]);

  // The role I have on, and the sources it reads. Derived here because the
  // listeners below depend on it: switching roles re-subscribes.
  const activeRoleId = uid ? (members[uid]?.activeRoleId ?? null) : null;
  const activeRole = useMemo(
    () => roles.find((r) => r.id === activeRoleId) ?? null,
    [roles, activeRoleId],
  );
  const activeSourceIds = useMemo(
    () => [...roleSourceIds(activeRole, sources)].sort(),
    [activeRole, sources],
  );
  const activeSourceKey = activeSourceIds.join(',');

  // One listener per source the active role reads, for tasks and projects.
  // The rule reads the caller's active role, so a source that is not on it
  // would be refused — and a source that leaves the role drops out here.
  useEffect(() => {
    if (!uid || !companyId) return;
    const { db } = firebase();
    const base = doc(db, 'companies', companyId);
    const ids = activeSourceKey ? activeSourceKey.split(',') : [];
    setSourceTasks({});
    setSourceProjects({});

    const subs = ids.flatMap((sourceId) => [
      onSnapshot(
        query(
          collection(base, 'tasks'),
          where('source', '==', 'notion'),
          where('sourceId', '==', sourceId),
        ),
        (snap) =>
          setSourceTasks((current) => ({
            ...current,
            [sourceId]: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task),
          })),
        // Refused means the role no longer reads it; empty, do not shout.
        () => setSourceTasks((current) => ({ ...current, [sourceId]: [] })),
      ),
      onSnapshot(
        query(
          collection(base, 'projects'),
          where('source', '==', 'notion'),
          where('sourceId', '==', sourceId),
        ),
        (snap) =>
          setSourceProjects((current) => ({
            ...current,
            [sourceId]: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project),
          })),
        () => setSourceProjects((current) => ({ ...current, [sourceId]: [] })),
      ),
    ]);
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [uid, companyId, activeSourceKey]);

  // Today's plan and follow-up, for the role I have on. One document per
  // person per role per day; switching roles switches documents.
  useEffect(() => {
    if (!uid || !companyId) return;
    const { db } = firebase();
    const base = doc(db, 'companies', companyId);
    if (!activeRoleId) {
      setPlan(null);
      setFollowUp(null);
      return;
    }
    const suffix = `${TODAY}_${uid}_${activeRoleId}`;
    const subs = [
      onSnapshot(
        doc(base, 'followups', suffix),
        (snap) =>
          setFollowUp(snap.exists() ? ({ id: snap.id, ...snap.data() } as TeamFollowUp) : null),
        () => setFollowUp(null),
      ),
      onSnapshot(
        doc(base, 'plans', suffix),
        (snap) => setPlan(snap.exists() ? ({ id: snap.id, ...snap.data() } as DailyPlan) : null),
        // A missing plan is normal before the engine has run; do not shout.
        () => setPlan(null),
      ),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [uid, companyId, activeRoleId]);

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
      status: healthFrom(item, new Date(`${TODAY}T00:00:00`)),
    }),
    [],
  );

  const bootstrap = useCallback(async () => {
    if (!uid || !user) return;
    const { db } = firebase();
    const cid = newId('c');
    const base = doc(db, 'companies', cid);

    // An empty company, on purpose. Nothing here is sample data: objectives,
    // projects and people arrive from the app or from Notion, and a screen
    // with nothing in it says so rather than showing work that never existed.
    // The fixtures stay in packages/core for tests and the engine selftest.
    //
    // 1. The company. `isCreator(cid)` lets this person add themselves next.
    await setDoc(base, {
      createdBy: uid,
      createdAt: serverTimestamp(),
      name: 'ADITUM',
      slug: 'aditum',
      northStar: '',
      northStarDeadline: '',
      plans: { m3: '', m6: '', m12: '' },
    });

    // 2. Their own membership, so `isMember(cid)` holds from here on. It
    //    names a role that is written right after: the rules do not check
    //    the role exists, and creating the role first would need admin
    //    access, which needs this document.
    const displayName = user.displayName ?? user.email?.split('@')[0] ?? 'Sin nombre';
    const roleId = newId('r');
    await setDoc(doc(base, 'members', uid), {
      displayName,
      email: user.email ?? '',
      initials: initialsFrom(displayName),
      roleTitle: 'General',
      roleDescription: '',
      roleIds: [roleId],
      activeRoleId: roleId,
      access: 'owner',
      hasAccount: true,
      expectations: '',
    });

    // 3. One role with no Notion sources, so the app is useful before any
    //    database is registered. Rename it, add sources, or add more roles.
    await setDoc(doc(base, 'roles', roleId), {
      companyId: cid,
      name: 'General',
      description: '',
      sourceIds: [],
      createdAt: new Date().toISOString(),
    });

    // 4. The mirror that makes this company findable on the next sign-in. A
    //    trigger takes this over once Cloud Functions exist.
    await setDoc(doc(db, 'users', uid, 'memberships', cid), {
      companyName: 'ADITUM',
      roleTitle: 'General',
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

  // Merge the app queries and the per-source ones, keeping one entry per id.
  const projects = useMemo(() => {
    const byId = new Map<string, Project>();
    for (const project of [...sharedProjects, ...ownProjects, ...Object.values(sourceProjects).flat()]) {
      byId.set(project.id, project);
    }
    return [...byId.values()];
  }, [sharedProjects, ownProjects, sourceProjects]);

  const tasks = useMemo(() => {
    const byId = new Map<string, Task>();
    for (const task of [...appTasks, ...Object.values(sourceTasks).flat()]) byId.set(task.id, task);
    return [...byId.values()];
  }, [appTasks, sourceTasks]);

  const value = useMemo<StoreValue>(() => {
    const today = new Date(`${TODAY}T00:00:00`);

    // users and memberships both come from the member documents.
    const users: User[] = Object.entries(members).map(([id, m]) => ({
      id,
      displayName: m.displayName,
      email: m.email,
      initials: m.initials || initialsFrom(m.displayName),
      timezone: 'America/Costa_Rica',
      notifyHour: id === uid ? profile.notifyHour : 6,
      locale: 'es',
      theme: 'system',
      reduceTransparency: false,
    }));

    const memberships: Membership[] = Object.entries(members).map(([id, m]) => ({
      userId: id,
      companyId,
      roleTitle: roleTitleFor(m.roleIds ?? [], roles) || m.roleTitle,
      roleDescription: m.roleDescription,
      roleIds: m.roleIds ?? [],
      activeRoleId: m.activeRoleId ?? null,
      access: m.access,
      hasAccount: m.hasAccount ?? true,
      expectations: typeof m.expectations === 'string' ? m.expectations : '',
      notionUserId: m.notionUserId,
      commsTone: m.commsTone,
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
        roleIds: [],
        activeRoleId: null,
        access: 'member',
        hasAccount: true,
        expectations: '',
      } satisfies Membership);

    // Already scoped: the listeners only ever hold what the active role reads.
    const signals = computeSignals({ today, objectives, projects, tasks, users });
    const currentPlan = plan ?? emptyPlan(companyId ?? '', uid ?? '', activeRoleId ?? '');
    const roleAnalyses = activeRoleId
      ? analyses.filter((a) => a.roleId === activeRoleId)
      : analyses;
    const rolePlanHistory = activeRoleId
      ? planHistory.filter((p) => p.roleId === activeRoleId)
      : planHistory;

    /** Everybody who holds a role, with their title rewritten. */
    const retitle = (db: Firestore, cid: string, batch: ReturnType<typeof writeBatch>, nextRoles: Role[]) => {
      for (const [id, m] of Object.entries(members)) {
        const title = roleTitleFor(m.roleIds ?? [], nextRoles);
        if (title !== m.roleTitle) batch.update(doc(db, 'companies', cid, 'members', id), { roleTitle: title });
      }
    };

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
      roles,
      sources,
      activeRole,
      activeSourceIds,
      objectives,
      projects,
      tasks,
      risks,
      situations,
      followUp,
      plan: currentPlan,
      planHistory: rolePlanHistory,
      analyses: roleAnalyses,
      voiceUpdates,
      engine,
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
        write((db, cid) => {
          const current = members[userId];
          const roleIds = patch.roleIds ?? current?.roleIds ?? [];
          // The active role must stay one of theirs; if it was just taken
          // away, the first remaining one goes on.
          const active = current?.activeRoleId ?? null;
          const nextActive =
            patch.roleIds !== undefined && (!active || !roleIds.includes(active))
              ? (roleIds[0] ?? null)
              : undefined;
          return updateDoc(doc(db, 'companies', cid, 'members', userId), {
            ...(patch.roleIds !== undefined
              ? { roleIds, roleTitle: roleTitleFor(roleIds, roles) }
              : {}),
            ...(nextActive !== undefined ? { activeRoleId: nextActive } : {}),
            ...(patch.roleDescription !== undefined
              ? { roleDescription: patch.roleDescription }
              : {}),
            ...(patch.access !== undefined ? { access: patch.access } : {}),
            ...(patch.expectations !== undefined ? { expectations: patch.expectations } : {}),
            ...(patch.notionUserId !== undefined ? { notionUserId: patch.notionUserId } : {}),
            ...(patch.commsTone !== undefined ? { commsTone: patch.commsTone } : {}),
            ...(patch.displayName !== undefined
              ? { displayName: patch.displayName, initials: initialsFrom(patch.displayName) }
              : {}),
          });
        }),

      setActiveRole: (roleId) => {
        if (!uid || !currentMembership.roleIds.includes(roleId)) return;
        write((db, cid) =>
          updateDoc(doc(db, 'companies', cid, 'members', uid), { activeRoleId: roleId }),
        );
      },

      upsertRole: (role) =>
        write(async (db, cid) => {
          const { id, ...rest } = role;
          const batch = writeBatch(db);
          batch.set(doc(db, 'companies', cid, 'roles', id), { ...rest, companyId: cid });
          retitle(db, cid, batch, [...roles.filter((r) => r.id !== id), role]);
          return batch.commit();
        }),

      deleteRole: (id) =>
        write(async (db, cid) => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'companies', cid, 'roles', id));
          const remaining = roles.filter((r) => r.id !== id);
          for (const [memberId, m] of Object.entries(members)) {
            const held = m.roleIds ?? [];
            if (!held.includes(id)) continue;
            const roleIds = held.filter((r) => r !== id);
            batch.update(doc(db, 'companies', cid, 'members', memberId), {
              roleIds,
              roleTitle: roleTitleFor(roleIds, remaining),
              ...(m.activeRoleId === id ? { activeRoleId: roleIds[0] ?? null } : {}),
            });
          }
          return batch.commit();
        }),

      upsertSource: (source) =>
        write((db, cid) => {
          const { id, ...rest } = source;
          return setDoc(doc(db, 'companies', cid, 'notionSources', id), { ...rest, companyId: cid });
        }),

      deleteSource: (id) =>
        write(async (db, cid) => {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'companies', cid, 'notionSources', id));
          for (const role of roles) {
            if (role.sourceIds.includes(id)) {
              batch.update(doc(db, 'companies', cid, 'roles', role.id), {
                sourceIds: role.sourceIds.filter((s) => s !== id),
              });
            }
          }
          return batch.commit();
        }),

      listNotionTables: async () => {
        if (!user || !companyId) throw new Error('not signed in');
        const token = await user.getIdToken();
        const response = await fetch('/api/notion/databases', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ companyId }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          tables?: NotionTableSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        return body.tables ?? [];
      },

      inspectDatabase: async (input, dataSourceId) => {
        if (!user || !companyId) throw new Error('not signed in');
        const token = await user.getIdToken();
        const response = await fetch('/api/notion/inspect', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ companyId, input, dataSourceId }),
        });
        const body = (await response.json().catch(() => ({}))) as InspectResult & { error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        return body;
      },

      syncNow: async (options = {}) => {
        if (!user || !companyId) throw new Error('not signed in');
        const token = await user.getIdToken();
        const params = new URLSearchParams({ company: companyId });
        if (options.sourceId) params.set('source', options.sourceId);
        if (options.full) params.set('full', '1');
        const response = await fetch(`/api/notion/sync?${params.toString()}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const body = (await response.json().catch(() => ({}))) as { reports?: SyncReport[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        return body.reports ?? [];
      },

      generateFollowUp: async (roleId) => {
        if (!user || !companyId) return;
        const token = await user.getIdToken();
        const response = await fetch('/api/engine/followup', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ companyId, roleId }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
      },

      upsertRisk: (risk) =>
        write((db, cid) => {
          const { id, ...rest } = risk;
          return setDoc(doc(db, 'companies', cid, 'risks', id), { ...rest, companyId: cid });
        }),

      deleteRisk: (id) => write((db, cid) => deleteDoc(doc(db, 'companies', cid, 'risks', id))),

      // A synthetic id, so it can never collide with a Firebase uid: the rules
      // grant access only when the document id equals request.auth.uid.
      addPerson: (person) =>
        write((db, cid) =>
          setDoc(doc(db, 'companies', cid, 'members', newId('p')), {
            displayName: person.displayName,
            email: '',
            initials: initialsFrom(person.displayName),
            roleTitle: roleTitleFor(person.roleIds, roles),
            roleDescription: person.roleDescription,
            roleIds: person.roleIds,
            activeRoleId: person.roleIds[0] ?? null,
            access: 'member',
            hasAccount: false,
            expectations: person.expectations,
          }),
        ),
      removePerson: (memberId) =>
        write((db, cid) => deleteDoc(doc(db, 'companies', cid, 'members', memberId))),

      upsertSituation: (situation) =>
        write((db, cid) => {
          const { id, ...rest } = situation;
          return setDoc(doc(db, 'companies', cid, 'situations', id), { ...rest, companyId: cid });
        }),
      deleteSituation: (id) =>
        write((db, cid) => deleteDoc(doc(db, 'companies', cid, 'situations', id))),

      // The engine wrote the suggestion; this is the only part of it a person
      // may touch, and the rules allow exactly these two fields.
      markFollowUp: (messageId, outcome, sentText) =>
        write((db, cid) => {
          if (!followUp) return Promise.resolve();
          return updateDoc(doc(db, 'companies', cid, 'followups', followUp.id), {
            outcome: { ...followUp.outcome, [messageId]: outcome },
            sentText:
              sentText === undefined
                ? followUp.sentText
                : { ...followUp.sentText, [messageId]: sentText },
          });
        }),

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
        const year = new Date(`${TODAY}T00:00:00`).getFullYear() + 1;

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
        const roleId = newId('r');
        await setDoc(doc(db, 'companies', cid, 'members', uid), {
          displayName,
          email: user.email ?? '',
          initials: initialsFrom(displayName),
          roleTitle: 'General',
          roleDescription: '',
          roleIds: [roleId],
          activeRoleId: roleId,
          access: 'owner',
          hasAccount: true,
          expectations: '',
        });
        await setDoc(doc(db, 'companies', cid, 'roles', roleId), {
          companyId: cid,
          name: 'General',
          description: '',
          sourceIds: [],
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'users', uid, 'memberships', cid), {
          companyName: name.trim(),
          roleTitle: 'General',
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
        if (!user) return;
        // The server writes the object: the Storage rule that used to authorise
        // a browser upload had to read Firestore, and that cross-service check
        // needs a grant the CLI does not create. The route verifies this token,
        // checks membership with the Admin SDK, and updates `logoUrl` itself,
        // so the live listener repaints the mark without a second write here.
        const body = new FormData();
        body.append('companyId', targetCompanyId);
        body.append('file', file);
        const response = await fetch('/api/company/logo', {
          method: 'POST',
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          body,
        });
        if (!response.ok) {
          const failure = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(failure.error ?? `HTTP ${response.status}`);
        }
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
        setRoles([]);
        setSources([]);
        setSharedProjects([]);
        setOwnProjects([]);
        setAppTasks([]);
        setSourceTasks({});
        setSourceProjects({});
        setRisks([]);
        setSituations([]);
        setFollowUp(null);
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
        const roleIds = pendingInvite.roleIds ?? [];
        await setDoc(doc(db, 'companies', cid, 'members', uid), {
          displayName,
          email: user.email ?? '',
          initials: initialsFrom(displayName),
          roleTitle: pendingInvite.roleTitle,
          roleDescription: '',
          roleIds,
          activeRoleId: roleIds[0] ?? null,
          access: pendingInvite.access,
          hasAccount: true,
          expectations: '',
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

      inviteMember: async (inviteEmail, roleIds, access) => {
        if (!companyId || !uid) return;
        const { db } = firebase();
        const address = inviteEmail.trim().toLowerCase();
        await setDoc(doc(db, 'invites', address), {
          email: address,
          companyId,
          companyName: company.name,
          roleTitle: roleTitleFor(roleIds, roles),
          roleIds,
          access,
          invitedBy: uid,
          createdAt: serverTimestamp(),
        });
      },

      notifyHour: profile.notifyHour,
      setNotifyHour: (hour) => {
        if (!uid) return;
        const { db } = firebase();
        void updateDoc(doc(db, 'users', uid), { notifyHour: hour }).catch((cause: unknown) =>
          setError(cause instanceof Error ? cause.message : String(cause)),
        );
      },
      pushEnabled: (() => {
        const token = currentPushToken();
        return Boolean(token && profile.fcmTokens.includes(token));
      })(),
      enablePush: async () => (uid ? enablePush(uid) : 'unsupported'),
      disablePush: async () => {
        if (uid) await disablePush(uid);
      },

      ask: async (question, history) => {
        if (!user || !companyId) throw new Error('not signed in');
        const token = await user.getIdToken();
        const response = await fetch('/api/engine/ask', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ companyId, question, history }),
        });
        const body = (await response.json().catch(() => ({}))) as AskAnswer & { error?: string };
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        return body;
      },

      replan: async (roleId) => {
        if (!user || !companyId) return;
        // The route verifies this token with the Admin SDK and checks membership
        // itself; the client only proves who is asking.
        const token = await user.getIdToken();
        const response = await fetch('/api/engine/replan', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ companyId, roleId: roleId ?? activeRoleId }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
      },

      resetToSeed: async () => {
        if (!companyId || !uid) return;
        const { db } = firebase();
        const batch = writeBatch(db);
        const base = doc(db, 'companies', companyId);
        for (const objective of objectives) batch.delete(doc(base, 'objectives', objective.id));
        // Only app records: the browser may not touch what the sync wrote, and
        // this company is abandoned on the next bootstrap anyway.
        for (const project of projects) {
          if (project.source === 'app') batch.delete(doc(base, 'projects', project.id));
        }
        for (const task of tasks) {
          if (task.source === 'app') batch.delete(doc(base, 'tasks', task.id));
        }
        for (const role of roles) batch.delete(doc(base, 'roles', role.id));
        for (const source of sources) batch.delete(doc(base, 'notionSources', source.id));
        for (const risk of risks) batch.delete(doc(base, 'risks', risk.id));
        for (const situation of situations) batch.delete(doc(base, 'situations', situation.id));
        // The sample people go too; accounts stay, they are not sample data.
        for (const m of memberships) {
          if (!m.hasAccount) batch.delete(doc(base, 'members', m.userId));
        }
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
    roles,
    sources,
    activeRole,
    activeRoleId,
    activeSourceIds,
    objectives,
    projects,
    tasks,
    risks,
    situations,
    followUp,
    profile,
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
  const year = new Date(`${TODAY}T00:00:00`).getFullYear();
  return {
    id: newId('o'),
    companyId,
    title: '',
    expectedResult: '',
    startDate: TODAY,
    targetDate: `${year}-12-31`,
    priority: 'medium',
    ownerUserId,
    progressPct: 0,
    status: 'on_track',
    indicators: [],
  };
}

export function makeProject(companyId: string, ownerUserId: string): Project {
  const year = new Date(`${TODAY}T00:00:00`).getFullYear();
  return {
    id: newId('p'),
    companyId,
    name: '',
    description: '',
    visibility: 'company',
    objectiveIds: [],
    memberUserIds: [ownerUserId],
    ownerUserId,
    startDate: TODAY,
    targetDate: `${year}-12-31`,
    progressPct: 0,
    status: 'on_track',
    source: 'app',
    sourceId: null,
  };
}

export function makeRole(companyId: string): Role {
  return {
    id: newId('r'),
    companyId,
    name: '',
    description: '',
    sourceIds: [],
    createdAt: new Date().toISOString(),
  };
}

export function makeSituation(companyId: string, userId: string, createdBy: string): Situation {
  return {
    id: newId('s'),
    companyId,
    userId,
    kind: 'personal',
    note: '',
    // Discreet by default: a note about somebody is private until its author
    // decides otherwise, not the other way round.
    discreet: true,
    startsAt: TODAY,
    endsAt: null,
    createdBy,
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
    assigneeUserIds: [],
    dependsOn: [],
    source: 'app',
    sourceId: null,
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
