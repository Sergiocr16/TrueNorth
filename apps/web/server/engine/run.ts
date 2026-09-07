import 'server-only';

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { hostname } from 'node:os';
import {
  dailyPlanSchema,
  ensureGreeting,
  isRepeat,
  leaksNote,
  messageId,
  personalBriefingSchema,
  restDayBriefingSchema,
  restDayPlanSchema,
  shiftIso,
  teamFollowUpSchema,
  teamSignals,
  todayIso as computeTodayIso,
  visibleSignals,
  type CitedSignal,
  type CompanyAnalysisOutput,
  type DailyPlanOutput,
  type DayResolution,
  type FollowUp,
  type RestDayPlanOutput,
  type Scoped,
  type Signal,
  type TeamFollowUp,
  type TeamFollowUpOutput,
} from '@truenorth/core';
import { adminDb } from '../admin';
import { syncCompany } from '../notion/sync';
import { syncGithub } from '../github/sync';
import type { GithubSyncReport } from '../github/types';
import type { SyncReport } from '../notion/types';
import { askClaude, type ClaudeUsage } from './claude';
import {
  captureCompany,
  contextFor,
  dayFor,
  roleFor,
  scopeOf,
  type Captured,
  type MemberRecord,
} from './capture';
import {
  BRIEFING_PLAN_SYSTEM,
  FOLLOWUP_SYSTEM,
  PLAN_SYSTEM,
  briefingAndPlanPrompt,
  followUpPrompt,
  planPrompt,
  type FollowUpSubject,
} from './prompts';

/**
 * The daily engine, and the same machinery reused on demand.
 *
 * One company per call. Since ADR-008 the unit of work is a person in a
 * role: the sync runs first, the company is captured once, and for every
 * account the engine scopes the company to the role they have on, computes
 * that scope's signals, and makes one model call that writes their briefing
 * and their plan. Managers get a follow-up in the same role. Other roles are
 * generated when the person switches to them, from the same functions.
 */

export interface RunReport {
  companyId: string;
  date: string;
  /** True when the company had nothing to reason about, so no model call was made. */
  skipped?: boolean;
  sync: SyncReport[];
  /** GitHub after Notion, so pull requests find their tasks (ADR-010). */
  githubSync: GithubSyncReport[];
  /** Kept for the daily route and the heartbeat: false when any briefing failed. */
  analysis: { ok: boolean; usage?: ClaudeUsage; error?: string };
  plans: { uid: string; roleId: string; ok: boolean; skipped?: boolean; usage?: ClaudeUsage; error?: string }[];
  /** One per manager: owners and admins are the people who follow up. */
  followUps: {
    uid: string;
    roleId: string;
    ok: boolean;
    /** A rest day (ADR-012): nobody is followed up with. */
    skipped?: boolean;
    messages?: number;
    usage?: ClaudeUsage;
    error?: string;
  }[];
  durationMs: number;
}

const WORKER_ID = process.env.WORKER_ID ?? 'pi-01';

/** `${date}_${uid}_${roleId}`: one document per person per role per day. */
function docId(date: string, uid: string, roleId: string): string {
  return `${date}_${uid}_${roleId}`;
}

