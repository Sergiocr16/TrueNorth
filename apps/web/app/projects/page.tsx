'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HealthStatus, Project } from '@truenorth/core';
import { expectedProgressPct, shareHealthy, todayIso } from '@truenorth/core';
import { LargeTitle, ROUTES, Screen } from '../../components/shell';
import {
  Avatar,
  Card,
  ChipButton,
  EmptyState,
  GlanceTile,
  ListRow,
  ProgressBar,
  SectionLabel,
  SourceBadge,
  StatusPill,
} from '../../components/ui';
import { AddRow } from '../../components/form';
import { CheckIcon, ProjectIcon } from '../../components/icons';
import { HealthCompass } from '../../components/day-compass';
import { daysUntil, formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { makeProject, useRiskCount, useStore } from '../../lib/store';
import { ProjectEditor } from './editors';

type Filter = 'active' | 'attention' | 'orphan';

/** The order the open list reads in: what is late first, what is fine last. */
const GROUP_ORDER: Exclude<HealthStatus, 'done'>[] = ['late', 'at_risk', 'on_track'];

export default function ProjectsPage() {
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [draft, setDraft] = useState<Project | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  // Finished projects are history: out of the way until asked for.
  const [showDone, setShowDone] = useState(false);

  const { projects, tasks, users, today, company, currentUser } = store;
  const now = todayIso();

  const openCount = (project: Project) =>
    tasks.filter((task) => task.projectId === project.id && task.status !== 'done').length;

  // Within a group, the nearest deadline first; a late project's deadline is
  // in the past, so the longest overdue reads first.
  const byDeadline = (a: Project, b: Project) => a.targetDate.localeCompare(b.targetDate);

  const done = projects.filter((p) => p.status === 'done').sort(byDeadline).reverse();
  const active = projects.filter((p) => p.status !== 'done').sort(byDeadline);
  const attention = active.filter((p) => p.status === 'at_risk' || p.status === 'late');
  const orphans = active.filter((p) => p.objectiveIds.length === 0 && openCount(p) > 0);
  const openTotal = tasks.filter((task) => task.projectId && task.status !== 'done').length;

  const shown = filter === 'attention' ? attention : filter === 'orphan' ? orphans : active;
  // Grouped by health when reading everything; a filter is already one group.
  const groups =
    filter === 'active'
      ? GROUP_ORDER.map((status) => ({ status, rows: shown.filter((p) => p.status === status) }))
      : [{ status: null, rows: shown }];

  const renderCard = (project: Project) => {
    const expected = expectedProgressPct(project.startDate, project.targetDate, today);
    const open = openCount(project);
    const owner = users.find((u) => u.id === project.ownerUserId);
    const isOrphan = project.objectiveIds.length === 0;
    const left = daysUntil(project.targetDate, now);
    const behind = project.progressPct < expected - 1;
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
            <div className="tn-tabular mt-1.5 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-[var(--ink)]">{project.progressPct} %</span>
              <span style={{ color: behind ? 'var(--amber)' : 'var(--ter)' }}>
                {t.projects.expectedShort(expected)}
              </span>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--ter)]">
            {owner ? (
              <span className="flex items-center gap-1.5">
                <Avatar initials={owner.initials} size={20} />
                {owner.displayName.split(' ')[0]}
              </span>
            ) : (
              <span>{t.projects.unassigned}</span>
            )}
            <span className="tn-tabular">
              {open} {t.team.openTasks}
            </span>
            <span
              className="tn-tabular"
              style={left < 0 ? { color: 'var(--red)', fontWeight: 600 } : undefined}
            >
              {formatShortDate(project.targetDate, locale)} · {t.projects.daysLeft(left)}
            </span>
            {project.source === 'notion' ? (
              <SourceBadge
                source="notion"
                title={store.sources.find((s) => s.id === project.sourceId)?.title}
              />
            ) : null}
            {isOrphan ? (
              <span className="font-semibold text-[var(--amber)]">{t.projects.filterOrphan}</span>
            ) : null}
          </div>
        </Card>
      </Link>
    );
  };

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle
        title={t.projects.title}
        trailing={<HealthCompass ratio={shareHealthy(active)} label={t.common.health} />}
      />

      {/* Three numbers about the work in flight — finished projects are not
          news — then the list grouped by health, worst first. */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5">
        <GlanceTile value={active.length} label={t.projects.glanceActive} tone="neutral" />
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
              body={t.projects.emptyBody}
            />
          </Card>
        ) : (
          <>
            {active.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <ChipButton selected={filter === 'active'} onClick={() => setFilter('active')}>
                  {t.projects.filterActive} · {active.length}
                </ChipButton>
                <ChipButton
                  selected={filter === 'attention'}
                  onClick={() => setFilter('attention')}
                >
                  {t.projects.filterAttention} · {attention.length}
                </ChipButton>
                {orphans.length > 0 ? (
                  <ChipButton selected={filter === 'orphan'} onClick={() => setFilter('orphan')}>
                    {t.projects.filterOrphan} · {orphans.length}
                  </ChipButton>
                ) : null}
              </div>
            ) : null}

            {active.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<CheckIcon size={34} />}
                  title={t.projects.allDone}
                  body={t.projects.allDoneBody(done.length)}
                />
              </Card>
            ) : shown.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<CheckIcon size={34} />}
                  title={t.projects.nothingHere}
                  body={t.projects.nothingHereBody}
                />
              </Card>
            ) : (
              groups.map(({ status, rows }) =>
                rows.length === 0 ? null : (
                  <div key={status ?? 'flat'} className="mb-4">
                    {status ? (
                      <SectionLabel>
                        {t.status[status]} · {rows.length}
                      </SectionLabel>
                    ) : null}
                    <div className="flex flex-col gap-2.5">{rows.map(renderCard)}</div>
                  </div>
                ),
              )
            )}

            {done.length > 0 ? (
              <div className="mb-4">
                {showDone ? (
                  <>
                    <SectionLabel
                      action={
                        <button
                          type="button"
                          onClick={() => setShowDone(false)}
                          className="tn-press text-[13px] font-semibold text-[var(--accent)]"
                        >
                          {t.projects.hideDoneProjects}
                        </button>
                      }
                    >
                      {t.status.done} · {done.length}
                    </SectionLabel>
                    <Card className="overflow-hidden">
                      {done.map((project, index) => (
                        <ListRow
                          key={project.id}
                          href={`${ROUTES.projects}/${project.id}`}
                          title={project.name}
                          subtitle={
                            <span className="tn-tabular">
                              {formatShortDate(project.targetDate, locale)}
                              {project.source === 'notion' ? (
                                <>
                                  {' · '}
                                  {store.sources.find((s) => s.id === project.sourceId)?.title}
                                </>
                              ) : null}
                            </span>
                          }
                          leading={
                            <span className="text-[var(--green)]">
                              <CheckIcon size={18} />
                            </span>
                          }
                          chevron
                          isLast={index === done.length - 1}
                        />
                      ))}
                    </Card>
                  </>
                ) : (
                  <Card className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowDone(true)}
                      className="tn-press flex min-h-[48px] w-full items-center px-4 text-[15px] font-semibold text-[var(--accent)]"
                    >
                      {t.projects.showDoneProjects(done.length)}
                    </button>
                  </Card>
                )}
              </div>
            ) : null}
          </>
        )}

        <Card className="mt-2.5 overflow-hidden">
          <AddRow label={t.projects.add} onClick={() => setDraft(makeProject(company.id, currentUser.id))} />
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
