'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import type { Locale, ThemePreference } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Avatar, Card, SectionLabel } from '../../components/ui';
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
  const [notify, setNotify] = useState(true);
  const [confirming, arm, disarm] = useConfirm();

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t.settings.themeSystem },
    { value: 'light', label: t.settings.themeLight },
    { value: 'dark', label: t.settings.themeDark },
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
          value={notify}
          onChange={setNotify}
        />
        <SelectField
          label={t.settings.deliveryTime}
          value={String(store.currentUser.notifyHour)}
          options={hours}
          onChange={() => {
            /* Wired to the user document once Firebase Auth is in place. */
          }}
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