export async function runDaily(companyId: string, dateIso?: string): Promise<RunReport> {
  const started = Date.now();
  const date = dateIso ?? computeTodayIso();
  const report: RunReport = {
    companyId,
    date,
    sync: [],
    githubSync: [],
    analysis: { ok: true },
    plans: [],
    followUps: [],
    durationMs: 0,
  };

  // 0. Notion first, so the day is read from this morning's pages. A failed
  //    sync is reported and the run goes on: a plan from yesterday's Notion
  //    beats no plan.
  try {
    report.sync = await syncCompany(companyId);
  } catch (cause) {
    report.sync = [];
    report.analysis = { ok: true, error: `sync: ${describe(cause)}` };
  }
  // GitHub second: a pull request is linked to a task by the code in its
  // branch, and the task has to be here first. A missing token is a skipped
  // report, not a failed run.
  try {
    report.githubSync = await syncGithub(companyId);
  } catch (cause) {
    report.githubSync = [];
    report.analysis = { ok: true, error: `github sync: ${describe(cause)}` };
  }

  const captured = await captureCompany(companyId, date);

  // An empty workspace has nothing to reason about, and the nightly run goes
  // over every company. Skipping costs nothing; analysing costs a model call.
  if (captured.objectives.length === 0 && captured.tasks.length === 0) {
    report.skipped = true;
    report.durationMs = Date.now() - started;
    await heartbeat(report);
    return report;
  }

  // 1. One call per account, in the role they have on. Sequential on
  //    purpose: a Raspberry Pi has four cores and the subscription has a
  //    rate window, and a company of a few people finishes in minutes.
  for (const member of captured.members.filter((m) => m.membership.hasAccount)) {
    const roleId = roleFor(member);
    if (!roleId) continue;
    const result = await briefingAndPlanFor(captured, member, roleId);
    report.plans.push({ uid: member.id, roleId, ...result });
  }
  if (report.plans.some((p) => !p.ok)) {
    report.analysis = {
      ok: false,
      error: report.plans.find((p) => !p.ok)?.error ?? report.analysis.error,
    };
  }

  // 2. The team follow-up, once per manager in their role. A plain member
  //    has nobody to follow up with, and the situations behind it are theirs
  //    to not see. On a rest day nobody is followed up with at all.
  const restDay = !dayFor(captured, null).working;
  for (const manager of captured.members.filter(
    (m) => m.membership.hasAccount && m.membership.access !== 'member',
  )) {
    const roleId = roleFor(manager);
    if (!roleId) continue;
    if (restDay) {
      report.followUps.push({ uid: manager.id, roleId, ok: true, skipped: true });
      continue;
    }
    const result = await followUpFor(captured, manager, roleId);
    report.followUps.push({ uid: manager.id, roleId, ...result });
  }

  report.durationMs = Date.now() - started;
  await heartbeat(report);
  return report;
}

/**
 * One person's plan now, in a role: from the Today screen, or when they
 * switch to a role that has no plan yet. Reuses the role's briefing when
 * today's exists, because a replan is about the plan; makes the whole
 * morning call when it does not.
 */
export async function replan(companyId: string, uid: string, roleId?: string | null): Promise<RunReport> {
  const started = Date.now();
  const date = computeTodayIso();
  const captured = await captureCompany(companyId, date);
  const member = captured.members.find((m) => m.id === uid);
  if (!member) throw new Error(`user ${uid} is not a member of ${companyId}`);
  const role = roleFor(member, roleId);
  if (!role) throw new Error(roleId ? `role ${roleId} is not one of this person's` : 'no role to plan for');

  const analysisSnap = await adminDb()
    .collection('companies')
    .doc(companyId)
    .collection('analyses')
    .doc(docId(date, uid, role))
    .get();

  const result = analysisSnap.exists
    ? await planOnlyFor(captured, member, role, String(analysisSnap.data()?.briefing ?? ''))
    : await briefingAndPlanFor(captured, member, role);

  const report: RunReport = {
    companyId,
    date,
    sync: [],
    githubSync: [],
    analysis: { ok: result.ok },
    plans: [{ uid, roleId: role, ...result }],
    followUps: [],
    durationMs: Date.now() - started,
  };
  await heartbeat(report);
  return report;
}

/** Recalculations in flight, one per person and role: a second tap joins the first. */
const replans = new Map<string, Promise<RunReport>>();

/**
 * "Recalcular mi plan" without holding the phone's request open: the run is
 * marked on the person's own document (`replanning`), started, and left to
 * finish on its own; the marker is cleared — or `replanError` set — when it
 * ends, and the Today screen follows the document. A phone that drops the
 * request, or is put away, changes nothing.
 */
