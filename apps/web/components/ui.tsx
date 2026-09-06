'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { HealthStatus, PullRequest, Task, TaskStatus, User } from '@truenorth/core';
import { idleDays, isOverdue, notionUrl, progressDays } from '@truenorth/core';
import { usePreferences, useT } from '../lib/preferences';
import { useStore } from '../lib/store';
import { formatShortDate } from '../lib/i18n/dictionary';
import { Chevron, CheckIcon, GithubMark, NotionMark, SmallTriangle, WarningTriangle } from './icons';
import { Overlay } from './overlay';

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

/** Section eyebrow: uppercase, tracked, tertiary ink. */
export function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between px-1 pb-1.5">
      <span className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
        {children}
      </span>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`tn-card ${className}`} style={style}>
      {children}
    </div>
  );
}

/** Grouped inset list, the iOS pattern: one card, hairlines between rows. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`tn-card overflow-hidden ${className}`}>{children}</div>;
}

export function ListRow({
  title,
  subtitle,
  detail,
  leading,
  trailing,
  chevron = false,
  isLast = false,
  onClick,
  href,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  isLast?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-semibold leading-tight text-[var(--ink)]">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 text-[15px] leading-snug text-[var(--sec)]">{subtitle}</div>
        ) : null}
      </div>
      {detail ? <div className="shrink-0 text-[15px] text-[var(--sec)]">{detail}</div> : null}
      {trailing}
      {chevron ? (
        <span className="shrink-0 text-[var(--ter)]">
          <Chevron />
        </span>
      ) : null}
    </>
  );

  const className = `flex w-full items-center gap-3.5 px-4 py-3 text-left min-h-11 ${
    isLast ? '' : 'tn-hairline'
  } ${onClick || href ? 'tn-press active:bg-[var(--chip-bg)]' : ''}`;

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const HEALTH_STYLE: Record<HealthStatus, { bg: string; fg: string }> = {
  on_track: { bg: 'var(--slate-bg)', fg: 'var(--slate)' },
  at_risk: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  late: { bg: 'var(--red-bg)', fg: 'var(--red)' },
  done: { bg: 'var(--green-bg)', fg: 'var(--green)' },
};

/**
 * Status is encoded in shape as well as colour: at-risk and late carry a
 * triangle, done carries a check. Colour alone never conveys the state.
 */
