'use client';

import { useEffect, useState } from 'react';
import type { GithubRepo } from '@truenorth/core';
import { DEFAULT_FINISHED_STATUSES, defaultApproverRoleIds } from '@truenorth/core';
import type { GithubRepoChoice, GithubStatus } from '../server/github/types';
import { Banner, Card, EmptyState, SectionLabel, Skeleton, TextButton } from './ui';
import {
  AddRow,
  ChipSelectField,
  DestructiveRow,
  EditSheet,
  FieldGroup,
  SelectField,
  TextField,
  useConfirm,
} from './form';
import { CheckIcon, GithubMark } from './icons';
import { usePreferences } from '../lib/preferences';
import { newId, useStore } from '../lib/store';

/**
 * The GitHub connection on the Integrations screen: whose token the server
 * holds, which repositories the company reads, and who approves. Registering
 * a repository is picking it from the list; which project it belongs to and
 * which roles read it come after, like a Notion database (ADR-010).
 */
export function GithubSection({
  isAdmin,
  when,
}: {
  isAdmin: boolean;
  when: (iso: string | null | undefined) => string;
}) {
  const { t } = usePreferences();
  const store = useStore();
  const { repos, roles, projects, github } = store;
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GithubRepo | null>(null);
  const [settings, setSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    store
      .githubStatus()
      .then((found) => {
        if (live) setStatus(found);
      })
      .catch((cause: unknown) => {
        if (live) setStatus({ configured: false, login: null, error: cause instanceof Error ? cause.message : String(cause) });
      });
    return () => {
      live = false;
    };
    // Once per visit: the token does not change while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const connected = Boolean(status?.login) || Boolean(github?.login);
  const login = status?.login ?? github?.login ?? null;
  const firstError = repos.find((r) => r.lastSyncError)?.lastSyncError ?? github?.lastError ?? null;

  const sync = () => {
    setSyncing(true);
    setNote(null);
    store
      .syncGithubNow()
      .then((reports) => {
        const failed = reports.find((r) => r.error);
        const pulls = reports.reduce((sum, r) => sum + r.pulls, 0);
        setNote(
          failed
            ? { tone: 'error', text: `${t.github.syncFailed}: ${failed.error}` }
            : { tone: 'info', text: t.github.syncDone(pulls) },
        );
      })
      .catch((cause: unknown) =>
        setNote({ tone: 'error', text: `${t.github.syncFailed}: ${cause instanceof Error ? cause.message : String(cause)}` }),
      )
      .finally(() => setSyncing(false));
  };

  return (
    <>
      <div className="mx-4 mt-6">
        <Card className="p-4">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 shrink-0 text-[var(--ink)]">
              <GithubMark size={30} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold text-[var(--ink)]">{t.github.title}</div>
              <div className="text-[15px] text-[var(--sec)]">
                {login ? t.github.as(login) : isAdmin && !status ? t.github.checking : store.company.name}
              </div>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
              style={{
                background: connected ? 'var(--green-bg)' : 'var(--chip-bg)',
                color: connected ? 'var(--green)' : 'var(--sec)',
              }}
            >
              {connected ? t.github.connected : t.github.notConnected}
            </span>
          </div>

          <div className="tn-tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--hair)] pt-3 text-[13px] text-[var(--ter)]">
            <span>
              {t.integrations.lastSync}: {when(github?.lastSyncAt)}
            </span>
            <span>{t.github.open(repos.reduce((sum, r) => sum + r.counts.open, 0))}</span>
            {isAdmin ? (
              <span className="ml-auto flex gap-3">
                <TextButton onClick={() => setSettings(true)}>{t.github.settings}</TextButton>
                {repos.length > 0 ? (
                  <TextButton onClick={syncing ? undefined : sync}>
                    {syncing ? t.integrations.syncing : t.integrations.syncNow}
                  </TextButton>
                ) : null}
              </span>
            ) : null}
          </div>
        </Card>
        {status && !status.configured ? (
          <div className="mt-3">
            <Banner tone="warning">{t.github.tokenMissing}</Banner>
          </div>
        ) : note ? (
          <div className="mt-3">
            <Banner tone={note.tone}>{note.text}</Banner>
          </div>
        ) : firstError ? (
          <div className="mt-3">
            <Banner tone="error">
              <strong className="font-semibold">{t.github.syncFailed}:</strong> {firstError}
            </Banner>
          </div>
        ) : null}
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.github.repos}</SectionLabel>
        {repos.length === 0 ? (
          <Card>
            <EmptyState icon={<GithubMark size={34} />} title={t.github.noRepos} body={t.github.noReposHint} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {repos.map((repo, index) => {
              const readers = roles.filter((r) => r.sourceIds.includes(repo.id)).length;
              const project = projects.find((p) => p.id === repo.projectId);
              const unmatched = repo.unmatchedLogins ?? [];
              const row = (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[17px] font-semibold text-[var(--ink)]">{repo.fullName}</span>
                    <span className="text-[13px] text-[var(--ter)]">
                      {project?.name ?? t.github.noProject} · {repo.baseBranch}
                    </span>
                  </div>
                  <div className="tn-tabular mt-0.5 flex flex-wrap gap-x-2.5 text-[13px] text-[var(--ter)]">
                    <span>{t.github.open(repo.counts.open)}</span>
                    <span>{t.github.awaiting(repo.counts.awaiting)}</span>
                    {repo.counts.changesRequested > 0 ? <span>{t.github.changes(repo.counts.changesRequested)}</span> : null}
                    <span>{readers > 0 ? t.integrations.roleCount(readers) : t.integrations.noRoles}</span>
                    <span>{when(repo.lastSyncAt)}</span>
                  </div>
                  {unmatched.length > 0 ? (
                    <div className="mt-1 text-[13px] leading-snug text-[var(--amber)]">
                      {t.github.unmatchedHint(unmatched.join(', '))}
                    </div>
                  ) : null}
                  {repo.lastSyncError ? (
                    <div className="mt-1 text-[13px] leading-snug text-[var(--red)]">{repo.lastSyncError}</div>
                  ) : null}
                </div>
              );
              const rowClass = `flex w-full items-start gap-3 px-4 py-3 text-left ${index === repos.length - 1 ? '' : 'tn-hairline'}`;
              return isAdmin ? (
                <button key={repo.id} type="button" onClick={() => setEditing(repo)} className={`tn-press ${rowClass}`}>
                  {row}
                </button>
              ) : (
                <div key={repo.id} className={rowClass}>
                  {row}
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {isAdmin ? (
        <div className="mx-4 mt-3">
          <Card className="overflow-hidden">
            <AddRow label={t.github.addRepos} onClick={() => setAdding(true)} />
          </Card>
        </div>
      ) : null}

      {adding ? <AddRepoSheet onClose={() => setAdding(false)} /> : null}
      {editing ? <RepoSheet repo={editing} onClose={() => setEditing(null)} /> : null}
      {settings ? <GithubSettingsSheet onClose={() => setSettings(false)} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Picking repositories                                                 */
/* ------------------------------------------------------------------ */

function AddRepoSheet({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences();
  const store = useStore();
  const [choices, setChoices] = useState<GithubRepoChoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => {
    let live = true;
    store
      .listGithubRepos()
      .then((found) => {
        if (live) setChoices(found.filter((r) => !r.archived));
      })
      .catch((cause: unknown) => {
        if (live) setFailed(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registered = new Set(store.repos.map((r) => r.repoId));
  const needle = search.trim().toLowerCase();
  const shown = (choices ?? []).filter((r) => !needle || r.fullName.toLowerCase().includes(needle));

  const add = () => {
    for (const choice of (choices ?? []).filter((r) => picked.includes(r.repoId))) {
      store.upsertRepo({
        id: newId('gh'),
        companyId: store.company.id,
        owner: choice.owner,
        name: choice.name,
        fullName: choice.fullName,
        repoId: choice.repoId,
        projectId: null,
        baseBranch: choice.defaultBranch,
        lastSyncAt: null,
        lastFullSyncAt: null,
        lastSyncError: null,
        counts: { open: 0, awaiting: 0, changesRequested: 0, approved: 0 },
        createdBy: store.currentUser.id,
        createdAt: new Date().toISOString(),
      });
    }
    onClose();
  };

  return (
    <EditSheet
      open
      title={t.github.pickRepos}
      onCancel={onClose}
      onSave={add}
      saveLabel={t.github.addSelected(picked.length)}
      canSave={picked.length > 0}
    >
      {failed ? (
        <div className="mx-4 mt-4">
          <Banner tone="error">{failed}</Banner>
        </div>
      ) : null}

      <FieldGroup footer={t.github.pickReposHint}>
        <TextField label={t.github.searchRepos} value={search} onChange={setSearch} placeholder="aditum" isLast />
      </FieldGroup>

      <div className="mt-4">
        <div className="tn-card mx-4 overflow-hidden">
          {loading ? (
            <div className="px-4 py-6">
              <Skeleton height={18} width="62%" />
              <div className="mt-3">
                <Skeleton height={18} width="48%" />
              </div>
            </div>
          ) : shown.length === 0 ? (
            <p className="px-4 py-5 text-[15px] leading-snug text-[var(--ter)]">{t.github.noMatches}</p>
          ) : (
            shown.map((choice, index) => {
              const already = registered.has(choice.repoId);
              const isOn = picked.includes(choice.repoId);
              return (
                <button
                  key={choice.repoId}
                  type="button"
                  disabled={already}
                  aria-pressed={isOn}
                  onClick={() =>
                    setPicked((current) =>
                      current.includes(choice.repoId)
                        ? current.filter((k) => k !== choice.repoId)
                        : [...current, choice.repoId],
                    )
                  }
                  className={`tn-press flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50 ${
                    index === shown.length - 1 ? '' : 'tn-hairline'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2"
                    style={{
                      borderColor: isOn ? 'var(--accent)' : 'var(--compass-ring)',
                      background: isOn ? 'var(--accent)' : 'transparent',
                      color: 'var(--on-accent)',
                    }}
                    aria-hidden
                  >
                    {isOn ? <CheckIcon size={13} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] text-[var(--ink)]">{choice.fullName}</span>
                    <span className="tn-tabular block text-[13px] text-[var(--ter)]">{choice.defaultBranch}</span>
                  </span>
                  {already ? (
                    <span className="shrink-0 text-[13px] text-[var(--ter)]">{t.github.alreadyAdded}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        {picked.length > 0 ? (
          <p className="px-5 pt-2 text-[13px] text-[var(--ter)]">{t.github.selectedCount(picked.length)}</p>
        ) : null}
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------------ */
/* One repository: its project and base branch                          */
/* ------------------------------------------------------------------ */

function RepoSheet({ repo, onClose }: { repo: GithubRepo; onClose: () => void }) {
  const { t } = usePreferences();
  const store = useStore();
  const [draft, setDraft] = useState<GithubRepo>(repo);
  const [armed, arm, disarm] = useConfirm();

  const projectOptions = [
    { value: '', label: t.github.noProject },
    ...store.projects
      .filter((p) => p.status !== 'done')
      .map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <EditSheet
      open
      title={repo.fullName}
      onCancel={onClose}
      onSave={() => {
        store.upsertRepo({ ...draft, baseBranch: draft.baseBranch.trim() || repo.baseBranch });
        onClose();
      }}
      canSave={draft.baseBranch.trim().length > 0}
    >
      <FieldGroup footer={t.github.noProjectHint}>
        <SelectField
          label={t.github.project}
          value={draft.projectId ?? ''}
          options={projectOptions}
          onChange={(projectId) => setDraft({ ...draft, projectId: projectId || null })}
          isLast
        />
      </FieldGroup>
      <FieldGroup footer={t.github.baseBranchHint}>
        <TextField
          label={t.github.baseBranch}
          value={draft.baseBranch}
          onChange={(baseBranch) => setDraft({ ...draft, baseBranch })}
          placeholder="development"
          isLast
        />
      </FieldGroup>

      <div className="mt-6">
        <div className="tn-card mx-4 overflow-hidden">
          <DestructiveRow
            label={armed ? t.github.removeRepoConfirm : t.github.removeRepo}
            onClick={() => {
              if (armed) {
                disarm();
                store.deleteRepo(repo.id);
                onClose();
              } else {
                arm();
              }
            }}
          />
        </div>
        <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">{t.github.removeRepoHint}</p>
      </div>
    </EditSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Who approves, and what "finished" means                              */
/* ------------------------------------------------------------------ */

function GithubSettingsSheet({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences();
  const store = useStore();
  const { roles, sources, github } = store;
  const [approverRoleIds, setApproverRoleIds] = useState<string[]>(
    github?.approverRoleIds ?? defaultApproverRoleIds(roles),
  );
  const [finishedStatuses, setFinishedStatuses] = useState<string[]>(
    github?.finishedStatuses ?? [...DEFAULT_FINISHED_STATUSES],
  );

  // Every status label the task sources know, plus whatever is already chosen.
  const statusOptions = [
    ...new Set([
      ...sources.filter((s) => s.kind === 'tasks').flatMap((s) => Object.keys(s.statusMap)),
      ...finishedStatuses,
    ]),
  ].map((label) => ({ value: label, label }));

  return (
    <EditSheet
      open
      title={t.github.settings}
      onCancel={onClose}
      onSave={() => {
        store.updateGithubIntegration({ approverRoleIds, finishedStatuses });
        onClose();
      }}
    >
      <FieldGroup footer={t.github.approversHint}>
        <ChipSelectField
          label={t.github.approvers}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          selected={approverRoleIds}
          onChange={setApproverRoleIds}
          isLast
        />
      </FieldGroup>
      <FieldGroup footer={t.github.finishedStatusesHint}>
        <ChipSelectField
          label={t.github.finishedStatuses}
          options={statusOptions}
          selected={finishedStatuses}
          onChange={setFinishedStatuses}
          isLast
        />
      </FieldGroup>
    </EditSheet>
  );
}