export async function startReplan(
  companyId: string,
  uid: string,
  roleId?: string | null,
): Promise<{ started: boolean }> {
  const key = `${companyId}:${uid}:${roleId ?? 'active'}`;
  if (replans.has(key)) return { started: false };
  const profile = adminDb().collection('users').doc(uid);
  await profile.set(
    { replanning: { companyId, roleId: roleId ?? null, startedAt: new Date().toISOString() }, replanError: null },
    { merge: true },
  );
  const run = replan(companyId, uid, roleId)
    .then(async (report) => {
      const plan = report.plans[0];
      await profile.set(
        { replanning: null, replanError: plan?.ok ? null : (plan?.error ?? 'replan failed') },
        { merge: true },
      );
      return report;
    })
    .catch(async (cause: unknown) => {
      await profile.set({ replanning: null, replanError: describe(cause) }, { merge: true }).catch(() => undefined);
      throw cause;
    })
    .finally(() => replans.delete(key));
  replans.set(key, run);
  run.catch(() => undefined);
  return { started: true };
}

/** Today's follow-up for one manager in a role, on demand. */
export async function regenerateFollowUp(
  companyId: string,
  uid: string,
  roleId?: string | null,
): Promise<{ ok: boolean; skipped?: boolean; messages?: number; usage?: ClaudeUsage; error?: string }> {
  const captured = await captureCompany(companyId);
  const manager = captured.members.find((m) => m.id === uid);
  if (!manager) throw new Error(`user ${uid} is not a member of ${companyId}`);
  if (manager.membership.access === 'member') throw new Error('managers only');
  const role = roleFor(manager, roleId);
  if (!role) throw new Error('no role to follow up in');
  // Nobody is followed up with on a rest day (ADR-012), asked for or not.
  if (!dayFor(captured, role).working) return { ok: true, skipped: true };
  return followUpFor(captured, manager, role);
}

/* ------------------------------------------------------------------ */
/* The morning call                                                    */
/* ------------------------------------------------------------------ */

function yesterdaySummary(captured: Captured, member: MemberRecord, roleId: string) {
  const yesterday = captured.yesterdayPlans.get(`${member.id}_${roleId}`);
  return yesterday
    ? {
        headline: yesterday.headline,
        done: yesterday.items
          .filter((_, i) => yesterday.feedback?.[i] === 'done')
          .map((i) => i.title),
        skipped: yesterday.items.filter((_, i) => yesterday.feedback?.[i] === 'skipped').map((i) => i.title),
        // "No aplica" is the person telling the engine it was wrong about them.
        irrelevant: yesterday.items.filter((_, i) => yesterday.feedback?.[i] === 'irrelevant').map((i) => i.title),
      }
    : null;
}

/** An item may only cite signals it was shown; one that cites nothing real is dropped. */
function enforceCitations<T extends { signalIds: string[] }>(items: T[], allowed: Set<string>): T[] {
  return items
    .map((item) => ({ ...item, signalIds: item.signalIds.filter((id) => allowed.has(id)) }))
    .filter((item) => item.signalIds.length > 0);
}

/**
 * The plan document. On a rest day (ADR-012) every item is optional and
 * nothing is owed, which the document says in code rather than trusting
 * the model to.
 */
async function writePlan(
  captured: Captured,
  member: MemberRecord,
  roleId: string,
  plan: DailyPlanOutput | RestDayPlanOutput,
  day: DayResolution,
  usage: ClaudeUsage,
  allowed: Set<string>,
): Promise<void> {
  const base = adminDb().collection('companies').doc(captured.company.id);
  const items = enforceCitations(plan.items, allowed).map((item) =>
    day.working ? item : { ...item, optional: true },
  );
  await base
    .collection('plans')
    .doc(docId(captured.todayIso, member.id, roleId))
    .set({
      companyId: captured.company.id,
      uid: member.id,
      userId: member.id,
      roleId,
      date: captured.todayIso,
      headline: plan.headline,
      why: plan.why,
      items,
      consequenceIfNotDone: 'consequenceIfNotDone' in plan ? plan.consequenceIfNotDone : '',
      dayKind: day.working ? 'working' : 'rest',
      focus: day.focus,
      deliveredAt: new Date().toISOString(),
      stale: false,
      feedback: {},
      model: usage.model,
      costUsd: usage.costUsd,
    });
}