export function StatusPill({ status, size = 'md' }: { status: HealthStatus; size?: 'sm' | 'md' }) {
  const t = useT();
  const style = HEALTH_STYLE[status];
  const pad = size === 'sm' ? 'px-2.5 py-0.5 text-[12px]' : 'px-2.5 py-1 text-[13px]';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`}
      style={{ background: style.bg, color: style.fg }}
    >
      {status === 'at_risk' || status === 'late' ? <SmallTriangle size={10} /> : null}
      {status === 'done' ? <CheckIcon size={11} /> : null}
      {t.status[status]}
    </span>
  );
}

export function TaskStatusPill({ status, label }: { status: TaskStatus; label?: string }) {
  const t = useT();
  const map: Record<TaskStatus, { bg: string; fg: string }> = {
    todo: { bg: 'var(--chip-bg)', fg: 'var(--sec)' },
    in_progress: { bg: 'var(--slate-bg)', fg: 'var(--slate)' },
    blocked: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
    done: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  };
  const style = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
      style={{ background: style.bg, color: style.fg }}
    >
      {label ?? t.taskStatus[status]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Pull requests                                                        */
/* ------------------------------------------------------------------ */

/** What a pull request is waiting on, in one word and one shape. */
export function pullState(pr: PullRequest): 'merged' | 'closed' | 'draft' | 'changes' | 'approved' | 'waiting' {
  if (pr.state === 'merged') return 'merged';
  if (pr.state === 'closed') return 'closed';
  if (pr.draft) return 'draft';
  if (pr.reviewState === 'changes_requested') return 'changes';
  if (pr.reviewState === 'approved') return 'approved';
  return 'waiting';
}

/** The pull request that speaks for a task: open first, then the latest. */
export function usePullFor(taskId: string | null | undefined): PullRequest | undefined {
  const { pullRequests } = useStore();
  if (!taskId) return undefined;
  const mine = pullRequests.filter((pr) => pr.taskId === taskId);
  if (mine.length === 0) return undefined;
  const open = mine.filter((pr) => pr.state === 'open');
  const pick = (list: PullRequest[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return pick(open) ?? pick(mine);
}

/** "#42 · esperando revisión": the number, the state, and a shape for the state. */
export function PullPill({ pr }: { pr: PullRequest }) {
  const t = useT();
  const state = pullState(pr);
  const styles: Record<ReturnType<typeof pullState>, { bg: string; fg: string }> = {
    merged: { bg: 'var(--green-bg)', fg: 'var(--green)' },
    closed: { bg: 'var(--chip-bg)', fg: 'var(--ter)' },
    draft: { bg: 'var(--chip-bg)', fg: 'var(--sec)' },
    changes: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
    approved: { bg: 'var(--green-bg)', fg: 'var(--green)' },
    waiting: { bg: 'var(--slate-bg)', fg: 'var(--slate)' },
  };
  const style = styles[state];
  return (
    <span
      className="tn-tabular inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
      style={{ background: style.bg, color: style.fg }}
    >
      {state === 'merged' || state === 'approved' ? <CheckIcon size={11} /> : null}
      {state === 'changes' ? <SmallTriangle size={10} /> : null}
      #{pr.number} · {t.pull[state]}
    </span>
  );
}

/** One pull request as a row: number, title, author, state, age, and the link. */
export function PullRequestLine({ pr, users, today, isLast = false }: { pr: PullRequest; users: User[]; today: Date; isLast?: boolean }) {
  const t = useT();
  const author = users.find((u) => u.id === pr.authorUserId);
  const days = Math.max(0, Math.floor((today.getTime() - new Date(pr.lastPushAt ?? pr.createdAt).getTime()) / 86_400_000));
  return (
    <div className={`flex items-start gap-2 px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="tn-tabular text-[13px] font-bold text-[var(--accent)]">#{pr.number}</span>
          <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">{pr.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--ter)]">
          <PullPill pr={pr} />
          <span className="flex items-center gap-1.5">
            <Avatar initials={author?.initials ?? '—'} size={20} />
            {author?.displayName ?? pr.authorLogin}
          </span>
          <span className="tn-tabular">{pr.headRef} → {pr.baseRef}</span>
          <span className="tn-tabular">{t.pull.age(days)}</span>
        </div>
      </div>
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        aria-label={t.pull.open}
        title={t.pull.open}
        className="tn-press mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      >
        <GithubMark size={18} />
      </a>
    </div>
  );
}

/** Where a record came from: the app, or a named Notion database. */
export function SourceBadge({ source, title }: { source: 'app' | 'notion'; title?: string }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-md bg-[var(--chip-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--sec)]">
      {source === 'notion' ? (title ?? t.common.notion) : t.common.app}
    </span>
  );
}

/** The title of a record's Notion source, when it has one the store knows. */
export function useSourceTitle(sourceId: string | null | undefined): string | undefined {
  const { sources } = useStore();
  return sourceId ? sources.find((s) => s.id === sourceId)?.title : undefined;
}

