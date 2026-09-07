'use client';

import { useEffect, useRef, useState } from 'react';
import type { CitedSignal } from '@truenorth/core';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { makeReminder, makeSituation, type AskAnswer } from '../../lib/store';
import type { LeadMinutes } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Card, ChipButton } from '../../components/ui';
import { MicIcon, SendIcon } from '../../components/icons';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  signals?: CitedSignal[];
  followUp?: string | null;
  action?: AskAnswer['action'];
  pending?: boolean;
  failed?: boolean;
}

/**
 * "Preguntale": a conversation about today.
 *
 * Voice is an input method here, not a feature: the browser's own speech
 * recognition fills the box when it exists, the keyboard's microphone does the
 * same everywhere else, and the answer is the same either way. Nothing is
 * stored; the thread lives as long as the screen does.
 */
export default function AskPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const Ctor = speechRecognition();
    setCanListen(Boolean(Ctor));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const busy = turns.some((turn) => turn.pending);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = turns
      .filter((turn) => !turn.pending && !turn.failed)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    setDraft('');
    setTurns((current) => [
      ...current,
      { role: 'user', text: question },
      { role: 'assistant', text: '', pending: true },
    ]);
    try {
      const reply = await store.ask(question, history);
      setTurns((current) => [
        ...current.slice(0, -1),
        {
          role: 'assistant',
          text: reply.answer,
          signals: reply.signals,
          followUp: reply.followUp,
          action: reply.action,
        },
      ]);
    } catch (cause) {
      setTurns((current) => [
        ...current.slice(0, -1),
        {
          role: 'assistant',
          text: cause instanceof Error ? cause.message : String(cause),
          failed: true,
        },
      ]);
    }
  };

  const listen = () => {
    const Ctor = speechRecognition();
    if (!Ctor) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = locale === 'es' ? 'es-CR' : 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ');
      setDraft(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  };

  const starters = [t.ask.starter1, t.ask.starter2, t.ask.starter3];

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.ask.title} subtitle={store.company.name} />

      <div className="mx-4 mt-3 flex flex-col gap-2.5 pb-28">
        {turns.length === 0 ? (
          <Card className="p-4">
            <p className="text-[15px] leading-snug text-[var(--sec)]">{t.ask.hint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {starters.map((starter) => (
                <ChipButton key={starter} onClick={() => void send(starter)}>
                  {starter}
                </ChipButton>
              ))}
            </div>
          </Card>
        ) : null}

        {turns.map((turn, index) =>
          turn.role === 'user' ? (
            <div key={index} className="flex justify-end">
              <div
                className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-snug"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {turn.text}
              </div>
            </div>
          ) : (
            <Card key={index} className="max-w-[92%] p-4">
              {turn.pending ? (
                <p className="text-[15px] text-[var(--ter)]" aria-busy>
                  {t.ask.thinking}
                </p>
              ) : (
                <>
                  <p
                    className="text-[15px] leading-snug"
                    style={{ color: turn.failed ? 'var(--red)' : 'var(--ink)' }}
                  >
                    {turn.text}
                  </p>
                  {turn.signals && turn.signals.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {turn.signals.map((signal) => (
                        <li key={signal.id} className="text-[13px] leading-snug text-[var(--faint)]">
                          · {signal.summary[locale]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {turn.action ? <ActionCard action={turn.action} /> : null}
                  {turn.followUp ? (
                    <div className="mt-2">
                      <ChipButton onClick={() => void send(turn.followUp!)}>{turn.followUp}</ChipButton>
                    </div>
                  ) : null}
                </>
              )}
            </Card>
          ),
        )}
        <div ref={bottom} />
      </div>

      {/* The composer floats above the tab capsule. */}
      <form
        className="fixed inset-x-0 z-20 px-4 lg:left-[260px]"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 14px)', paddingBottom: 72 }}
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <div
          className="tn-glass mx-auto flex max-w-[720px] items-center gap-2 rounded-full p-1.5"
          style={{ border: '0.5px solid var(--fab-border)' }}
        >
          {canListen ? (
            <button
              type="button"
              onClick={listen}
              aria-label={listening ? t.ask.stopListening : t.ask.listen}
              aria-pressed={listening}
              className="tn-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{
                background: listening ? 'var(--red-bg)' : 'transparent',
                color: listening ? 'var(--red)' : 'var(--accent)',
              }}
            >
              <MicIcon size={20} />
            </button>
          ) : null}
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={listening ? t.ask.listening : t.ask.placeholder}
            aria-label={t.ask.placeholder}
            className="min-w-0 flex-1 bg-transparent px-2 text-[17px] text-[var(--ink)] outline-none placeholder:text-[var(--ter)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label={t.ask.send}
            className="tn-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <SendIcon size={20} />
          </button>
        </div>
      </form>
    </Screen>
  );
}

/**
 * A proposal, waiting for a tap.
 *
 * The assistant interpreted; this is where the app writes — and only here,
 * after the person confirms. A message is never sent from the app at all: it
 * is copied, and the person decides where it goes.
 */
function ActionCard({ action }: { action: NonNullable<AskAnswer['action']> }) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [state, setState] = useState<'open' | 'done' | 'dismissed' | 'copied'>('open');
  const name = action.userName ?? action.userId ?? '';

  const title = {
    situation: t.ask.actionSituation(name),
    message: t.ask.actionMessage(name),
    mark_sent: t.ask.actionMarkSent(name),
    expectation: t.ask.actionExpectation(name),
    reminder: t.ask.actionReminder,
    none: '',
  }[action.kind];

  const confirm = () => {
    if (!action.userId) return;
    if (action.kind === 'situation') {
      store.upsertSituation({
        ...makeSituation(store.company.id, action.userId, store.currentUser.id),
        note: action.text ?? '',
        kind: action.situationKind ?? 'otro',
        discreet: action.discreet ?? true,
        endsAt: action.endsAt ?? null,
      });
    } else if (action.kind === 'mark_sent' && action.messageId) {
      store.markFollowUp(action.messageId, 'sent');
    } else if (action.kind === 'expectation') {
      const current =
        store.memberships.find((m) => m.userId === action.userId)?.expectations?.trim() ?? '';
      store.updateMembership(action.userId, {
        expectations: current ? `${current}\n${action.text ?? ''}` : (action.text ?? ''),
      });
    } else if (action.kind === 'reminder' && action.date && action.time) {
      store.upsertReminder({
        ...makeReminder(),
        title: action.text ?? '',
        date: action.date,
        time: action.time,
        leadMinutes: (action.leadMinutes ?? 10) as LeadMinutes,
      });
    }
    setState('done');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(action.text ?? '');
    } catch {
      /* the text stays on screen to copy by hand */
    }
    setState('copied');
  };

  if (state === 'dismissed') return null;

  return (
    <div
      className="mt-3 rounded-2xl p-3.5"
      style={{ background: 'var(--accent-bg)', border: '0.5px solid var(--btn-border)' }}
    >
      <div className="text-[13px] font-semibold uppercase tracking-wide text-[var(--accent)]">{title}</div>
      {action.text ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-snug text-[var(--ink)]">{action.text}</p>
      ) : null}
      {action.kind === 'reminder' && action.date && action.time ? (
        <p className="tn-tabular mt-1 text-[13px] text-[var(--ter)]">
          {t.ask.reminderWhen(formatShortDate(action.date, locale), action.time, action.leadMinutes ?? 10)}
        </p>
      ) : null}
      {action.kind === 'situation' ? (
        <p className="mt-1 text-[13px] text-[var(--ter)]">
          {t.team.kind[action.situationKind ?? 'otro']}
          {action.endsAt ? ` · ${t.ask.until(formatShortDate(action.endsAt, locale))}` : ''}
          {action.discreet !== false ? ` · ${t.ask.discreetNote}` : ''}
        </p>
      ) : null}
      {action.summary && action.kind !== 'message' ? (
        <p className="mt-1 text-[13px] text-[var(--sec)]">{action.summary}</p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {state === 'done' || state === 'copied' ? (
          <ChipButton tone="positive" selected>
            {state === 'copied' ? t.ask.copied : t.ask.done}
          </ChipButton>
        ) : (
          <>
            {action.kind === 'message' ? (
              <ChipButton tone="positive" onClick={() => void copy()}>
                {t.ask.copy}
              </ChipButton>
            ) : (
              <ChipButton tone="positive" onClick={confirm}>
                {t.ask.confirm}
              </ChipButton>
            )}
            <ChipButton onClick={() => setState('dismissed')}>{t.ask.dismiss}</ChipButton>
          </>
        )}
      </div>
    </div>
  );
}

/* Web Speech API, where the browser has it. Typed by hand because the DOM
   lib does not ship it; the shape below is the subset this screen uses. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