async function writeAnalysis(
  captured: Captured,
  member: MemberRecord,
  roleId: string,
  scope: Scoped,
  analysis: CompanyAnalysisOutput,
  usage: ClaudeUsage,
): Promise<void> {
  const base = adminDb().collection('companies').doc(captured.company.id);
  await base
    .collection('analyses')
    .doc(docId(captured.todayIso, member.id, roleId))
    .set({
      companyId: captured.company.id,
      uid: member.id,
      userId: member.id,
      roleId,
      sourceIds: scope.sourceIds,
      assignedOnlySourceIds: scope.assignedOnlySourceIds,
      date: captured.todayIso,
      generatedAt: new Date().toISOString(),
      briefing: analysis.briefing,
      topRisks: analysis.topRisks,
      pendingDecisions: analysis.pendingDecisions,
      perspectives: analysis.perspectives,
      model: usage.model,
      costUsd: usage.costUsd,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        durationMs: usage.durationMs,
      },
    });
}

/** Briefing and plan for one person in one role: one call, two documents. */
async function briefingAndPlanFor(
  captured: Captured,
  member: MemberRecord,
  roleId: string,
): Promise<{ ok: boolean; skipped?: boolean; usage?: ClaudeUsage; error?: string }> {
  const scope = scopeOf(captured, member.id, roleId);
  // Nothing in view: no call, no documents. The screen says so honestly.
  if (scope.objectives.length === 0 && scope.tasks.length === 0) {
    return { ok: true, skipped: true };
  }
  const ctx = contextFor(captured, scope);
  const personal = visibleSignals(scope, member.id);
  const allowed = new Set(personal.map((s) => s.id));

  try {
    // Two contracts, chosen by the day (ADR-012): the schema is a hard
    // constraint on the model, so the choice is made here, not asked of it.
    const prompt = briefingAndPlanPrompt(ctx, member, personal, yesterdaySummary(captured, member, roleId));
    const answer = ctx.day.working
      ? await askClaude(prompt, personalBriefingSchema, { system: BRIEFING_PLAN_SYSTEM })
      : await askClaude(prompt, restDayBriefingSchema, { system: BRIEFING_PLAN_SYSTEM });
    await writeAnalysis(captured, member, roleId, scope, answer.value.analysis, answer.usage);
    await writePlan(captured, member, roleId, answer.value.plan, ctx.day, answer.usage, allowed);
    return { ok: true, usage: answer.usage };
  } catch (cause) {
    return { ok: false, error: describe(cause) };
  }
}

/** The plan alone, quoting a briefing that already exists for the role. */
async function planOnlyFor(
  captured: Captured,
  member: MemberRecord,
  roleId: string,
  briefing: string,
): Promise<{ ok: boolean; usage?: ClaudeUsage; error?: string }> {
  const scope = scopeOf(captured, member.id, roleId);
  const ctx = contextFor(captured, scope);
  const personal = visibleSignals(scope, member.id);
  const allowed = new Set(personal.map((s) => s.id));

  try {
    const prompt = planPrompt(ctx, member, personal, briefing, yesterdaySummary(captured, member, roleId));
    const answer = ctx.day.working
      ? await askClaude(prompt, dailyPlanSchema, { system: PLAN_SYSTEM })
      : await askClaude(prompt, restDayPlanSchema, { system: PLAN_SYSTEM });
    await writePlan(captured, member, roleId, answer.value, ctx.day, answer.usage, allowed);
    return { ok: true, usage: answer.usage };
  } catch (cause) {
    return { ok: false, error: describe(cause) };
  }
}

/* ------------------------------------------------------------------ */
/* The team follow-up                                                  */
/* ------------------------------------------------------------------ */

/**
 * The team follow-up for one manager in one role.
 *
 * Everything here that can be checked is checked in code, because the model is
 * writing something a person will send to another person: a message may only
 * cite signals the manager was shown, may only point at a task they can see,
 * and may never repeat itself the day after. The team is the people in the
 * manager's view — somebody whose work is all in a source this role does not
 * read is not in the prompt at all.
 */
