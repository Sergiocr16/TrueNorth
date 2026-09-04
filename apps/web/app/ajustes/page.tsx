'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { AccentPreference, Locale, ThemePreference } from '@truenorth/core';
import { ACCENTS } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Avatar, Card, SectionLabel } from '../../components/ui';
import { formatShortDate } from '../../lib/i18n/dictionary';
import {
  DestructiveRow,
  FieldGroup,
  SelectField,
  ToggleField,
  useConfirm,
} from '../../components/form';
import { Chevron } from '../../components/icons';
import { useAuth } from '../../lib/auth';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

/** Settings, which on a phone is also the "More" destination for the tab bar. */
export default function SettingsPage() {
  const router = useRouter();
  const auth = useAuth();
  const prefs = usePreferences();
  const { t, locale } = prefs;
  const store = useStore();
  const riskCount = useRiskCount();
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');
  const [confirming, arm, disarm] = useConfirm();

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t.settings.themeSystem },
    { value: 'light', label: t.settings.themeLight },
    { value: 'warm', label: t.settings.themeWarm },
    { value: 'dark', label: t.settings.themeDark },
    { value: 'midnight', label: t.settings.themeMidnight },
    { value: 'ambar', label: t.settings.themeAmber },
  ];

  const localeOptions: { value: Locale; label: string }[] = [
    { value: 'es', label: t.settings.spanish },
    { value: 'en', label: t.settings.english },
  ];

  const hours = Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: `${String(hour).padStart(2, '0')}:00`,
  }));

  // Destinations that do not have a slot in the five-item tab bar.
  const moreLinks = [
    { href: ROUTES.company, label: t.nav.company },
    { href: ROUTES.objectives, label: t.nav.objectives },
    { href: ROUTES.team, label: t.nav.team },
    { href: ROUTES.followUps, label: t.nav.followUps },
    { href: ROUTES.ask, label: t.nav.ask },
    { href: ROUTES.reports, label: t.nav.reports },
    { href: ROUTES.integrations, label: t.nav.integrations },
  ];

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.settings.title} />

      <div className="mx-4 mt-3 lg:hidden">
        <SectionLabel>{t.nav.more}</SectionLabel>
        <Card className="overflow-hidden">
          {moreLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={`tn-press flex min-h-[52px] items-center gap-3 px-4 py-3 ${
                index === moreLinks.length - 1 ? '' : 'tn-hairline'
              }`}
            >
              <span className="flex-1 text-[17px] text-[var(--ink)]">{link.label}</span>
              <span className="text-[var(--ter)]">
                <Chevron />
              </span>
            </Link>
          ))}
        </Card>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.settings.account}</SectionLabel>
        <Card className="flex items-center gap-3.5 p-4">
          <Avatar initials={store.currentUser.initials} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-[var(--ink)]">
              {store.currentUser.displayName}
            </div>
            <div className="truncate text-[15px] text-[var(--sec)]">
              {store.currentUser.email}
            </div>
          </div>
          <span className="text-[13px] text-[var(--ter)]">
            {store.currentMembership.roleTitle}
          </span>
        </Card>
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.settings.engine}</SectionLabel>
        <EngineCard />
      </div>

      <FieldGroup header={t.settings.language}>
        <SelectField
          label={t.settings.language}
          value={locale}
          options={localeOptions}
          onChange={prefs.setLocale}
          isLast
        />
      </FieldGroup>

      <FieldGroup header={t.settings.notifications}>
        <ToggleField
          label={t.settings.pushEnabled}
          description={
            pushState === 'denied'
              ? t.settings.pushDenied
              : pushState === 'unsupported'
                ? t.settings.pushUnsupported
                : t.settings.pushHint
          }
          value={store.pushEnabled}
          onChange={(on) => {
            setPushState('busy');
            void (on ? store.enablePush() : store.disablePush().then(() => 'off' as const)).then(
              (result) => setPushState(result === 'denied' || result === 'unsupported' ? result : 'idle'),
            );
          }}
        />
        <SelectField
          label={t.settings.deliveryTime}
          value={String(store.notifyHour)}
          options={hours}
          onChange={(value) => store.setNotifyHour(Number(value))}
          isLast
        />
      </FieldGroup>

      <FieldGroup header={t.settings.theme}>
        <SelectField
          label={t.settings.theme}
          value={prefs.theme}
          options={themeOptions}
          onChange={prefs.setTheme}
        />
        <AccentField value={prefs.accent} onChange={prefs.setAccent} />
        <ToggleField
          label={t.settings.reduceTransparency}
          description={t.settings.reduceTransparencyHint}
          value={prefs.reduceTransparency}
          onChange={prefs.setReduceTransparency}
          isLast
        />
      </FieldGroup>

      <div className="mt-6">
        <div className="tn-card mx-4 overflow-hidden">
          <DestructiveRow
            label={
              confirming
                ? locale === 'es'
                  ? 'Tocá otra vez para restablecer'
                  : 'Tap again to reset'
                : locale === 'es'
                  ? 'Restablecer datos de ejemplo'
                  : 'Reset sample data'
            }
            onClick={() => {
              if (confirming) {
                disarm();
                void store.resetToSeed();
              } else {
                arm();
              }
            }}
          />
        </div>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
          {locale === 'es'
            ? 'Borra objetivos, proyectos, tareas y riesgos, y vuelve a cargar los datos iniciales.'
            : 'Deletes objectives, projects, tasks and risks, then loads the starting data again.'}
        </p>
      </div>

      <div className="mx-4 mt-4 mb-2">
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => {
              void auth.signOut().then(() => router.replace('/entrar'));
            }}
            className="tn-press flex min-h-[52px] w-full items-center justify-center px-4 text-[17px] font-semibold text-[var(--accent)]"
          >
            {t.settings.signOut}
          </button>
        </Card>
      </div>
    </Screen>
  );
}

