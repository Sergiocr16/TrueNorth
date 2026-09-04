'use client';

import { useEffect, useState } from 'react';
import { Card, PrimaryButton, SecondaryButton } from '../components/ui';
import { CompassMark, WarningTriangle } from '../components/icons';
import type { Locale } from '@truenorth/core';
import { getDictionary } from '../lib/i18n/dictionary';

/**
 * What a person sees when a screen throws while rendering.
 *
 * Without this file Next.js substitutes its own "This page couldn't load",
 * which names no cause: a company created empty crashed the company screen on
 * an unset date and the message said nothing about it, so the fault was looked
 * for in the rules and in Firestore before anyone looked at the stack. The
 * point of this screen is to show the cause on the device that hit it.
 *
 * It deliberately reads no context. `usePreferences()` throws outside its
 * provider, and a boundary that needs the thing that may have broken is no
 * boundary at all, so the locale comes off the <html lang> the theme bootstrap
 * in layout.tsx already stamps, and the strings come straight from the
 * dictionary. It also stays clear of `Screen`, which mounts AuthGate and the
 * store.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // `lang` is only readable in the browser, so the first paint uses Spanish and
  // the effect corrects it. Rendering the wrong language for one frame beats
  // the boundary itself throwing on `document`.
  const [locale, setLocale] = useState<Locale>('es');
  useEffect(() => {
    if (document.documentElement.lang === 'en') setLocale('en');
  }, []);

  useEffect(() => {
    console.error('TrueNorth render error:', error);
  }, [error]);

  const t = getDictionary(locale).error;

  return (
    <div className="tn-ground flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center text-center">
          <CompassMark size={56} />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.3px] text-[var(--ink)]">
            {t.title}
          </h1>
          <p className="mt-2 text-[17px] leading-snug text-[var(--sec)]">{t.body}</p>
        </div>

        <Card className="mt-6 p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
            <WarningTriangle />
            {t.cause}
          </div>
          <p className="mt-2 break-words font-mono text-[13px] leading-relaxed text-[var(--ink)]">
            {error.message || error.name}
          </p>
          {error.digest ? (
            <p className="mt-3 text-[13px] text-[var(--ter)]">
              {t.reference} <span className="tn-tabular">{error.digest}</span>
            </p>
          ) : null}
        </Card>

        <div className="mt-6 flex flex-col gap-3">
          <PrimaryButton onClick={reset}>{t.retry}</PrimaryButton>
          <SecondaryButton
            onClick={() => {
              window.location.href = '/today';
            }}
          >
            {t.goToday}
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