export function Avatar({ initials, size = 44 }: { initials: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl bg-[var(--ink)] font-bold text-[var(--ground)]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

/**
 * One task, wherever it shows up.
 *
 * Three things it always says, because they are the three questions somebody
 * asks about a task they did not write: what is it called, who is on it, and
 * has it moved. The name comes first — a code like TAR-966 identifies a task to
 * whoever already knows it and to nobody else.
 *
 * The Notion link sits outside the button rather than inside it: a link nested
 * in a button is invalid, and the two do different things anyway.
 */
export function TaskLine({
  task,
  users,
  today,
  onOpen,
  showActivity = true,
}: {
  task: Task;
  users: User[];
  today?: Date;
  onOpen?: () => void;
  showActivity?: boolean;
}) {
  const t = useT();
  const { locale } = usePreferences();
  const sourceTitle = useSourceTitle(task.sourceId);
  const pr = usePullFor(task.id);

  const notion = notionUrl(task.notionPageId);
  // Everybody responsible, as Notion has it. The first gets a name; the rest
  // stack as avatars, with the full list on hover.
  const responsible = (task.assigneeUserIds ?? [])
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => Boolean(u));
  const assignee = responsible[0];
  const others = responsible.slice(1);

  const overdue = today ? isOverdue(task, today) : false;
  // The owner's own progress when we can tell it apart, anybody's activity
  // otherwise — the same two clocks the engine reads.
  const progress = today ? progressDays(task, today) : null;
  const idle = today ? idleDays(task, today) : null;

  const activity: string[] = [];
  if (progress !== null) activity.push(t.task.progress(progress));
  else if (idle !== null) activity.push(t.task.idle(idle));
  if (task.lastCommentAt) {
    const author = users.find((u) => u.id === task.lastCommentBy)?.displayName ?? '—';
    activity.push(t.task.lastComment(author, formatShortDate(task.lastCommentAt.slice(0, 10), locale)));
  }

  const body = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2">
        {task.code ? (
          <span className="tn-tabular text-[13px] font-bold text-[var(--accent)]">{task.code}</span>
        ) : null}
        <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">
          {task.title}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--ter)]">
        <TaskStatusPill status={task.status} label={task.notionStatus} />
        <span
          className="tn-tabular"
          style={overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}
        >
          {task.dueDate ? formatShortDate(task.dueDate, locale) : t.projects.noDue}
        </span>
        <span className="flex items-center gap-1.5">
          <Avatar initials={assignee?.initials ?? '—'} size={20} />
          {assignee?.displayName ?? t.projects.unassigned}
        </span>
        {others.length > 0 ? (
          <span
            className="flex items-center gap-1"
            title={`${t.task.involved}: ${others.map((u) => u.displayName).join(', ')}`}
          >
            <span className="flex -space-x-1.5">
              {others.map((u) => (
                <Avatar key={u.id} initials={u.initials} size={20} />
              ))}
            </span>
          </span>
        ) : null}
        {sourceTitle ? <SourceBadge source="notion" title={sourceTitle} /> : null}
        {pr ? <PullPill pr={pr} /> : null}
      </div>

      {showActivity && activity.length > 0 ? (
        <div className="mt-1 text-[13px] leading-snug text-[var(--faint)]">
          {activity.join(' · ')}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="tn-hairline flex w-full items-start gap-2 px-4 py-3">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="tn-press min-w-0 flex-1 text-left">
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}

      {/* The Notion mark is the row's one visible action: it opens the page.
          Tapping the body opens the editor, and needs no chevron to say so —
          a chevron promises a screen, and a task has none of its own. */}
      {notion ? (
        <a
          href={notion}
          target="_blank"
          rel="noreferrer"
          aria-label={t.task.openInNotion}
          title={t.task.openInNotion}
          className="tn-press mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        >
          <NotionMark size={18} />
        </a>
      ) : null}
      {pr ? (
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          aria-label={t.pull.open}
          title={t.pull.open}
          className="tn-press mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        >
          <GithubMark size={18} />
        </a>
      ) : null}
    </div>
  );
}

/**
 * One number and what it counts. Three of these above a list say more than
 * the list's first screen, which is why they come first.
 */
