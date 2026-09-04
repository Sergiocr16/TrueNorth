import 'server-only';

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { hostname } from 'node:os';
import {
  companyAnalysisSchema,
  dailyPlanSchema,
  isRepeat,
  leaksNote,
  messageId,
  shiftIso,
  teamFollowUpSchema,
  teamSignals,
  todayIso as computeTodayIso,
  visibleProjects,
  visibleSignals,
  visibleTasks,
  type CitedSignal,
  type CompanyAnalysisOutput,
  type DailyPlanOutput,
  type FollowUp,
  type Signal,
  type TeamFollowUp,
  type TeamFollowUpOutput,
} from '@truenorth/core';
import { adminDb } from '../admin';
import { askClaude, type ClaudeUsage } from './claude';
import { captureCompany, type Captured, type MemberRecord } from './capture';
import {
  ANALYSIS_SYSTEM,
  FOLLOWUP_SYSTEM,
  PLAN_SYSTEM,
  analysisPrompt,
  followUpPrompt,
  planPrompt,
  type FollowUpSubject,
} from './prompts';

/**
 * The daily engine, and the same machinery reused for a single-person replan.
 *
 * One company per call. The steps are the ones the product plan describes:
 * capture, signals in code, one analysis call, one plan call per member, then
 * write. The two model calls are the only places Claude is involved; everything
 * around them is deterministic and logged.
 */

export interface RunReport {
  companyId: string;
  date: string;
  /** True when the company had nothing to analyse, so no model call was made. */
  skipped?: boolean;
  analysis: { ok: boolean; usage?: ClaudeUsage; error?: string };
  plans: { uid: string; ok: boolean; usage?: ClaudeUsage; error?: string }[];
  /** One per manager: owners and admins are the people who follow up. */
  followUps: { uid: string; ok: boolean; messages?: number; usage?: ClaudeUsage; error?: string }[];
  durationMs: number;
}

const WORKER_ID = process.env.WORKER_ID ?? 'pi-01';

export async function runDaily(companyId: string, dateIso?: string): Promise<RunReport> {
  const started = Date.now();
  const date = dateIso ?? computeTodayIso();
  const captured = await captureCompany(companyId, date);
  const db = adminDb();
  const base = db.collection('companies').doc(companyId);

  const report: RunReport = {
    companyId,
    date,
    analysis: { ok: false },
    plans: [],
    followUps: [],
    durationMs: 0,
  };

  // An empty workspace has nothing to reason about, and the nightly run goes
  // over every company. Skipping costs nothing; analysing costs a model call
  // and produces a briefing about no data.
  if (captured.objectives.length === 0 && captured.tasks.length === 0) {
    report.skipped = true;
    report.analysis = { ok: true };
    report.durationMs = Date.now() - started;
    return report;
  }

  // 1. The company analysis. If this fails there is no point going on: every
  //    plan quotes it.
  let analysis: CompanyAnalysisOutput;
  let analysisUsage: ClaudeUsage;
  try {
    const answer = await askClaude(analysisPrompt(captured), companyAnalysisSchema, {
      system: ANALYSIS_SYSTEM,
    });
    analysis = answer.value;
    analysisUsage = answer.usage;
    report.analysis = { ok: true, usage: analysisUsage };
  } catch (cause) {
    report.analysis = { ok: false, error: describe(cause) };
    report.durationMs = Date.now() - started;
    await heartbeat(report);
    return report;
  }

  await base.collection('analyses').doc(date).set({
    companyId,
    date,
    generatedAt: new Date().toISOString(),
    briefing: analysis.briefing,
    topRisks: analysis.topRisks,
    pendingDecisions: analysis.pendingDecisions,
    perspectives: analysis.perspectives,
    model: analysisUsage.model,
    costUsd: analysisUsage.costUsd,
    usage: {
      inputTokens: analysisUsage.inputTokens,
      outputTokens: analysisUsage.outputTokens,
      durationMs: analysisUsage.durationMs,
    },
  });

  // 2. One plan per member. Sequential on purpose: a Raspberry Pi has four
  //    cores and the subscription has a rate window, and a company of a few
  //    people finishes in a few minutes either way.
  //    Only for people who will read one: a team member without an account is
  //    followed up on below, but a plan nobody opens is a wasted call.
  for (const member of captured.members.filter((m) => m.membership.hasAccount)) {
    const result = await planFor(captured, member, analysis.briefing);
    report.plans.push({ uid: member.id, ...result });
  }

  // 3. The team follow-up, once per manager. A plain member has nobody to
  //    follow up with, and the situations behind it are theirs to not see.
  for (const manager of captured.members.filter((m) => m.membership.access !== 'member')) {
    const result = await followUpFor(captured, manager, analysis.briefing);
    report.followUps.push({ uid: manager.id, ...result });
  }

  report.durationMs = Date.now() - started;
  await heartbeat(report);
  return report;
}

