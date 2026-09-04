'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Project } from '@truenorth/core';
import { expectedProgressPct, shareHealthy, todayIso } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import {
  Avatar,
  Card,
  ChipButton,
  EmptyState,
  GlanceTile,
  ProgressBar,
  SourceBadge,
  StatusPill,
} from '../../components/ui';
import { AddRow } from '../../components/form';
import { ProjectIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
import { daysUntil, formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { makeProject, useRiskCount, useStore } from '../../lib/store';
import { ProjectEditor } from './editors';

export default function ProjectsPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [draft, setDraft] = useState<Project | null>(null);

  const [filter, setFilter] = useState<'all' | 'attention' | 'orphan'>('all');

  const { projects, tasks, users, today, company, currentUser } = store;
  const orphans = projects.filter(
    (project) =>
      project.objectiveIds.length === 0 &&
      tasks.some((task) => task.projectId === project.id && task.status !== 'done'),
  );
  const attention = projects.filter((p) => p.status === 'at_risk' || p.status === 'late');
  const openTotal = tasks.filter((task) => task.projectId && task.status !== 'done').length;
  const shown =
    filter === 'attention' ? attention : filter === 'orphan' ? orphans : projects;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.projects.title}
        trailing={<HealthCompass ratio={shareHealthy(projects)} label={t.common.health} />}
      />

      {/* The list is a place to scan, so it opens with three numbers and a
          filter, and each card carries one line of facts instead of a
          paragraph. The description waits on the project's own screen. */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <GlanceTile value={projects.length} label={t.projects.glanceProjects} tone="neutral" />
        <GlanceTile
          value={attention.length}
          label={t.projects.glanceAttention}
          tone={attention.length > 0 ? 'amber' : 'green'}
        />
        <GlanceTile value={openTotal} label={t.projects.glanceOpen} tone="accent" />
      </div>

      <div className="mx-4 mt-3">
        {projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ProjectIcon size={34} />}
              title={t.projects.title}
              body={
                locale === 'es'
                  ? 'Conectá Notion o creá un proyecto para empezar.'
                  : 'Connect Notion or create a project to get started.'
              }
            />
          </Card>
        ) : (
          <div className="mb-3 flex flex-wrap gap-2">
            <ChipButton selected={filter === 'all'} onClick={() => setFilter('all')}>
              {t.projects.filterAll}
            </ChipButton>
            <ChipButton selected={filter === 'attention'} onClick={() => setFilter('attention')}>
              {t.projects.filterAttention} · {attention.length}
            </ChipButton>
            {orphans.length > 0 ? (
              <ChipButton selected={filter === 'orphan'} onClick={() => setFilter('orphan')}>
                {t.projects.filterOrphan} · {orphans.length}
              </ChipButton>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {shown.map((project) => {
            const expected = expectedProgressPct(project.startDate, project.targetDate, today);
            const open = tasks.filter(
              (task) => task.projectId === project.id && task.status !== 'done',
            );
            const owner = users.find((u) => u.id === project.ownerUserId);
            const isOrphan = project.objectiveIds.length === 0;
            const left = daysUntil(project.targetDate, todayIso());
            return (
              <Link key={project.id} href={`${ROUTES.projects}/${project.id}`}>
                <Card className="tn-press p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">
                      {project.name}
                    </h2>
                    <StatusPill status={project.status} size="sm" />
                  </div>

                  <div className="mt-3">
                    <ProgressBar
                      value={project.progressPct}
                      expected={expected}
                      status={project.status}
                      height={6}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--ter)]">
                    {owner ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar initials={owner.initials} size={20} />
                        {owner.displayName.split(' ')[0]}
                      </span>
                    ) : null}
                    <span className="tn-tabular">
                      {open.length} {t.team.openTasks}
                    </span>
                    <span
                      className="tn-tabular"
                      style={left < 0 ? { color: 'var(--red)', fontWeight: 600 } : undefined}
                    >
                      {formatShortDate(project.targetDate, locale)} · {t.projects.daysLeft(left)}
                    </span>
                    {project.source === 'notion' ? <SourceBadge source="notion" /> : null}
                    {isOrphan ? (
                      <span className="font-semibold text-[var(--amber)]">
                        {t.projects.filterOrphan}
                      </span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        <Card className="mt-2.5 overflow-hidden">
          <AddRow
            label={locale === 'es' ? 'Agregar proyecto' : 'Add project'}
            onClick={() => setDraft(makeProject(company.id, currentUser.id))}
          />
        </Card>
      </div>

      {draft ? (
        <ProjectEditor
          project={draft}
          isNew
          onCancel={() => setDraft(null)}
          onSave={(project) => {
            store.upsertProject(project);
            setDraft(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
