import { describe, expect, it } from 'vitest';
import {
  MAX_DAY_LOG_CHARS,
  MAX_PLAN_RULES,
  activeRules,
  alreadyStated,
  dayLogId,
  dayLogText,
  handledProposal,
  rejectedFromProposal,
  ruleApplies,
  ruleFromProposal,
  sortPlanRules,
  trimPlanRules,
} from './plan-rules';
import type { PlanRule, ProposedRule } from './types';

const NOW = new Date('2026-10-11T18:00:00Z');

const rule = (overrides: Partial<PlanRule> = {}): PlanRule => ({
  id: 'pr_1',
  text: 'Ser dueño de un proyecto no es hacer sus tareas',
  scope: 'general',
  roleId: null,
  status: 'confirmed',
  source: { kind: 'manual' },
  createdAt: '2026-10-01T12:00:00Z',
  confirmedAt: '2026-10-01T12:00:00Z',
  ...overrides,
});

const proposal = (overrides: Partial<ProposedRule> = {}): ProposedRule => ({
  text: 'En una tarea de otra persona mi acción es dar seguimiento, no ejecutarla',
  scope: 'role',
  why: 'Marcaste "no aplica" tres veces en acciones de tareas de Juan',
  ...overrides,
});

describe('plan rules (ADR-014)', () => {
  it('counts a general rule in every role and a role rule only in its own', () => {
    expect(ruleApplies({ scope: 'general', roleId: null }, 'r_cto')).toBe(true);
    expect(ruleApplies({ scope: 'general', roleId: null }, null)).toBe(true);
    expect(ruleApplies({ scope: 'role', roleId: 'r_cto' }, 'r_cto')).toBe(true);
    expect(ruleApplies({ scope: 'role', roleId: 'r_cto' }, 'r_ceo')).toBe(false);
    // Nobody in no role holds a role's rule.
    expect(ruleApplies({ scope: 'role', roleId: 'r_cto' }, null)).toBe(false);
  });

  it('gives the prompt only confirmed rules in scope, newest first', () => {
    const rules = [
      rule({ id: 'a', createdAt: '2026-10-01T00:00:00Z' }),
      rule({ id: 'b', createdAt: '2026-10-05T00:00:00Z', scope: 'role', roleId: 'r_cto' }),
      rule({ id: 'c', scope: 'role', roleId: 'r_ceo' }),
      rule({ id: 'd', status: 'rejected' }),
    ];
    expect(activeRules(rules, 'r_cto').map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('caps what reaches the prompt, because rules that grow for ever contradict each other', () => {
    const many = Array.from({ length: MAX_PLAN_RULES + 5 }, (_, i) =>
      rule({ id: `pr_${i}`, createdAt: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    );
    expect(activeRules(many, null)).toHaveLength(MAX_PLAN_RULES);
  });

  it('keeps confirmed rules over rejected ones when trimming the stored list', () => {
    const confirmed = Array.from({ length: 3 }, (_, i) => rule({ id: `c_${i}` }));
    const rejected = Array.from({ length: 3 }, (_, i) => rule({ id: `r_${i}`, status: 'rejected' }));
    const trimmed = trimPlanRules([...rejected, ...confirmed], 4);
    expect(trimmed.filter((r) => r.status === 'confirmed')).toHaveLength(3);
    expect(trimmed).toHaveLength(4);
  });

  it('leaves a short list exactly as it found it, newest first', () => {
    const rules = [rule({ id: 'old', createdAt: '2026-09-01T00:00:00Z' }), rule({ id: 'new' })];
    expect(trimPlanRules(rules).map((r) => r.id)).toEqual(['new', 'old']);
    expect(sortPlanRules(rules).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('finds the answer a plan already got, whichever way it went', () => {
    const rules = [rule({ id: 'x', source: { kind: 'proposed', planId: 'd_u_r' }, status: 'rejected' })];
    expect(handledProposal(rules, 'd_u_r')?.id).toBe('x');
    expect(handledProposal(rules, 'otro_plan')).toBeNull();
    expect(handledProposal([rule()], 'd_u_r')).toBeNull();
  });

  it('spots a sentence already confirmed, whatever the spacing and case', () => {
    const rules = [rule({ text: 'Ser dueño de un proyecto no es hacer sus tareas' })];
    expect(alreadyStated(rules, '  ser DUEÑO de un proyecto   no es hacer sus tareas ')).toBe(true);
    expect(alreadyStated(rules, 'Los viernes no agendo reuniones')).toBe(false);
    // A rejected rule does not block the same sentence being written by hand.
    expect(alreadyStated([rule({ status: 'rejected' })], 'Ser dueño de un proyecto no es hacer sus tareas')).toBe(false);
  });

  it('pins a confirmed proposal to the role it was made in, and a general one to none', () => {
    const confirmed = ruleFromProposal(proposal(), {
      id: 'pr_9',
      planId: 'd_u_r',
      roleId: 'r_cto',
      now: NOW,
    });
    expect(confirmed).toMatchObject({
      scope: 'role',
      roleId: 'r_cto',
      status: 'confirmed',
      source: { kind: 'proposed', planId: 'd_u_r' },
      confirmedAt: NOW.toISOString(),
    });

    const general = ruleFromProposal(proposal({ scope: 'general' }), {
      id: 'pr_10',
      planId: 'd_u_r',
      roleId: 'r_cto',
      now: NOW,
    });
    expect(general.roleId).toBeNull();
  });

  it('keeps a rejection so the same proposal is not offered twice', () => {
    const turned = rejectedFromProposal(proposal(), {
      id: 'pr_11',
      planId: 'd_u_r',
      roleId: 'r_cto',
      now: NOW,
    });
    expect(turned.status).toBe('rejected');
    expect(turned.confirmedAt).toBeNull();
    expect(activeRules([turned], 'r_cto')).toEqual([]);
  });

  it('trims the proposal text, because the model likes a trailing space', () => {
    expect(ruleFromProposal(proposal({ text: '  Reviso PRs antes de escribir código  ' }), {
      id: 'pr_12',
      planId: 'd',
      roleId: null,
      now: NOW,
    }).text).toBe('Reviso PRs antes de escribir código');
  });
});

describe('the day log (ADR-014)', () => {
  it('is one document per person per day', () => {
    expect(dayLogId('2026-10-11', 'u_sergio')).toBe('2026-10-11_u_sergio');
  });

  it('gives the prompt nothing at all rather than an empty section', () => {
    expect(dayLogText(null)).toBeNull();
    expect(dayLogText(undefined)).toBeNull();
    expect(dayLogText({ text: '   \n ' })).toBeNull();
  });

  it('passes the person words through, trimmed', () => {
    expect(dayLogText({ text: '  Revisé los PRs de Juan y cerré TAR-966  ' })).toBe(
      'Revisé los PRs de Juan y cerré TAR-966',
    );
  });

  it('cuts a log too long for a prompt, and says it cut it', () => {
    const long = dayLogText({ text: 'x'.repeat(MAX_DAY_LOG_CHARS + 50) });
    expect(long).toHaveLength(MAX_DAY_LOG_CHARS + 1);
    expect(long?.endsWith('…')).toBe(true);
  });
});
