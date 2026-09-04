'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Project } from '@truenorth/core';
import { expectedProgressPct } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import {
  Banner,
  Card,
  EmptyState,
  ProgressBar,
  SectionLabel,
  SourceBadge,
  StatusPill,
} from '../../components/ui';
import { AddRow } from '../../components/form';
import { ProjectIcon, WarningTriangle } from '../../components/icons';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { makeProject, useRiskCount, useStore } from '../../lib/store';
import { ProjectEditor } from './editors';

export default function ProjectsPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [draft, setDraft] = useState<Project | null>(null);

  const { projects, tasks, users, today, company, currentUser } = store;
  const orphans = projects.filter(
    (project) =>
      project.objectiveIds.length === 0 &&
      tasks.some((task) => task.projectId === project.id && task.status !== 'done'),
  );

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.projects.title} />

      {orphans.length > 0 ? (
        <div className="mx-4 mt-3">
          <Banner tone="warning" icon={<WarningTriangle />}>
            <strong className="font-semibold">
              {orphans.length === 1
                ? t.projects.orphanWarning
                : `${orphans.length} ${locale === 'es' ? 'proyectos sin objetivo' : 'projects without an objective'}`}
              .
            </strong>{' '}
            {t.projects.orphanBody}
          </Banner>
        </div>
      ) : null}

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
          <SectionLabel>{t.projects.title}</SectionLabel>
        )}

        <div className="flex flex-col gap-2.5">
          {projects.map((project) => {
            const expected = expectedProgressPct(project.startDate, project.targetDate, today);
            const openCount = tasks.filter(
              (task) => task.projectId === project.id && task.status !== 'done',
            ).length;
            const owner = users.find((u) => u.id === project.ownerUserId);
            const isOrphan = project.objectiveIds.length === 0;
            return (
              <Link key={project.id} href={`${ROUTES.projects}/${project.id}`}>
                <Card className="tn-press p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[17px] font-semibold leading-snug text-[var(--ink)]">
                        {project.name}
                      </h2>
                      {project.description ? (
                        <p className="mt-0.5 text-[15px] leading-snug text-[var(--sec)]">
                          {project.description}
                        </p>
                      ) : null}
                    </div>
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
                    <SourceBadge source={project.source} />
                    <span className="tn-tabular">
                      {project.progressPct} % · {formatShortDate(project.targetDate, locale)}
                    </span>
                    <span className="tn-tabular">
                      {openCount} {t.team.openTasks}
                    </span>
                    {owner ? <span>{owner.displayName}</span> : null}
                    {isOrphan ? (
                      <span className="font-semibold text-[var(--amber)]">
                        {t.projects.orphanWarning}
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
