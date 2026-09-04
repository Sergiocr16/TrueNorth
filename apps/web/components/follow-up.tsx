'use client';

import { useState } from 'react';
import type { FollowUp } from '@truenorth/core';
import { notionUrl } from '@truenorth/core';
import { Banner, ChipButton } from './ui';
import { NotionMark } from './icons';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';

/* ------------------------------------------------------------------ */
/* The suggested message                                               */
/* ------------------------------------------------------------------ */

/**
 * Nothing leaves the app on its own: the text is copied, and the manager
 * decides where it goes. Editing before copying is not a nicety — what actually
 * gets sent is stored and fed back to tomorrow's run, so the engine learns the
 * register instead of repeating itself.
 */
export function FollowUpMessage({ message }: { message: FollowUp }) {
  const { t, locale } = usePreferences();
  const store = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);
  const [failed, setFailed] = useState(false);

  const outcome = store.followUp?.outcome?.[message.id];
  // Narrowed into a const so the closure below keeps the discriminant.
  const target = message.target;
  const task =
    target.kind === 'comentario'
      ? store.tasks.find((candidate) => candidate.id === target.taskId)
      : undefined;
  const notion = notionUrl(task?.notionPageId);

  const copy = async () => {
    const text = editing ? draft : message.message;
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
    } catch {
      // A browser that refuses the clipboard should not swallow the decision:
      // the message still counts as sent, and the text stays on screen to copy
      // by hand.
      setFailed(true);
    }
    store.markFollowUp(message.id, 'sent', text === message.message ? undefined : text);
    setEditing(false);
  };

  return (
    <div className="mt-3 border-t border-[var(--hair)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--ter)]">
          {t.team.followUp}
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
          style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          {t.team.tone[message.tone]}
        </span>
        <span className="text-[13px] text-[var(--ter)]">
          {task ? t.team.followUpComment(task.code || task.title) : t.team.followUpDirect}
        </span>
        {notion ? (
          <a
            href={notion}
            target="_blank"
            rel="noreferrer"
            aria-label={t.task.openInNotion}
            title={t.task.openInNotion}
            className="tn-press inline-flex h-6 w-6 items-center justify-center"
          >
            <NotionMark size={15} />
          </a>
        ) : null}
      </div>

      {message.escalate ? (
        <div className="mt-2">
          <Banner tone="warning">{t.team.followUpEscalate}</Banner>
        </div>
      ) : null}

      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={6}
          className="mt-2 w-full rounded-xl border border-[var(--hair)] bg-[var(--chip-bg)] p-3 text-[15px] leading-snug text-[var(--ink)] outline-none"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[var(--chip-bg)] p-3 text-[15px] leading-snug text-[var(--ink)]">
          {message.message}
        </p>
      )}

      <p className="mt-2 text-[13px] leading-snug text-[var(--ter)]">
        <span className="font-semibold">{t.team.followUpWhy}: </span>
        {message.why}
      </p>

      {message.signals.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {message.signals.map((signal) => (
            <li key={signal.id} className="text-[13px] leading-snug text-[var(--faint)]">
              · {signal.summary[locale]}
            </li>
          ))}
        </ul>
      ) : null}

      {failed ? (
        <p className="mt-2 text-[13px] text-[var(--red)]">
          {locale === 'es'
            ? 'El navegador no dejó copiar. Seleccioná el texto de arriba.'
            : 'The browser refused to copy. Select the text above.'}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <ChipButton tone="positive" selected={outcome === 'sent'} onClick={() => void copy()}>
          {outcome === 'sent' ? t.team.followUpSent : t.team.followUpCopy}
        </ChipButton>
        <ChipButton selected={editing} onClick={() => setEditing((was) => !was)}>
          {t.team.followUpEdit}
        </ChipButton>
        <ChipButton
          selected={outcome === 'dismissed'}
          onClick={() => store.markFollowUp(message.id, 'dismissed')}
        >
          {t.team.followUpDismiss}
        </ChipButton>
      </div>
    </div>
  );
}

