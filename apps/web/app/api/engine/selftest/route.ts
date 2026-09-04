import { NextResponse } from 'next/server';
import {
  atMidnight,
  computeSignals,
  dailyPlanSchema,
  fixtures,
  signalsForUser,
  teamFollowUpSchema,
  teamSignals,
  todayIso,
} from '@truenorth/core';
import { askClaude } from '../../../../server/engine/claude';
import {
  FOLLOWUP_SYSTEM,
  PLAN_SYSTEM,
  followUpPrompt,
  planPrompt,
  type CompanyContext,
  type FollowUpSubject,
} from '../../../../server/engine/prompts';

/**
 * Proves the engine can reach Claude Code from inside this process, using the
 * sample company and touching no database. Run it once after installing the
 * Pi (see docs/pi-setup.md) and whenever "Recalcular" fails, to tell a Claude
 * problem from a Firestore one:
 *
 *   curl -H "Authorization: Bearer $ENGINE_LOCAL_TOKEN" http://localhost:3000/api/engine/selftest
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function GET(request: Request) {
  const expected = process.env.ENGINE_LOCAL_TOKEN;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // `?step=followup` exercises the team follow-up instead of the plan. Both run
  // on fixtures and touch no database, so this proves the schema and the prompt
  // without spending a call on real people.
  const step = new URL(request.url).searchParams.get('step') ?? 'plan';
  const company = fixtures.companies[0]!;
  const members = fixtures.users.flatMap((u) => {
    const membership = fixtures.memberships.find(
      (m) => m.userId === u.id && m.companyId === company.id,
    );
    return membership ? [{ ...u, membership }] : [];
  });
  const iso = todayIso();
  const today = atMidnight(iso);
  const ctx: CompanyContext = {
    company,
    objectives: fixtures.objectives,
    projects: fixtures.projects,
    tasks: fixtures.tasks,
    members,
    signals: computeSignals({
      today,
      objectives: fixtures.objectives,
      projects: fixtures.projects,
      tasks: fixtures.tasks,
      users: members,
    }),
    today,
    todayIso: iso,
  };
  const member = members[0]!;
  const personal = signalsForUser(ctx.signals, member.id, ctx.projects);

  const started = Date.now();
  try {
    if (step === 'followup') {
      const manager = members.find((m) => m.membership.access !== 'member') ?? member;
      const byUser = teamSignals(ctx.signals, ctx.projects, manager.id);
      const team: FollowUpSubject[] = members.map((subject) => ({
        member: subject,
        signals: byUser.get(subject.id) ?? [],
        situations: [],
        recent: [],
      }));

      const answer = await askClaude(
        followUpPrompt(ctx, manager, team, 'Prueba del motor: sin briefing de empresa.'),
        teamFollowUpSchema,
        { system: FOLLOWUP_SYSTEM },
      );
      return NextResponse.json({
        ok: true,
        step,
        manager: manager.displayName,
        team: team.map((s) => ({ name: s.member.displayName, signals: s.signals.length })),
        durationMs: Date.now() - started,
        usage: answer.usage,
        modelUsage: answer.modelUsage,
        followUp: answer.value,
      });
    }

    const answer = await askClaude(
      planPrompt(ctx, member, personal, 'Prueba del motor: sin briefing de empresa.', null),
      dailyPlanSchema,
      { system: PLAN_SYSTEM },
    );
    return NextResponse.json({
      ok: true,
      step,
      member: member.displayName,
      signals: personal.length,
      durationMs: Date.now() - started,
      usage: answer.usage,
      modelUsage: answer.modelUsage,
      plan: answer.value,
    });
  } catch (cause) {
    const stderr =
      cause && typeof cause === 'object' && 'stderr' in cause
        ? String((cause as { stderr: unknown }).stderr).slice(0, 2000)
        : undefined;
    return NextResponse.json(
      { ok: false, error: cause instanceof Error ? cause.message : String(cause), stderr },
      { status: 502 },
    );
  }
}