export function GlanceTile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'amber' | 'accent' | 'red' | 'green' | 'neutral';
}) {
  const colour = {
    amber: 'var(--amber)',
    accent: 'var(--accent)',
    red: 'var(--red)',
    green: 'var(--green)',
    neutral: 'var(--ink)',
  }[tone];
  return (
    <Card className="flex flex-col items-start px-3.5 py-3">
      <span className="tn-tabular text-[28px] font-bold leading-none" style={{ color: colour }}>
        {value}
      </span>
      <span className="mt-1 text-[12px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
        {label}
      </span>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

/**
 * Progress bar with the expected-progress marker. The marker is the whole
 * point: a bar at 46 % means nothing until you see that it should be at 64 %.
 */
export function ProgressBar({
  value,
  expected,
  status,
  height = 8,
}: {
  value: number;
  expected?: number;
  status: HealthStatus;
  height?: number;
}) {
  const t = useT();
  const fill = HEALTH_STYLE[status].fg;
  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-[var(--chip-bg)]"
      style={{ height }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${t.objectives.actual} ${value}%`}
    >
      <div
        className="tn-bar h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: fill }}
      />
      {typeof expected === 'number' ? (
        <div
          className="absolute top-0 h-full w-0.5 rounded-full bg-[var(--ink)] opacity-40"
          style={{ left: `${Math.min(100, Math.max(0, expected))}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  children,
  onClick,
  full = true,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`tn-press flex h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] px-5 text-[17px] font-semibold text-[var(--on-accent)] ${
        full ? 'w-full' : ''
      }`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  full = true,
}: {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tn-press flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[var(--btn-border)] bg-[var(--surface)] px-5 text-[17px] font-semibold text-[var(--ink)] ${
        full ? 'w-full' : ''
      }`}
      style={{ boxShadow: '0 1px 2px rgba(23,29,46,.04)' }}
    >
      {children}
    </button>
  );
}

export function TextButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tn-press min-h-11 text-[15px] font-semibold text-[var(--accent)]"
    >
      {children}
    </button>
  );
}

/** Small pill button used for plan feedback and inline choices. */
export function ChipButton({
  children,
  selected = false,
  tone = 'neutral',
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  tone?: 'neutral' | 'positive';
  onClick?: () => void;
}) {
  const bg = selected
    ? tone === 'positive'
      ? 'var(--green-bg)'
      : 'var(--accent-bg)'
    : 'var(--chip-bg)';
  const fg = selected
    ? tone === 'positive'
      ? 'var(--green)'
      : 'var(--accent)'
    : 'var(--sec)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="tn-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {selected ? <CheckIcon size={12} /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Banners, sheets, states                                             */
/* ------------------------------------------------------------------ */

export function Banner({
  tone = 'warning',
  icon,
  children,
}: {
  tone?: 'warning' | 'info' | 'error';
  icon?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    warning: { bg: 'var(--amber-bg)', border: 'var(--amber-line)', fg: 'var(--warn)', icon: 'var(--amber)' },
    info: { bg: 'var(--accent-bg)', border: 'var(--btn-border)', fg: 'var(--ink)', icon: 'var(--accent)' },
    error: { bg: 'var(--red-bg)', border: 'var(--red-bg)', fg: 'var(--red)', icon: 'var(--red)' },
  }[tone];
  return (
    <div
      className="flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5"
      style={{ background: tones.bg, border: `0.5px solid ${tones.border}` }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: tones.icon }}>
        {icon ?? <WarningTriangle />}
      </span>
      <div className="text-[14px] leading-snug" style={{ color: tones.fg }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-10 text-center">
      {icon ? <div className="mb-4 text-[var(--ter)]">{icon}</div> : null}
      <div className="text-[20px] font-semibold text-[var(--ink)]">{title}</div>
      <p className="mt-2 max-w-[300px] text-[15px] leading-snug text-[var(--sec)]">{body}</p>
      {action ? <div className="mt-5 w-full max-w-[280px]">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="tn-skeleton" style={{ height, width }} aria-hidden />;
}

/** Segmented control, used for the five briefing perspectives on mobile. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-[var(--chip-bg)] p-[3px]" role="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className="tn-press rounded-full px-4 py-1.5 text-[13px] font-semibold"
            style={
              selected
                ? {
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    boxShadow: '0 1px 2px rgba(23,29,46,.1)',
                  }
                : { color: 'var(--sec)' }
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Bottom sheet in glass, over a dimmed backdrop. Chrome, so glass is right. */
export function Sheet({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  if (!open) return null;
  return (
    <Overlay>
    <div className="fixed inset-0 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="tn-scrim absolute inset-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="tn-sheet-surface tn-sheet-in relative mx-2 mb-2 overflow-hidden rounded-[32px]"
        style={{
          border: '0.5px solid var(--btn-border)',
          boxShadow: '0 -8px 40px rgba(0,0,0,.35)',
        }}
      >
        <div className="relative flex flex-col items-center px-6 pb-10 pt-2.5">
          <div className="h-[5px] w-[38px] rounded-full bg-[var(--ter)]" aria-hidden />
          {children}
        </div>
      </div>
    </div>
    </Overlay>
  );
}
