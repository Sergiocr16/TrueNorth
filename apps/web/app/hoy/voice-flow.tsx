'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InterpretedChange, VoiceUpdate } from '@truenorth/core';
import { NOTION_TASK_STATUS } from '@truenorth/core';
import { fixtures } from '@truenorth/core';
import { Banner, Card, PrimaryButton, TextButton } from '../../components/ui';
import { CheckIcon, CloseIcon, WarningTriangle } from '../../components/icons';
import { usePreferences } from '../../lib/preferences';
import { newId, useStore } from '../../lib/store';

type Stage = 'recording' | 'processing' | 'review' | 'applied';

/**
 * Dictating a status update.
 *
 * The point of this flow is not a perfect transcript, which no recogniser can
 * promise. It is that every interpreted change is shown next to the exact words
 * that produced it, and nothing reaches Notion until the person confirms.
 */
export function VoiceFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePreferences();
  const store = useStore();
  const [stage, setStage] = useState<Stage>('recording');
  const [seconds, setSeconds] = useState(0);
  const [update, setUpdate] = useState<VoiceUpdate | null>(null);
  const [transcript, setTranscript] = useState('');
  const [discarded, setDiscarded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setStage('recording');
      setSeconds(0);
      setUpdate(null);
      setDiscarded(new Set());
      setEditing(null);
      return;
    }
    timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [open]);

  if (!open) return null;

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    setStage('processing');
    // In production the audio goes to Cloud Storage, Speech-to-Text transcribes
    // it with the company's phrase set, and the worker interprets it.
    window.setTimeout(() => {
      const sample = structuredClone(fixtures.sampleVoiceUpdate);
      sample.id = newId('v');
      setUpdate(sample);
      setTranscript(sample.transcript);
      setStage('review');
    }, 1500);
  };

  const apply = () => {
    if (!update) return;
    const accepted = update.changes.map((_, i) => i).filter((i) => !discarded.has(i));
    const stored: VoiceUpdate = { ...update, transcriptEdited: transcript };
    store.addVoiceUpdate(stored);
    store.applyVoiceUpdate(stored.id, accepted);
    setStage('applied');
  };

  const acceptedCount = update ? update.changes.length - discarded.size : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label={t.common.close}
        onClick={onClose}
        className="tn-scrim absolute inset-0"
      />

      {stage === 'recording' || stage === 'processing' ? (
        <div
          className="tn-sheet-surface tn-sheet-in relative mx-2 mb-2 overflow-hidden rounded-[32px] sm:mx-auto sm:w-full sm:max-w-[520px]"
          style={{ border: '0.5px solid var(--btn-border)', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' }}
          role="dialog"
          aria-modal="true"
          aria-label={stage === 'recording' ? t.voice.recording : t.voice.processing}
        >
          <div className="relative flex flex-col items-center px-6 pb-10 pt-2.5">
            <div className="h-[5px] w-[38px] rounded-full bg-[var(--ter)]" aria-hidden />

            {stage === 'recording' ? (
              <>
                <div className="mt-4 flex items-center gap-2 text-[17px] font-semibold text-[var(--ink)]">
                  <span className="tn-rec-dot h-[9px] w-[9px] rounded-full bg-[#E5544B]" />
                  {t.voice.recording}
                </div>
                <div className="tn-tabular mt-1.5 text-[34px] font-bold tracking-[0.5px] text-[var(--ink)]">
                  {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                </div>
                <Waveform seconds={seconds} />
                <p className="mt-2 max-w-[280px] text-center text-[15px] leading-snug text-[var(--sec)]">
                  {t.voice.prompt}
                </p>
                <div className="mt-5 flex items-center gap-11">
                  <button
                    type="button"
                    onClick={onClose}
                    className="tn-press flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-[var(--sec)]"
                      style={{
                        background: 'var(--chip-bg)',
                        border: '0.5px solid var(--btn-border)',
                      }}
                    >
                      <CloseIcon />
                    </span>
                    <span className="text-[12px] text-[var(--sec)]">{t.voice.cancel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stop}
                    className="tn-press flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-[var(--accent)]"
                      style={{ boxShadow: '0 4px 18px rgba(46,71,201,.35)' }}
                    >
                      <span className="h-[22px] w-[22px] rounded-md bg-[var(--on-accent)]" />
                    </span>
                    <span className="text-[12px] text-[var(--sec)]">{t.voice.stop}</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center py-8" aria-live="polite">
                <span className="tn-rec-dot h-3 w-3 rounded-full bg-[var(--accent)]" />
                <div className="mt-4 text-[17px] font-semibold text-[var(--ink)]">
                  {t.voice.processing}
                </div>
                <p className="mt-1.5 max-w-[260px] text-center text-[15px] text-[var(--sec)]">
                  {t.voice.processingHint}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {stage === 'review' && update ? (
        <div
          className="tn-sheet-in relative mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col rounded-t-[28px] bg-[var(--ground)] sm:mb-3 sm:rounded-[28px]"
          role="dialog"
          aria-modal="true"
          aria-label={t.voice.understood}
        >
          <div className="px-4 pb-2 pt-5">
            <h2 className="text-[28px] font-bold leading-tight tracking-[-0.2px] text-[var(--ink)]">
              {t.voice.understood}
            </h2>
            <p className="mt-1 text-[15px] text-[var(--sec)]">{t.voice.reviewHint}</p>
          </div>

          <div className="tn-scroll flex-1 px-4 pb-4">
            <Card className="p-3.5">
              <div className="text-[12px] font-bold uppercase tracking-[0.8px] text-[var(--ter)]">
                {t.voice.transcript}
              </div>
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                rows={3}
                aria-label={t.voice.transcript}
                className="mt-1.5 w-full resize-none bg-transparent text-[15px] leading-snug text-[var(--ink)] outline-none"
              />
            </Card>

            <div className="mt-3 flex flex-col gap-2.5">
              {update.changes.map((change, index) => (
                <ChangeCard
                  key={index}
                  change={change}
                  discarded={discarded.has(index)}
                  editing={editing === index}
                  onToggleEdit={() => setEditing(editing === index ? null : index)}
                  onChangeTo={(to) =>
                    setUpdate({
                      ...update,
                      changes: update.changes.map((c, i) => (i === index ? { ...c, to } : c)),
                    })
                  }
                  onDiscard={() => {
                    const next = new Set(discarded);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    setDiscarded(next);
                    setEditing(null);
                  }}
                />
              ))}
            </div>
          </div>

          <div
            className="tn-glass flex items-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3"
            style={{ borderTop: '0.5px solid var(--hair)' }}
          >
            <div className="shrink-0">
              <TextButton onClick={onClose}>{t.voice.cancel}</TextButton>
            </div>
            <div className="min-w-0 flex-1">
              <PrimaryButton onClick={apply}>
                {t.voice.confirmAll}
                {acceptedCount !== update.changes.length ? ` (${acceptedCount})` : ''}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {stage === 'applied' && update ? (
        <div
          className="tn-sheet-in relative mx-auto w-full max-w-[520px] rounded-t-[28px] bg-[var(--ground)] px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-6 sm:mb-3 sm:rounded-[28px]"
          role="dialog"
          aria-modal="true"
          aria-label={t.voice.applied}
        >
          <div className="flex flex-col items-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'var(--green-bg)', color: 'var(--green)' }}
            >
              <CheckIcon size={26} />
            </span>
            <h2 className="mt-3.5 text-[22px] font-bold text-[var(--ink)]">{t.voice.applied}</h2>
            <p className="mt-1.5 text-center text-[15px] text-[var(--sec)]">
              {t.voice.appliedHint}
            </p>
          </div>

          <Card className="mt-4 overflow-hidden">
            {update.changes.map((change, index) => (
              <div
                key={index}
                className={`flex items-center gap-2.5 px-4 py-2.5 ${
                  index === update.changes.length - 1 ? '' : 'tn-hairline'
                }`}
              >
                <span
                  className="shrink-0"
                  style={{ color: discarded.has(index) ? 'var(--ter)' : 'var(--green)' }}
                >
                  {discarded.has(index) ? <CloseIcon size={13} /> : <CheckIcon size={14} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]">
                  <span className="font-semibold">{change.taskCode}</span> · {change.to}
                </span>
                {discarded.has(index) ? (
                  <span className="shrink-0 text-[13px] text-[var(--ter)]">
                    {t.voice.discarded}
                  </span>
                ) : null}
              </div>
            ))}
          </Card>

          <div className="mt-5">
            <PrimaryButton onClick={onClose}>{t.common.close}</PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChangeCard({
  change,
  discarded,
  editing,
  onToggleEdit,
  onChangeTo,
  onDiscard,
}: {
  change: InterpretedChange;
  discarded: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onChangeTo: (to: string) => void;
  onDiscard: () => void;
}) {
  const { t } = usePreferences();
  const statusOptions = useMemo(() => Object.keys(NOTION_TASK_STATUS), []);

  return (
    <Card className="p-3.5" style={discarded ? { opacity: 0.5 } : undefined}>
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-bold text-[var(--accent)]">{change.taskCode}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--ink)]">
          {change.taskTitle}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[15px]">
        <span className="text-[13px] font-semibold text-[var(--ter)]">
          {t.voice.fields[change.field]}:
        </span>
        <span className="text-[var(--sec)] line-through">{change.from}</span>
        <span className="text-[var(--ter)]" aria-hidden>
          &rarr;
        </span>
        <span className="font-semibold text-[var(--ink)]">{change.to}</span>
      </div>

      <p className="mt-2 border-l-2 border-[var(--hair)] pl-2.5 text-[13px] italic leading-snug text-[var(--faint)]">
        &ldquo;{change.quote}&rdquo;
      </p>

      {change.conflict ? (
        <div className="mt-2.5">
          <Banner tone="warning" icon={<WarningTriangle />}>
            <strong className="font-semibold">{t.voice.conflict}</strong> {t.voice.conflictHint}
          </Banner>
        </div>
      ) : null}

      {editing && change.field === 'status' ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {statusOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChangeTo(option);
                onToggleEdit();
              }}
              className="tn-press rounded-full px-2.5 py-1 text-[13px] font-semibold"
              style={{
                background: option === change.to ? 'var(--accent-bg)' : 'var(--chip-bg)',
                color: option === change.to ? 'var(--accent)' : 'var(--sec)',
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {editing && change.field === 'dueDate' ? (
        <input
          type="date"
          value={change.to}
          onChange={(event) => onChangeTo(event.target.value)}
          aria-label={t.voice.fields.dueDate}
          className="tn-tabular mt-2.5 w-full rounded-xl bg-[var(--chip-bg)] px-3 py-2 text-[15px] text-[var(--ink)] outline-none"
        />
      ) : null}

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onToggleEdit}
          className="tn-press rounded-full bg-[var(--chip-bg)] px-3 py-1.5 text-[13px] font-semibold text-[var(--sec)]"
        >
          {t.voice.edit}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="tn-press rounded-full px-3 py-1.5 text-[13px] font-semibold"
          style={{
            background: discarded ? 'var(--accent-bg)' : 'var(--chip-bg)',
            color: discarded ? 'var(--accent)' : 'var(--sec)',
          }}
        >
          {discarded ? t.voice.discarded : t.voice.discard}
        </button>
      </div>
    </Card>
  );
}

/** Live-ish waveform. Deterministic per second so it never jitters randomly. */
function Waveform({ seconds }: { seconds: number }) {
  const bars = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const wave = Math.sin((i + seconds * 2) * 0.7) * 0.5 + 0.5;
      out.push(6 + Math.round(wave * 38));
    }
    return out;
  }, [seconds]);

  return (
    <div className="mt-4 flex h-11 items-center gap-[3px]" aria-hidden>
      {bars.map((height, index) => (
        <span
          key={index}
          className="w-[3px] rounded-sm"
          style={{
            height,
            background: height > 20 ? 'var(--accent)' : 'var(--accent-bg)',
            opacity: height > 20 ? 1 : 0.9,
          }}
        />
      ))}
    </div>
  );
}