async function followUpFor(
  captured: Captured,
  manager: MemberRecord,
  roleId: string,
): Promise<{ ok: boolean; messages?: number; usage?: ClaudeUsage; error?: string }> {
  const db = adminDb();
  const base = db.collection('companies').doc(captured.company.id);
  const date = captured.todayIso;

  const scope = scopeOf(captured, manager.id, roleId);
  const ctx = contextFor(captured, scope);
  const signalsByUser = teamSignals(scope);
  const visibleTaskIds = new Set(scope.tasks.map((t) => t.id));

  const briefingSnap = await base.collection('analyses').doc(docId(date, manager.id, roleId)).get();
  const briefing = briefingSnap.exists
    ? String(briefingSnap.data()?.briefing ?? '')
    : 'Sin briefing todavía para este rol hoy.';

  const history = await recentFollowUps(base, manager.id, roleId, date);

  // Everybody in the manager's view except the manager: the reading is of
  // other people, and one's own follow-up is the plan.
  const team: FollowUpSubject[] = scope.users
    .filter((member) => member.id !== manager.id)
    .map((member) => ({
      member,
      signals: signalsByUser.get(member.id) ?? [],
      situations: captured.situations.filter((s) => s.userId === member.id),
      recent: history.byUser.get(member.id) ?? [],
    }));
  const memberIds = new Set(team.map((s) => s.member.id));

  if (team.length === 0) {
    await base.collection('followups').doc(docId(date, manager.id, roleId)).set({
      companyId: captured.company.id,
      managerUid: manager.id,
      roleId,
      date,
      generatedAt: new Date().toISOString(),
      readings: [],
      messages: [],
      outcome: history.today?.outcome ?? {},
      sentText: history.today?.sentText ?? {},
      model: '',
      costUsd: 0,
    });
    return { ok: true, messages: 0 };
  }

  let output: TeamFollowUpOutput;
  let usage: ClaudeUsage;
  try {
    const answer = await askClaude(
      followUpPrompt(ctx, manager, team, briefing),
      teamFollowUpSchema,
      { system: FOLLOWUP_SYSTEM },
    );
    output = answer.value;
    usage = answer.usage;
  } catch (cause) {
    return { ok: false, error: describe(cause) };
  }

  const cite = (userId: string, ids: string[]): CitedSignal[] => {
    const allowed = signalsByUser.get(userId) ?? [];
    return ids
      .map((id) => allowed.find((s) => s.id === id))
      .filter((s): s is Signal => Boolean(s))
      .map((s) => ({ id: s.id, severity: s.severity, summary: s.summary }));
  };

  const readings = output.readings
    .filter((reading) => memberIds.has(reading.userId))
    .map((reading) => ({
      userId: reading.userId,
      standing: reading.standing,
      reading: reading.reading,
      recommendation: reading.recommendation,
      signals: cite(reading.userId, reading.signalIds),
    }));

  const messages: FollowUp[] = [];
  for (const message of output.messages) {
    if (!memberIds.has(message.userId)) continue;

    const signals = cite(message.userId, message.signalIds);
    // The contract: a message rests on something real or it is not sent.
    if (signals.length === 0) continue;

    // A discreet note adjusts the ask; it never travels in the text. This only
    // catches the note repeated verbatim, which is the failure worth catching:
    // paraphrase is the model's job to avoid, and the prompt says so twice.
    const secrets = captured.situations.filter((s) => s.userId === message.userId && s.discreet);
    if (secrets.some((s) => leaksNote(message.message, s.note))) continue;

    // A comment belongs on a task the manager can actually open. When the model
    // names one they cannot see, the message still stands — it just goes direct.
    const onTask = message.target === 'comentario' && message.taskId
      && visibleTaskIds.has(message.taskId);
    const target: FollowUp['target'] = onTask
      ? { kind: 'comentario', taskId: message.taskId! }
      : { kind: 'directo' };
    const id = messageId(message.userId, target, messages);

    // Yesterday's message, again, helps nobody. It only survives if something
    // new is behind it or the tone has already escalated.
    const before = history.yesterday.get(id);
    if (before && !message.escalate && isRepeat(signals, before)) continue;

    const firstName =
      captured.members.find((m) => m.id === message.userId)?.displayName.split(' ')[0] ?? '';
    messages.push({
      id,
      userId: message.userId,
      target,
      tone: message.tone,
      message: ensureGreeting(message.message, firstName),
      why: message.why,
      ask: message.ask,
      signals,
      escalate: message.escalate,
    });
  }

  // A re-run on the same day keeps whatever the manager already marked: they
  // did send that message, and the new document should not pretend otherwise.
  const existing = history.today;
  const document: Omit<TeamFollowUp, 'id'> = {
    companyId: captured.company.id,
    managerUid: manager.id,
    roleId,
    date,
    generatedAt: new Date().toISOString(),
    readings,
    messages,
    outcome: existing?.outcome ?? {},
    sentText: existing?.sentText ?? {},
    model: usage.model,
    costUsd: usage.costUsd,
  };
  await base.collection('followups').doc(docId(date, manager.id, roleId)).set(document);

  return { ok: true, messages: messages.length, usage };
}