/**
 * Whether the engine on the Pi is alive and what its last run did. Read from
 * the heartbeat document the engine writes after every run.
 */
function EngineCard() {
  const { t, locale } = usePreferences();
  const { engine } = useStore();

  if (!engine) {
    return (
      <Card className="p-4">
        <p className="text-[15px] leading-snug text-[var(--sec)]">{t.settings.engineNever}</p>
      </Card>
    );
  }

  const run = engine.lastRun;
  const failed = run ? !run.analysisOk || run.plansFailed > 0 : false;
  const heartbeat = engine.lastHeartbeatAt
    ? new Date(engine.lastHeartbeatAt).toLocaleString(locale === 'es' ? 'es-CR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[17px] font-semibold text-[var(--ink)]">{engine.hostname}</span>
        <span className="tn-tabular text-[13px] text-[var(--ter)]">v{engine.version}</span>
        {/* Not a health pill: the engine has no "in progress" state to show.
            The heartbeat is written after a run, so this can only ever say how
            the last one ended. */}
        <span
          className="ml-auto rounded-full px-2.5 py-1 text-[13px] font-semibold"
          style={
            failed
              ? { background: 'var(--red-bg)', color: 'var(--red)' }
              : { background: 'var(--green-bg)', color: 'var(--green)' }
          }
        >
          {failed ? t.settings.engineFailed : t.settings.engineOk}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        <dt className="text-[var(--sec)]">{t.settings.engineLastRun}</dt>
        <dd className="tn-tabular text-[var(--ink)]">
          {run ? formatShortDate(run.date, locale) : '—'}
          {heartbeat ? <span className="text-[var(--ter)]"> · {heartbeat}</span> : null}
        </dd>
        {run ? (
          <>
            <dt className="text-[var(--sec)]">{t.nav.today}</dt>
            <dd className="tn-tabular text-[var(--ink)]">{t.settings.enginePlans(run.plansOk, run.plansFailed)}</dd>
            {run.messages !== undefined ? (
              <>
                <dt className="text-[var(--sec)]">{t.team.followUp}</dt>
                <dd className="tn-tabular text-[var(--ink)]">
                  {t.settings.engineMessages(run.messages)}
                </dd>
              </>
            ) : null}
            <dt className="text-[var(--sec)]">{t.settings.engineCost}</dt>
            <dd className="tn-tabular text-[var(--ink)]">${run.costUsd.toFixed(2)}</dd>
          </>
        ) : null}
      </dl>
      {run?.error ? (
        <p className="mt-3 text-[13px] leading-snug text-[var(--sec)]">
          <strong className="font-semibold">{t.settings.engineFailed}:</strong> {run.error}
        </p>
      ) : null}
    </Card>
  );
}

/** Swatches show the real colour of each accent, not a name for it. */
const ACCENT_SWATCH: Record<AccentPreference, string> = {
  azul: '#2e47c9',
  violeta: '#6d3fd4',
  naranja: '#c2410c',
  rosa: '#be185d',
  grafito: '#3b4252',
};

function AccentField({
  value,
  onChange,
}: {
  value: AccentPreference;
  onChange: (accent: AccentPreference) => void;
}) {
  const { t } = usePreferences();
  return (
    <div className="tn-hairline flex min-h-[52px] items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-[17px] text-[var(--ink)]">{t.settings.accent}</span>
      <div className="flex items-center gap-2" role="radiogroup" aria-label={t.settings.accent}>
        {ACCENTS.map((accent) => {
          const selected = accent === value;
          return (
            <button
              key={accent}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.settings.accents[accent]}
              title={t.settings.accents[accent]}
              onClick={() => onChange(accent)}
              className="tn-press flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                boxShadow: selected ? `0 0 0 2px var(--surface), 0 0 0 4px ${ACCENT_SWATCH[accent]}` : 'none',
              }}
            >
              <span
                className="h-6 w-6 rounded-full"
                style={{ background: ACCENT_SWATCH[accent] }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
