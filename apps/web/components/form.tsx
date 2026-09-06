'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../lib/preferences';
import { CheckIcon, CloseIcon } from './icons';
import { Overlay } from './overlay';

/**
 * Form controls in the grouped-inset style: the label sits on the left, the
 * value is right-aligned and editable in place. Every control is at least
 * 44 pt tall and keeps a visible focus ring.
 */

export function FieldGroup({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-5">
      {header ? (
        <div className="px-5 pb-1.5 text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
          {header}
        </div>
      ) : null}
      <div className="tn-card mx-4 overflow-hidden">{children}</div>
      {footer ? (
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{footer}</p>
      ) : null}
    </div>
  );
}

function rowClass(isLast: boolean): string {
  return `flex items-center gap-3 px-4 min-h-[52px] ${isLast ? '' : 'tn-hairline'}`;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  isLast = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLast?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal';
}) {
  const id = useId();
  return (
    <div className={rowClass(isLast)}>
      <label htmlFor={id} className="shrink-0 text-[17px] text-[var(--ink)]">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent py-2 text-right text-[17px] text-[var(--sec)] outline-none placeholder:text-[var(--ter)] focus:text-[var(--ink)]"
      />
    </div>
  );
}

/**
 * A text box that grows with what is typed, up to a cap, then scrolls
 * inside. Long prose — a role's responsibility, a day's notes — reads whole
 * instead of through a four-line slot, and a short one takes no more room
 * than it needs.
 */
const TEXTAREA_MAX_PX = 320;

function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_PX ? 'auto' : 'hidden';
  }, [value]);
  return ref;
}

/**
 * Optional notes on a row: closed, it is the row's title with an "add" link;
 * open, the title with a "remove" link and a filled text box under it, so a
 * long sentence wraps instead of being squeezed into one line. Without a
 * title it is only the link, for a row that already has one above it.
 */
export function NotesField({
  label,
  value,
  open,
  onChange,
  onOpen,
  onClear,
  addLabel,
  removeLabel,
  notesLabel,
  isLast = false,
}: {
  label?: string;
  value: string;
  open: boolean;
  onChange: (value: string) => void;
  onOpen: () => void;
  onClear: () => void;
  addLabel: string;
  removeLabel: string;
  /** Read to screen readers when there is no visible title. */
  notesLabel: string;
  isLast?: boolean;
}) {
  const id = useId();
  const ref = useAutoGrow(value);
  const link = 'tn-press min-h-11 text-[15px] font-semibold text-[var(--accent)]';
  if (!open) {
    return (
      <div
        className={`flex items-center gap-3 px-4 ${label ? 'min-h-[52px] justify-between' : '-mt-1 justify-end pb-1'} ${
          isLast ? '' : 'tn-hairline'
        }`}
      >
        {label ? <span className="text-[17px] text-[var(--ink)]">{label}</span> : null}
        <button type="button" onClick={onOpen} className={link}>
          {addLabel}
        </button>
      </div>
    );
  }
  return (
    <div className={`px-4 pb-3 ${label ? 'pt-3' : 'pt-0'} ${isLast ? '' : 'tn-hairline'}`}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={label ? 'text-[17px] text-[var(--ink)]' : 'text-[13px] font-semibold text-[var(--ter)]'}>
          {label || notesLabel}
        </label>
        <button type="button" onClick={onClear} className={link}>
          {removeLabel}
        </button>
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={2}
        autoFocus={value.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-none rounded-xl bg-[var(--chip-bg)] px-3 py-2 text-[17px] leading-snug text-[var(--ink)] outline-none"
      />
    </div>
  );
}

/** Multi-line field. The label sits above so long Spanish text has room. */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  isLast = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  isLast?: boolean;
}) {
  const id = useId();
  const ref = useAutoGrow(value);
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}>
      <label htmlFor={id} className="block text-[13px] font-semibold text-[var(--ter)]">
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full resize-none bg-transparent text-[17px] leading-snug text-[var(--ink)] outline-none placeholder:text-[var(--ter)]"
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  isLast = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  isLast?: boolean;
}) {
  const id = useId();
  return (
    <div className={rowClass(isLast)}>
      <label htmlFor={id} className="shrink-0 text-[17px] text-[var(--ink)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent py-2 text-right text-[17px] text-[var(--accent)] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  isLast = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  isLast?: boolean;
}) {
  const id = useId();
  return (
    <div className={rowClass(isLast)}>
      <label htmlFor={id} className="shrink-0 text-[17px] text-[var(--ink)]">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="tn-tabular min-w-0 flex-1 bg-transparent py-2 text-right text-[17px] text-[var(--accent)] outline-none"
      />
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  isLast = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  isLast?: boolean;
}) {
  const id = useId();
  return (
    <div className={rowClass(isLast)}>
      <label htmlFor={id} className="shrink-0 text-[17px] text-[var(--ink)]">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          onChange={(event) => onChange(Number(event.target.value))}
          className="tn-tabular w-24 bg-transparent py-2 text-right text-[17px] text-[var(--ink)] outline-none"
        />
        {suffix ? <span className="text-[15px] text-[var(--ter)]">{suffix}</span> : null}
      </div>
    </div>
  );
}

