import type { DayLog, PlanRule, ProposedRule } from './types';

/**
 * How the engine is tuned day by day (ADR-014).
 *
 * Two things accumulate. A **day log** is what the person actually did,
 * in their own words, whether or not the plan ever asked for it — the only
 * channel that can reveal work the signals are blind to. A **plan rule** is
 * one confirmed sentence about how this person works, which reaches the
 * prompt and stays there.
 *
 * A rule changes how the model ranks and words a plan. It never invents the
 * facts underneath: `enforceCitations` still drops any item that cites no
 * signal the person was shown, so ADR-002 holds. Rules are prose, like
 * `roleDescription` and `expectations`.
 *
 * Nothing here touches Firestore or the clock on its own: `now` is injected,
 * so the Pi and the phone agree and the tests can freeze time.
 */

/**
 * How many confirmed rules may reach one prompt. A cap, because rules that
 * grow without bound end up contradicting each other, and the prompt has no
 * way to tell which of two opposing sentences the person still means.
 */
export const MAX_PLAN_RULES = 20;

/** How much of a day log reaches the prompt. Longer than this is a diary, not a note. */
export const MAX_DAY_LOG_CHARS = 4000;

/** Whether a rule counts for a person in a role: general ones always, role ones only in that role. */
export function ruleApplies(rule: Pick<PlanRule, 'scope' | 'roleId'>, roleId: string | null): boolean {
  return rule.scope === 'general' || (roleId !== null && rule.roleId === roleId);
}

/**
 * The rules that reach the prompt for one role: confirmed, in scope, newest
 * first, capped. Mirrors `activeObjectives` for ADR-013 — a rejected rule is
 * kept rather than deleted, so the same proposal is not offered twice.
 */
export function activeRules(rules: PlanRule[], roleId: string | null): PlanRule[] {
  return rules
    .filter((rule) => rule.status === 'confirmed' && ruleApplies(rule, roleId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_PLAN_RULES);
}

/** Every rule a person holds, newest first — what the editing screen lists. */
export function sortPlanRules(rules: PlanRule[]): PlanRule[] {
  return [...rules].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Keeps the list from growing for ever. Confirmed rules are kept over
 * rejected ones, because a rejection only has to outlive the plan that
 * proposed it.
 */
export function trimPlanRules(rules: PlanRule[], max = MAX_PLAN_RULES * 2): PlanRule[] {
  const sorted = sortPlanRules(rules);
  if (sorted.length <= max) return sorted;
  const confirmed = sorted.filter((rule) => rule.status === 'confirmed');
  const rejected = sorted.filter((rule) => rule.status === 'rejected');
  return [...confirmed, ...rejected].slice(0, max);
}

/**
 * Whether the proposal that came with a plan was already answered. The
 * answer lives on the rule the person wrote — confirmed or rejected, both
 * carry the plan's id — so the screen needs nothing written back to the plan
 * document, which only the engine may write.
 */
export function handledProposal(rules: PlanRule[], planId: string): PlanRule | null {
  return rules.find((rule) => rule.source.planId === planId) ?? null;
}

/**
 * Whether a proposal says something already on the list. A cheap guard, not a
 * semantic one: it catches the model proposing the same sentence again, which
 * is the common case, and leaves genuine duplicates to the person.
 */
export function alreadyStated(rules: PlanRule[], text: string): boolean {
  const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const candidate = normalise(text);
  return rules.some((rule) => rule.status === 'confirmed' && normalise(rule.text) === candidate);
}

/** A rule from a proposal the person confirmed. The engine never writes one of these. */
export function ruleFromProposal(
  proposal: ProposedRule,
  options: { id: string; planId: string; roleId: string | null; now: Date },
): PlanRule {
  const at = options.now.toISOString();
  return {
    id: options.id,
    text: proposal.text.trim(),
    scope: proposal.scope,
    roleId: proposal.scope === 'role' ? options.roleId : null,
    status: 'confirmed',
    source: { kind: 'proposed', planId: options.planId },
    createdAt: at,
    confirmedAt: at,
  };
}

/** The same proposal, turned down. Kept so it is not offered again. */
export function rejectedFromProposal(
  proposal: ProposedRule,
  options: { id: string; planId: string; roleId: string | null; now: Date },
): PlanRule {
  return {
    ...ruleFromProposal(proposal, options),
    status: 'rejected',
    confirmedAt: null,
  };
}

/** What the prompt gets: the person's own words, trimmed to something a prompt can hold. */
export function dayLogText(log: Pick<DayLog, 'text'> | null | undefined): string | null {
  const text = log?.text?.trim();
  if (!text) return null;
  return text.length > MAX_DAY_LOG_CHARS ? `${text.slice(0, MAX_DAY_LOG_CHARS)}…` : text;
}

/** `${date}_${uid}`: one log per person per day, edited all day rather than appended to. */
export function dayLogId(date: string, uid: string): string {
  return `${date}_${uid}`;
}
