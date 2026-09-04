'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { HealthStatus, TaskStatus } from '@truenorth/core';
import { useT } from '../lib/preferences';
import { Chevron, CheckIcon, SmallTriangle, WarningTriangle } from './icons';
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

export function SourceBadge({ source }: { source: 'app' | 'notion' }) {
  const t = useT();
  return (
    <span className="inline-flex items-center rounded-md bg-[var(--chip-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--sec)]">
      {source === 'notion' ? t.common.notion : t.common.app}
    </span>
  );
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