/** Percentage slider plus a live readout, for progress fields. */
export function PercentField({
  label,
  value,
  onChange,
  isLast = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  isLast?: boolean;
}) {
  const id = useId();
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[17px] text-[var(--ink)]">
          {label}
        </label>
        <span className="tn-tabular text-[17px] font-semibold text-[var(--ink)]">{value} %</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-11 w-full accent-[var(--accent)]"
      />
    </div>
  );
}

/** A value the sheet shows but does not edit — derived from other fields, with a line saying from what. */
export function StaticField({
  label,
  value,
  hint,
  isLast = false,
}: {
  label: string;
  value: string;
  hint?: string;
  isLast?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] text-[var(--ink)]">{label}</span>
        <span className="tn-tabular text-[17px] font-semibold text-[var(--ink)]">{value}</span>
      </div>
      {hint ? <p className="mt-1 text-[13px] leading-snug text-[var(--ter)]">{hint}</p> : null}
    </div>
  );
}

export function ToggleField({
  label,
  description,
  value,
  onChange,
  isLast = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${isLast ? '' : 'tn-hairline'} min-h-[52px]`}>
      <div className="min-w-0 flex-1">
        <div className="text-[17px] text-[var(--ink)]">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[13px] leading-snug text-[var(--ter)]">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className="tn-press relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors"
        style={{ background: value ? 'var(--accent)' : 'var(--chip-bg)' }}
      >
        <span
          className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all"
          style={{ left: value ? 22 : 2 }}
        />
      </button>
    </div>
  );
}

/** Multi-select shown as toggleable chips, e.g. objectives a project serves. */
export function ChipSelectField({
  label,
  options,
  selected,
  onChange,
  emptyHint,
  isLast = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  emptyHint?: string;
  isLast?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${isLast ? '' : 'tn-hairline'}`}>
      <div className="text-[13px] font-semibold text-[var(--ter)]">{label}</div>
      {options.length === 0 ? (
        <p className="mt-1.5 text-[15px] text-[var(--ter)]">{emptyHint}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => {
            const isOn = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isOn}
                onClick={() =>
                  onChange(
                    isOn
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value],
                  )
                }
                className="tn-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
                style={{
                  background: isOn ? 'var(--accent-bg)' : 'var(--chip-bg)',
                  color: isOn ? 'var(--accent)' : 'var(--sec)',
                }}
              >
                {isOn ? <CheckIcon size={12} /> : null}
                {option.label}
              </button>
            );
          })}
        </div>
      )}
      {emptyHint && options.length > 0 && selected.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--amber)]">{emptyHint}</p>
      ) : null}
    </div>
  );
}

export function DestructiveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tn-press flex min-h-[52px] w-full items-center justify-center px-4 text-[17px] font-semibold text-[var(--red)]"
    >
      {label}
    </button>
  );
}

/**
 * Full-height editing sheet with cancel and save in the bar, the way an iOS
 * modal form works. Focus moves into the sheet and Escape closes it.
 */
export function EditSheet({
  open,
  title,
  onCancel,
  onSave,
  saveLabel,
  cancelLabel,
  canSave = true,
  children,
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onSave?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  canSave?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Overlay>
    <div className="fixed inset-0 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t.common.close}
        onClick={onCancel}
        className="tn-scrim absolute inset-0"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tn-sheet-in relative mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-[var(--ground)] sm:mb-4 sm:rounded-[28px]"
        style={{ boxShadow: '0 -8px 40px rgba(0,0,0,.35)' }}
      >
        <div
          className="tn-glass flex items-center gap-3 rounded-t-[28px] px-4 py-3"
          style={{ borderBottom: '0.5px solid var(--hair)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="tn-press flex h-11 min-w-11 items-center text-[17px] text-[var(--accent)]"
          >
            {cancelLabel ?? t.team.cancel}
          </button>
          <h2
            id={titleId}
            className="flex-1 truncate text-center text-[17px] font-semibold text-[var(--ink)]"
          >
            {title}
          </h2>
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="tn-press flex h-11 min-w-11 items-center justify-end text-[17px] font-semibold text-[var(--accent)] disabled:opacity-40"
            >
              {saveLabel ?? t.team.save}
            </button>
          ) : (
            <span className="min-w-11" />
          )}
        </div>
        <div className="tn-scroll flex-1 pb-8">{children}</div>
      </div>
    </div>
    </Overlay>
  );
}

/** Inline "add" affordance that matches the list rows around it. */
export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tn-press flex min-h-[52px] w-full items-center gap-3 px-4 text-left"
    >
      <span
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[18px] font-semibold"
        style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        aria-hidden
      >
        +
      </span>
      <span className="text-[17px] font-semibold text-[var(--accent)]">{label}</span>
    </button>
  );
}

/** Small confirm-before-delete flow so a destructive tap is never one tap. */
export function useConfirm(): [boolean, () => void, () => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return [armed, () => setArmed(true), () => setArmed(false)];
}

export function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="tn-press flex h-9 w-9 items-center justify-center rounded-full bg-[var(--chip-bg)] text-[var(--sec)]"
    >
      <CloseIcon size={14} />
    </button>
  );
}