/** Recalculate one person's plan now, e.g. from the button on the Today screen. */
export async function replan(companyId: string, uid: string, dateIso?: string): Promise<RunReport> {
  const started = Date.now();
  const date = dateIso ?? computeTodayIso();
  const captured = await captureCompany(companyId, date);
  const member = captured.members.find((m) => m.id === uid);
  if (!member) throw new Error(`user ${uid} is not a member of ${companyId}`);

  // Reuse today's analysis if there is one; a replan is about the person, not
  // the company, and should not spend a second analysis call.
  const db = adminDb();
  const analysisSnap = await db
    .collection('companies')
    .doc(companyId)
    .collection('analyses')
    .doc(date)
    .get();
  const briefing = analysisSnap.exists
    ? String(analysisSnap.data()?.briefing ?? '')
    : 'Sin briefing de empresa todavía para hoy.';

  const result = await planFor(captured, member, briefing);
  const report: RunReport = {
    companyId,
    date,
    analysis: { ok: analysisSnap.exists },
    plans: [{ uid, ...result }],
    followUps: [],
    durationMs: Date.now() - started,
  };
  await heartbeat(report);
  return report;
}

async function planFor(
  captured: Captured,
  member: MemberRecord,
  briefing: string,
): Promise<{ ok: boolean; usage?: ClaudeUsage; error?: string }> {
  const db = adminDb();
  const base = db.collection('companies').doc(captured.company.id);

  // Visibility is re-applied here because the Admin SDK saw everything.
  const scoped: Captured = {
    ...captured,
    projects: visibleProjects(captured.projects, member.id),
    tasks: visibleTasks(captured.tasks, captured.projects, member.id),
  };
  const personal = visibleSignals(captured.signals, captured.projects, member.id);
  const allowedSignalIds = new Set(personal.map((s) => s.id));

  const yesterday = captured.yesterdayPlans.get(member.id);
  const yesterdaySummary = yesterday
    ? {
        headline: yesterday.headline,
        done: yesterday.items
          .filter((_, i) => yesterday.feedback?.[i] === 'done')
          .map((i) => i.title),
        skipped: yesterday.items
          .filter((_, i) => yesterday.feedback?.[i] && yesterday.feedback[i] !== 'done')
          .map((i) => i.title),
      }
    : null;

  let plan: DailyPlanOutput;
  let usage: ClaudeUsage;
  try {
    const answer = await askClaude(
      planPrompt(scoped, member, personal, briefing, yesterdaySummary),
      dailyPlanSchema,
      { system: PLAN_SYSTEM },
    );
    plan = answer.value;
    usage = answer.usage;
  } catch (cause) {
    return { ok: false, error: describe(cause) };
  }

  // The contract, enforced: an item may only cite signals it was shown. Any
  // that cites nothing real is dropped; a plan left with fewer than three
  // items is still written, because a short honest plan beats a padded one.
  const items = plan.items
    .map((item) => ({
      ...item,
      signalIds: item.signalIds.filter((id) => allowedSignalIds.has(id)),
    }))
    .filter((item) => item.signalIds.length > 0);

  await base
    .collection('plans')
    .doc(`${captured.todayIso}_${member.id}`)
    .set({
      companyId: captured.company.id,
      uid: member.id,
      userId: member.id,
      date: captured.todayIso,
      headline: plan.headline,
      why: plan.why,
      items,
      consequenceIfNotDone: plan.consequenceIfNotDone,
      deliveredAt: new Date().toISOString(),
      stale: false,
      feedback: {},
      model: usage.model,
      costUsd: usage.costUsd,
    });

  return { ok: true, usage };
}

