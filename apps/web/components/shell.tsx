'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AuthGate } from './auth-gate';
import { SidebarCompanyButton, CompanySwitcher } from './company-switcher';
import { usePreferences } from '../lib/preferences';
import { useStore } from '../lib/store';
import {
  BriefingIcon,
  ChevronDown,
  ChevronLeft,
  CompanyIcon,
  CompassGlyph,
  IntegrationIcon,
  MoreIcon,
  ObjectiveIcon,
  ProjectIcon,
  ReportIcon,
  RiskIcon,
  SettingsIcon,
  TeamIcon,
} from './icons';

export const ROUTES = {
  today: '/hoy',
  briefing: '/briefing',
  company: '/empresa',
  objectives: '/objetivos',
  projects: '/proyectos',
  team: '/equipo',
  risks: '/riesgos',
  reports: '/reportes',
  integrations: '/integraciones',
  settings: '/ajustes',
} as const;

/* ------------------------------------------------------------------ */
/* Mobile tab bar — glass, five destinations, 44pt targets              */
/* ------------------------------------------------------------------ */

const TAB_ITEMS = [
  { href: ROUTES.today, key: 'today', Icon: CompassGlyph },
  { href: ROUTES.briefing, key: 'briefing', Icon: BriefingIcon },
  { href: ROUTES.projects, key: 'projects', Icon: ProjectIcon },
  { href: ROUTES.risks, key: 'risks', Icon: RiskIcon },
  { href: ROUTES.settings, key: 'more', Icon: MoreIcon },
] as const;

export function TabBar({ riskCount }: { riskCount?: number }) {
  const pathname = usePathname();
  const { t } = usePreferences();

  return (
    <nav
      className="tn-glass fixed inset-x-0 bottom-0 z-30 px-2.5 pb-[max(env(safe-area-inset-bottom),26px)] pt-2.5 lg:hidden"
      style={{ borderTop: '0.5px solid var(--hair)' }}
      aria-label={t.nav.today}
    >
      <div className="relative flex">
        {TAB_ITEMS.map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const label = t.nav[key as keyof typeof t.nav] as string;
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-11 flex-1 flex-col items-center gap-[3px] pt-0.5"
              style={{ color: active ? 'var(--accent)' : 'var(--ter)' }}
            >
              <span className="relative">
                <Icon size={24} />
                {key === 'risks' && riskCount ? (
                  <span
                    className="tn-tabular absolute -right-2.5 -top-1 rounded-full px-1.5 text-[10px] font-bold"
                    style={{ background: 'var(--red-bg)', color: 'var(--red)' }}
                  >
                    {riskCount}
                  </span>
                ) : null}
              </span>
              <span
                className="text-[10px]"
                style={{ fontWeight: active ? 600 : 500, color: active ? 'var(--accent)' : 'var(--faint)' }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop sidebar — glass panel, nine destinations                     */
/* ------------------------------------------------------------------ */

const SIDEBAR_ITEMS = [
  { href: ROUTES.today, key: 'today', Icon: CompassGlyph },
  { href: ROUTES.briefing, key: 'briefing', Icon: BriefingIcon },
  { href: ROUTES.company, key: 'company', Icon: CompanyIcon },
  { href: ROUTES.objectives, key: 'objectives', Icon: ObjectiveIcon },
  { href: ROUTES.projects, key: 'projects', Icon: ProjectIcon },
  { href: ROUTES.team, key: 'team', Icon: TeamIcon },
  { href: ROUTES.risks, key: 'risks', Icon: RiskIcon },
  { href: ROUTES.reports, key: 'reports', Icon: ReportIcon },
  { href: ROUTES.integrations, key: 'integrations', Icon: IntegrationIcon },
  { href: ROUTES.settings, key: 'settings', Icon: SettingsIcon },
] as const;

export function Sidebar({ riskCount }: { riskCount?: number }) {
  const pathname = usePathname();
  const { t } = usePreferences();
  const { currentUser: user, currentMembership: membership } = useStore();

  return (
    <aside className="relative hidden w-[248px] shrink-0 p-2.5 lg:block">
      <div
        className="tn-glass absolute inset-2.5 rounded-[18px]"
        style={{ border: '0.5px solid var(--btn-border)' }}
      />
      <div className="relative flex h-full flex-col px-2 py-3">
        <Link href={ROUTES.today} className="flex items-center gap-2.5 px-2.5">
          <span className="text-[var(--accent)]">
            <CompassGlyph size={24} />
          </span>
          <span className="text-[16px] font-bold tracking-[-0.2px] text-[var(--ink)]">
            {t.appName}
          </span>
        </Link>

        <SidebarCompanyButton />

        <div className="mt-3.5 flex flex-col gap-0.5">
          {SIDEBAR_ITEMS.map(({ href, key, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const label = t.nav[key as keyof typeof t.nav] as string;
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? 'page' : undefined}
                className="flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px]"
                style={{
                  background: active ? 'var(--accent-bg)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--sec)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Icon size={17} />
                <span className="flex-1">{label}</span>
                {key === 'risks' && riskCount ? (
                  <span
                    className="tn-tabular rounded-full px-1.5 text-[11px] font-bold"
                    style={{ background: 'var(--red-bg)', color: 'var(--red)' }}
                  >
                    {riskCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto flex items-center gap-2.5 px-2.5 pb-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--ink)] text-[12px] font-bold text-[var(--ground)]">
            {user.initials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[var(--ink)]">
              {user.displayName}
            </div>
            <div className="truncate text-[12px] text-[var(--ter)]">{membership.roleTitle}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Titles                                                              */
/* ------------------------------------------------------------------ */

/** iOS large title with an optional company switcher on the trailing side. */
export function LargeTitle({
  title,
  subtitle,
  trailing,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex items-start justify-between px-4 pt-1.5">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[13px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[34px] font-bold leading-[1.15] tracking-[0.2px] text-[var(--ink)]">
          {title}
        </h1>
        {subtitle ? <div className="text-[15px] text-[var(--sec)]">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="mt-2 shrink-0">{trailing}</div> : null}
    </div>
  );
}

export { CompanySwitcher };

/** Compact nav bar used on detail screens, with a back affordance. */
export function DetailHeader({ title, backHref }: { title: string; backHref: string }) {
  const { t } = usePreferences();
  return (
    <div className="flex items-center gap-2 px-2 pt-1.5">
      <Link
        href={backHref}
        aria-label={t.common.back}
        className="tn-press flex h-11 w-11 items-center justify-center rounded-full text-[var(--accent)]"
      >
        <ChevronLeft />
      </Link>
      <h1 className="truncate text-[20px] font-bold text-[var(--ink)]">{title}</h1>
    </div>
  );
}

/**
 * The screen frame. On phones this is a full-bleed column with the glass tab
 * bar pinned to the bottom; on desktop the sidebar appears and the content
 * column is capped so long text keeps a readable measure.
 */
export function Screen({
  children,
  riskCount,
  wide = false,
}: {
  children: ReactNode;
  riskCount?: number;
  wide?: boolean;
}) {
  return (
    <AuthGate>
    <div className="tn-ground relative flex min-h-dvh">
      <Sidebar riskCount={riskCount} />
      <main className="tn-scroll relative min-w-0 flex-1 pb-[104px] pt-[max(env(safe-area-inset-top),18px)] lg:pb-10 lg:pt-6">
        <div className={wide ? 'mx-auto w-full max-w-[1180px]' : 'mx-auto w-full max-w-[720px]'}>
          {children}
        </div>
      </main>
      <TabBar riskCount={riskCount} />
    </div>
    </AuthGate>
  );
}

