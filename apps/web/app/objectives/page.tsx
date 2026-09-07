'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Objective, Role } from '@truenorth/core';
import { expectedObjectivePct, objectiveGap, objectiveScope, shareHealthy } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import { Card, EmptyState, ProgressBar, SectionLabel, StatusPill, TextButton } from '../../components/ui';
import { AddRow } from '../../components/form';
import { ObjectiveIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { makeObjective, useRiskCount, useStore } from '../../lib/store';
import { ObjectiveEditor } from './editor';

/**
 * Objectives, grouped by whom they are for (ADR-013): the company's, then
 * the role on, both active; other roles' behind a tap, so a person can look
 * without being measured against them.
 */
export default function ObjectivesPage() {
  const { t } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [draft, setDraft] = useState<Objective | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const { objectives, activeObjectives, roles, company, currentUser, currentMembership, activeRole } = store;
  const general = objectives.filter((o) => objectiveScope(o) === 'general');
  const mine = objectives.filter((o) => objectiveScope(o) === 'role' && o.roleId === activeRole?.id);
  const roleName = (id: string | null | undefined) => roles.find((r: Role) => r.id === id)?.name ?? '—';
  const others = objectives
    .filter((o) => objectiveScope(o) === 'role' && o.roleId !== activeRole?.id)
    .sort((a, b) => roleName(a.roleId).localeCompare(roleName(b.roleId)) || a.title.localeCompare(b.title));
  // A member without a role on has nothing to create for; owner and admins always do.
  const canAdd = currentMembership.access !== 'member' || activeRole !== null;

  const section = (title: string, list: Objective[], withRole = false) =>
    list.length > 0 ? (
      <div className="mt-4">
        <SectionLabel>{title}</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {list.map((objective) => (
            <ObjectiveCard
              key={objective.id}
              objective={objective}
              roleLabel={withRole ? t.objectives.roleScope(roleName(objective.roleId)) : null}
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.objectives.title}
        trailing={<HealthCompass ratio={shareHealthy(activeObjectives)} label={t.common.health} />}
      />

      <div className="mx-4">
        {objectives.length === 0 ? (
          <Card className="mt-3">
            <EmptyState icon={<ObjectiveIcon size={34} />} title={t.objectives.title} body={t.today.emptyBody} />
          </Card>
        ) : activeObjectives.length === 0 ? (
          <Card className="mt-3 p-4 text-[15px] text-[var(--ter)]">{t.objectives.noneActive}</Card>
        ) : null}

        {section(t.objectives.general, general)}
        {section(activeRole ? t.objectives.roleScope(activeRole.name) : t.objectives.otherRoles, mine)}

        {others.length > 0 ? (
          <div className="mt-3">
            <TextButton onClick={() => setShowOthers((was) => !was)}>
              {showOthers ? t.objectives.hideOtherRoles : t.objectives.showOtherRoles(others.length)}
            </TextButton>
          </div>
        ) : null}
        {showOthers ? section(t.objectives.otherRoles, others, true) : null}

        {canAdd ? (
          <Card className="mt-2.5 overflow-hidden">
            <AddRow
              label={t.objectives.add}
              onClick={() => setDraft(makeObjective(company.id, currentUser.id, activeRole?.id ?? null))}
            />
          </Card>
        ) : null}
      </div>

      {draft ? (
        <ObjectiveEditor
          objective={draft}
          isNew
          onCancel={() => setDraft(null)}
          onSave={(objective) => {
            store.upsertObjective(objective);
            setDraft(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function ObjectiveCard({ objective, roleLabel }: { objective: Objective; roleLabel: string | null }) {
  const { t, locale } = usePreferences();
  const { users, today } = useStore();
  const expected = expectedObjectivePct(objective, today);
  const gap = objectiveGap(objective, today);
  const owner = users.find((u) => u.id === objective.ownerUserId);
  return (
    <Link href={`${ROUTES.objectives}/${objective.id}`}>
      <Card className="tn-press p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">{objective.title}</h2>
          <StatusPill status={objective.status} size="sm" />
        </div>

        <div className="mt-3">
          <ProgressBar value={objective.progressPct} expected={expected} status={objective.status} />
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[13px] text-[var(--sec)]">
            <span className="tn-tabular">
              {t.objectives.actual} {objective.progressPct} %
            </span>
            <span className="tn-tabular text-[var(--ter)]">
              {t.objectives.expected} {expected} %
            </span>
            {gap > 0 ? (
              <span className="tn-tabular font-semibold text-[var(--amber)]">{t.objectives.gap(gap)}</span>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--ter)]">
          {roleLabel ? <span className="font-semibold">{roleLabel}</span> : null}
          <span>
            {t.objectives.owner}: {owner?.displayName ?? '—'}
          </span>
          <span className="tn-tabular">{formatShortDate(objective.targetDate, locale)}</span>
        </div>
      </Card>
    </Link>
  );
}