/**
 * The team follow-up for one manager.
 *
 * Everything here that can be checked is checked in code, because the model is
 * writing something a person will send to another person: a message may only
 * cite signals the manager was shown, may only point at a task they can see,
 * and may never repeat itself the day after.
 */
async function followUpFor(
  captured: Captured,
  manager: MemberRecord,
  briefing: string,
): Promise<{ ok: boolean; messages?: number; usage?: ClaudeUsage; error?: string }> {
  const db = adminDb();
  const base = db.collection('companies').doc(captured.company.id);
  const date = captured.todayIso;

  // Visibility again: a private project the manager is not on stays invisible,
  // even when the person it concerns is somebody they manage.
  const scoped: Captured = {
    ...captured,
    projects: visibleProjects(captured.projects, manager.id),
    tasks: visibleTasks(captured.tasks, captured.projects, manager.id),
  };
  const signalsByUser = teamSignals(captured.signals, captured.projects, manager.id);
  const visibleTaskIds = new Set(scoped.tasks.map((t) => t.id));
  const memberIds = new Set(captured.members.map((m) => m.id));

  const history = await recentFollowUps(base, manager.id, date);

  const team: FollowUpSubject[] = captured.members.map((member) => ({
    member,
    signals: signalsByUser.get(member.id) ?? [],
    situations: captured.situations.filter((s) => s.userId === member.id),
    recent: history.byUser.get(member.id) ?? [],
  }));

  let output: TeamFollowUpOutput;
  let usage: ClaudeUsage;
  try {
    const answer = await askClaude(
      followUpPrompt(scoped, manager, team, briefing),
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

    messages.push({
      id,
      userId: message.userId,
      target,
      tone: message.tone,
      message: message.message,
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
    date,
    generatedAt: new Date().toISOString(),
    readings,
    messages,
    outcome: existing?.outcome ?? {},
    sentText: existing?.sentText ?? {},
    model: usage.model,
    costUsd: usage.costUsd,
  };
  await base.collection('followups').doc(`${date}_${manager.id}`).set(document);

  return { ok: true, messages: messages.length, usage };
}

interface RecentEntry {
  date: string;
  tone: string;
  ask: string;
  outcome: string;
}

/** What this manager was told to say over the last few days, and what they did. */
async function recentFollowUps(
  base: DocumentReference,
  managerUid: string,
  todayIso: string,
): Promise<{
  byUser: Map<string, RecentEntry[]>;
  /** Yesterday's messages by message id, for the repeat check. */
  yesterday: Map<string, FollowUp>;
  today: TeamFollowUp | null;
}> {
  const days = [0, 1, 2, 3].map((back) => shiftIso(todayIso, -back));
  const snaps = await Promise.all(
    days.map((day) => base.collection('followups').doc(`${day}_${managerUid}`).get()),
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
            (report.analysis.usage?.costUsd ?? 0) +
            report.plans.reduce((sum, p) => sum + (p.usage?.costUsd ?? 0), 0) +
            report.followUps.reduce((sum, f) => sum + (f.usage?.costUsd ?? 0), 0),
          error: report.analysis.error ?? null,
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
