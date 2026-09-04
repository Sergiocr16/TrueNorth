import type { CitedSignal, FollowUp, FollowUpTarget } from './types';

/**
 * The rules that keep a suggested message honest.
 *
 * These live here rather than in the engine because they are part of the
 * follow-up contract, not part of how it is run, and because a guard nobody can
 * test is not a guard. All three are deliberately blunt: they catch the
 * failures worth catching and leave judgement to the model.
 */

const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 } as const;

/**
 * A name for one message, stable across a re-run of the same day.
 *
 * One person can get two messages on the same morning — a comment on the task
 * that is stuck and a wider word about the week — and each is decided on its
 * own, so each needs its own id. Deriving it from who it is for and where it
 * goes means a manager who already copied one does not see it come back
 * unmarked when the day is recomputed.
 */
export function messageId(
  userId: string,
  target: FollowUpTarget,
  taken: { id: string }[],
): string {
  const base = `${userId}:${target.kind}:${target.kind === 'comentario' ? target.taskId : '-'}`;
  if (!taken.some((m) => m.id === base)) return base;
  let n = 2;
  while (taken.some((m) => m.id === `${base}:${n}`)) n += 1;
  return `${base}:${n}`;
}

/**
 * Whether today's message is yesterday's message again.
 *
 * The same signals, and nothing worse behind them, means nothing has changed
 * and saying it twice only teaches the reader to stop reading. A severity that
 * has risen is new information, so it goes out again.
 */
export function isRepeat(signals: CitedSignal[], before: FollowUp): boolean {
  const now = signals.map((s) => s.id).sort();
  const then = before.signals.map((s) => s.id).sort();
  if (now.length !== then.length || now.some((id, i) => id !== then[i])) return false;

  const worst = (list: CitedSignal[]) =>
    list.reduce((max, s) => Math.max(max, SEVERITY_RANK[s.severity]), -1);
  return worst(signals) <= worst(before.signals);
}

/**
 * Whether a message repeats a private note word for word.
 *
 * Only verbatim leakage: accents and spacing are normalised away, but a
 * paraphrase gets through. That is the honest limit of a code-level check —
 * avoiding the paraphrase is the model's job, and the prompt says so twice.
 * Short notes are not matched at all, because a three-word note would flag
 * every message that happens to share a phrase.
 */
export function leaksNote(message: string, note: string): boolean {
  const flatten = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const needle = flatten(note);
  return needle.length >= 12 && flatten(message).includes(needle);
}
