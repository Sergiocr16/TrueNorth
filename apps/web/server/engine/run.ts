import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { hostname } from 'node:os';
import {
  companyAnalysisSchema,
  dailyPlanSchema,
  todayIso as computeTodayIso,
  visibleProjects,
  visibleSignals,
  visibleTasks,
  type CompanyAnalysisOutput,
  type DailyPlanOutput,
} from '@truenorth/core';
import { adminDb } from '../admin';
import { askClaude, type ClaudeUsage } from './claude';
import { captureCompany, type Captured, type MemberRecord } from './capture';
import { ANALYSIS_SYSTEM, PLAN_SYSTEM, analysisPrompt, planPrompt } from './prompts';

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
  for (const member of captured.members) {
    const result = await planFor(captured, member, analysis.briefing);
    report.plans.push({ uid: member.id, ...result });
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
          durationMs: report.durationMs,
          costUsd:
            (report.analysis.usage?.costUsd ?? 0) +
            report.plans.reduce((sum, p) => sum + (p.usage?.costUsd ?? 0), 0),
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
