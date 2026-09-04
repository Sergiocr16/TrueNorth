import { NextResponse } from 'next/server';
import {
  atMidnight,
  fixtures,
  personalBriefingSchema,
  scopeFor,
  teamFollowUpSchema,
  teamSignals,
  todayIso,
  visibleSignals,
} from '@truenorth/core';
import { askClaude } from '../../../../server/engine/claude';
import {
  BRIEFING_PLAN_SYSTEM,
  FOLLOWUP_SYSTEM,
  briefingAndPlanPrompt,
  followUpPrompt,
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

  // `?step=followup` exercises the team follow-up instead of the morning call.
  // Both run on fixtures, scoped to the first person's role exactly as the
  // real run would be, and touch no database.
  const step = new URL(request.url).searchParams.get('step') ?? 'day';
  const company = fixtures.companies[0]!;
  const members = fixtures.users.flatMap((u) => {
    const membership = fixtures.memberships.find(
      (m) => m.userId === u.id && m.companyId === company.id,
    );
    return membership ? [{ ...u, membership }] : [];
  });
  const iso = todayIso();
  const today = atMidnight(iso);
  const member = members[0]!;
  const manager = members.find((m) => m.membership.access !== 'member') ?? member;
  const subject = step === 'followup' ? manager : member;
  const roleId = subject.membership.activeRoleId ?? subject.membership.roleIds[0] ?? null;

  const scope = scopeFor(
    {
      today,
      objectives: fixtures.objectives,
      projects: fixtures.projects,
      tasks: fixtures.tasks,
      sources: fixtures.sources,
      roles: fixtures.roles,
      members,
      planHistory: [],
    },
    subject.id,
    roleId,
  );
  const ctx: CompanyContext = {
    company,
    objectives: scope.objectives,
    projects: scope.projects,
    tasks: scope.tasks,
    members: scope.users,
    signals: scope.signals,
    role: scope.role,
    sources: fixtures.sources.filter((s) => scope.sourceIds.includes(s.id)),
    today,
    todayIso: iso,
  };

  const started = Date.now();
  try {
    if (step === 'followup') {
      const byUser = teamSignals(scope);
      const team: FollowUpSubject[] = scope.users
        .filter((m) => m.id !== manager.id)
        .map((s) => ({
          member: s,
          signals: byUser.get(s.id) ?? [],
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
        role: scope.role?.name ?? null,
        team: team.map((s) => ({ name: s.member.displayName, signals: s.signals.length })),
        durationMs: Date.now() - started,
        usage: answer.usage,
        modelUsage: answer.modelUsage,
        followUp: answer.value,
      });
    }

    const personal = visibleSignals(scope, member.id);
    const answer = await askClaude(
      briefingAndPlanPrompt(ctx, member, personal, null),
      personalBriefingSchema,
      { system: BRIEFING_PLAN_SYSTEM },
    );
    return NextResponse.json({
      ok: true,
      step,
      member: member.displayName,
      role: scope.role?.name ?? null,
      sources: scope.sourceIds,
      signals: personal.length,
      durationMs: Date.now() - started,
      usage: answer.usage,
      modelUsage: answer.modelUsage,
      briefing: answer.value.analysis,
      plan: answer.value.plan,
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
