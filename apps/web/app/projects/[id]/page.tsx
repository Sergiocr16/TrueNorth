'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Task, TaskStatus } from '@truenorth/core';
import { expectedProgressPct } from '@truenorth/core';
import { DetailHeader, ROUTES, Screen } from '../../../components/shell';
import {
  Banner,
  Card,
  ProgressBar,
  PullRequestLine,
  SectionLabel,
  SourceBadge,
  StatusPill,
  TaskLine,
  TextButton,
} from '../../../components/ui';
import { AddRow } from '../../../components/form';
import { Chevron, WarningTriangle } from '../../../components/icons';
import { formatShortDate } from '../../../lib/i18n/dictionary';
import { usePreferences } from '../../../lib/preferences';
import { makeTask, useRiskCount, useStore } from '../../../lib/store';
import { ProjectEditor, TaskEditor } from '../editors';

const GROUP_ORDER: TaskStatus[] = ['blocked', 'in_progress', 'todo', 'done'];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = usePreferences();
  const store = useStore();
  const riskCount = useRiskCount();
  const [editingProject, setEditingProject] = useState(false);
  const [taskDraft, setTaskDraft] = useState<Task | null>(null);
  const [isNewTask, setIsNewTask] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const project = store.projects.find((p) => p.id === params.id);

  if (!project) {
    return (
      <Screen riskCount={riskCount}>
        <DetailHeader title={t.projects.title} backHref={ROUTES.projects} />
        <Card className="mx-4 mt-4 p-4 text-[15px] text-[var(--sec)]">
          {locale === 'es' ? 'Este proyecto ya no existe.' : 'This project no longer exists.'}
        </Card>
      </Screen>
    );
  }

  const expected = expectedProgressPct(project.startDate, project.targetDate, store.today);
  const owner = store.users.find((u) => u.id === project.ownerUserId);
  const linkedObjectives = store.objectives.filter((o) => project.objectiveIds.includes(o.id));
  const projectTasks = store.tasks.filter((task) => task.projectId === project.id);
  const openPulls = store.pullRequests
    .filter((pr) => pr.projectId === project.id && pr.state === 'open')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const isOrphan = project.objectiveIds.length === 0;

  return (
    <Screen riskCount={riskCount}>
      <DetailHeader title={t.projects.title} backHref={ROUTES.projects} />

      <div className="mx-4 mt-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-[28px] font-bold leading-tight tracking-[-0.2px] text-[var(--ink)] text-pretty">
            {project.name}
          </h1>
          <div className="mt-1 shrink-0">
            <TextButton onClick={() => setEditingProject(true)}>{t.team.editRole}</TextButton>
          </div>
        </div>
        {project.description ? (
          <p
            className={`mt-1 text-[15px] leading-snug text-[var(--sec)] ${
              descriptionOpen ? '' : 'line-clamp-2'
            }`}
            onClick={() => setDescriptionOpen((open) => !open)}
          >
            {project.description}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={project.status} />
          <SourceBadge
            source={project.source}
            title={store.sources.find((s) => s.id === project.sourceId)?.title}
          />
          <span className="tn-tabular text-[13px] text-[var(--sec)]">
            {formatShortDate(project.targetDate, locale)}
          </span>
          {owner ? (
            <span className="text-[13px] text-[var(--ter)]">{owner.displayName}</span>
          ) : null}
        </div>
      </div>

      {isOrphan ? (
        <div className="mx-4 mt-3">
          <Banner tone="warning" icon={<WarningTriangle />}>
            <strong className="font-semibold">{t.projects.orphanWarning}.</strong>{' '}
            {t.projects.orphanBody}
          </Banner>
        </div>
      ) : null}

      <Card className="mx-4 mt-3 p-4">
        <ProgressBar
          value={project.progressPct}
          expected={expected}
          status={project.status}
          height={10}
        />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 text-[13px]">
          <span className="tn-tabular text-[var(--sec)]">
            {t.objectives.actual}{' '}
            <span className="font-semibold text-[var(--ink)]">{project.progressPct} %</span>
          </span>
          <span className="tn-tabular text-[var(--ter)]">
            {t.objectives.expected} {expected} %
          </span>
        </div>
      </Card>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.projects.servesObjectives}</SectionLabel>
        <Card className="overflow-hidden">
          {linkedObjectives.length === 0 ? (
            <p className="px-4 py-3.5 text-[15px] text-[var(--ter)]">
              {locale === 'es'
                ? 'Ninguno. Editá el proyecto para vincularlo.'
                : 'None. Edit the project to link one.'}
            </p>
          ) : (
            linkedObjectives.map((objective, index) => (
              <Link
                key={objective.id}
                href={`${ROUTES.objectives}/${objective.id}`}
                className="tn-press flex min-h-[52px] items-center gap-3 px-4 py-3"
                style={
                  index === linkedObjectives.length - 1
                    ? undefined
                    : { borderBottom: '0.5px solid var(--hair)' }
                }
              >
                <span className="min-w-0 flex-1 text-[17px] text-[var(--ink)]">
                  {objective.title}
                </span>
                <StatusPill status={objective.status} size="sm" />
                <span className="text-[var(--ter)]">
                  <Chevron />
                </span>
              </Link>
            ))
          )}
        </Card>
      </div>

      {openPulls.length > 0 ? (
        <div className="mx-4 mt-4">
          <SectionLabel>
            {t.projects.pullRequests} · {openPulls.length}
          </SectionLabel>
          <Card className="overflow-hidden">
            {openPulls.map((pr, index) => (
              <PullRequestLine key={pr.id} pr={pr} users={store.users} today={store.today} isLast={index === openPulls.length - 1} />
            ))}
          </Card>
        </div>
      ) : null}

      <div className="mx-4 mt-4">
        <SectionLabel>
          {t.projects.tasks} · {projectTasks.length}
        </SectionLabel>
        <Card className="overflow-hidden">
          {GROUP_ORDER.flatMap((group) => {
            const rows = projectTasks.filter((task) => task.status === group);
            if (rows.length === 0) return [];
            if (group === 'done' && !showDone) {
              return [
                <button
                  key="show-done"
                  type="button"
                  onClick={() => setShowDone(true)}
                  className="tn-press flex min-h-[48px] w-full items-center px-4 text-[15px] font-semibold text-[var(--accent)]"
                >
                  {t.projects.showDone(rows.length)}
                </button>,
              ];
            }
            return [
              <div
                key={`h-${group}`}
                className="bg-[var(--chip-bg)] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.6px] text-[var(--ter)]"
              >
                {t.taskStatus[group]}
              </div>,
              ...rows.map((task) => {
                const blockers = task.dependsOn
                  .map((id) => store.tasks.find((other) => other.id === id))
                  .filter((other): other is Task => Boolean(other) && other!.status !== 'done');
                return (
                  <div key={task.id}>
                    <TaskLine
                      task={task}
                      users={store.users}
                      today={store.today}
                      onOpen={() => {
                        setIsNewTask(false);
                        setTaskDraft(task);
                      }}
                    />
                    {blockers.length > 0 ? (
                      <div className="px-4 pb-2 text-[13px] text-[var(--amber)]">
                        {t.projects.blockedBy}: {blockers.map((b) => b.code).join(', ')}
                      </div>
                    ) : null}
                  </div>
                );
              }),
            ];
          })}
          <AddRow
            label={locale === 'es' ? 'Agregar tarea' : 'Add task'}
            onClick={() => {
              setIsNewTask(true);
              setTaskDraft(makeTask(store.company.id, project.id));
            }}
          />
        </Card>
      </div>

      {editingProject ? (
        <ProjectEditor
          project={project}
          onCancel={() => setEditingProject(false)}
          onSave={(next) => {
            store.upsertProject(next);
            setEditingProject(false);
          }}
          onDelete={() => {
            store.deleteProject(project.id);
            setEditingProject(false);
            router.push(ROUTES.projects);
          }}
        />
      ) : null}

      {taskDraft ? (
        <TaskEditor
          task={taskDraft}
          isNew={isNewTask}
          onCancel={() => setTaskDraft(null)}
          onSave={(task) => {
            store.upsertTask(task);
            setTaskDraft(null);
          }}
          onDelete={
            isNewTask
              ? undefined
              : () => {
                  store.deleteTask(taskDraft.id);
                  setTaskDraft(null);
                }
          }
        />
      ) : null}
    </Screen>
  );
}