interface RecentEntry {
  date: string;
  tone: string;
  ask: string;
  outcome: string;
}

/** What this manager was told to say over the last few days, in this role, and what they did. */
async function recentFollowUps(
  base: DocumentReference,
  managerUid: string,
  roleId: string,
  todayIso: string,
): Promise<{
  byUser: Map<string, RecentEntry[]>;
  /** Yesterday's messages by message id, for the repeat check. */
  yesterday: Map<string, FollowUp>;
  today: TeamFollowUp | null;
}> {
  const days = [0, 1, 2, 3].map((back) => shiftIso(todayIso, -back));
  const snaps = await Promise.all(
    days.map((day) => base.collection('followups').doc(docId(day, managerUid, roleId)).get()),
  );

  const byUser = new Map<string, RecentEntry[]>();
  const yesterday = new Map<string, FollowUp>();
  const today = snaps[0]?.exists ? (snaps[0].data() as TeamFollowUp) : null;

  for (const [index, snap] of snaps.entries()) {
    if (index === 0 || !snap.exists) continue;
    const doc = snap.data() as TeamFollowUp;
    for (const message of doc.messages ?? []) {
      byUser.set(message.userId, [
        ...(byUser.get(message.userId) ?? []),
        {
          date: doc.date,
          tone: message.tone,
          ask: doc.sentText?.[message.id] ?? message.ask,
          outcome: doc.outcome?.[message.id] ?? 'sin marcar',
        },
      ]);
      if (index === 1) yesterday.set(message.id, message);
    }
  }

  return { byUser, yesterday, today };
}

/** The app reads this to say whether the engine is up and what it last did. */
async function heartbeat(report: RunReport): Promise<void> {
  const db = adminDb();
  const syncError =
    report.sync.find((s) => s.error)?.error ??
    report.githubSync.find((s) => s.error && s.mode !== 'skipped')?.error ??
    null;
  await db
    .collection('workers')
    .doc(WORKER_ID)
    .set(
      {
        lastHeartbeatAt: FieldValue.serverTimestamp(),
        hostname: hostname(),
        version: process.env.npm_package_version ?? '0.1.0',
        lastRun: {
          companyId: report.companyId,
          date: report.date,
          analysisOk: report.analysis.ok,
          plansOk: report.plans.filter((p) => p.ok).length,
          plansFailed: report.plans.filter((p) => !p.ok).length,
          messages: report.followUps.reduce((sum, f) => sum + (f.messages ?? 0), 0),
          durationMs: report.durationMs,
          costUsd:
            report.plans.reduce((sum, p) => sum + (p.usage?.costUsd ?? 0), 0) +
            report.followUps.reduce((sum, f) => sum + (f.usage?.costUsd ?? 0), 0),
          error: report.analysis.error ?? null,
          syncError,
        },
      },
      { merge: true },
    );
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    const extra = 'stderr' in cause ? String((cause as { stderr: string }).stderr).slice(0, 500) : '';
    return extra ? `${cause.message}\n${extra}` : cause.message;
  }
  return String(cause);
}
