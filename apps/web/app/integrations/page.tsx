'use client';

import { useState } from 'react';
import type { NotionSource } from '@truenorth/core';
import { LargeTitle, Screen } from '../../components/shell';
import { Banner, Card, EmptyState, SectionLabel, TextButton } from '../../components/ui';
import { AddRow } from '../../components/form';
import { NotionMark } from '../../components/icons';
import { AddSourceSheet, SourceSheet, StatusLegend } from '../../components/notion-source';
import { GithubSection } from '../../components/github-repo';
import { formatShortDate } from '../../lib/i18n/dictionary';
import { usePreferences } from '../../lib/preferences';
import { useRiskCount, useStore } from '../../lib/store';

/**
 * The Notion connection: which databases the company reads, how each is
 * mapped, and when they were last read. Registering one is three steps in
 * one sheet; assigning it to a role happens under Team, because who sees
 * what is a question about roles, not about databases.
 */
export default function IntegrationsPage() {
  const { t, locale } = usePreferences();
  const riskCount = useRiskCount();
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<NotionSource | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const isAdmin = store.currentMembership.access !== 'member';
  const { sources, roles } = store;
  const lastSync = sources
    .map((s) => s.lastSyncAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();
  const firstError = sources.find((s) => s.lastSyncError)?.lastSyncError ?? null;
  const connected = sources.length > 0 && sources.some((s) => s.lastSyncAt);

  const sync = () => {
    setSyncing(true);
    setSyncNote(null);
    store
      .syncNow()
      .then((reports) => {
        const failed = reports.find((r) => r.error);
        const pages = reports.reduce((sum, r) => sum + r.pages, 0);
        setSyncNote(
          failed
            ? { tone: 'error', text: `${t.integrations.syncFailed}: ${failed.error}` }
            : { tone: 'info', text: t.integrations.syncDone(pages) },
        );
      })
      .catch((cause: unknown) =>
        setSyncNote({
          tone: 'error',
          text: `${t.integrations.syncFailed}: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
      )
      .finally(() => setSyncing(false));
  };

  const when = (iso: string | null | undefined) =>
    iso
      ? `${formatShortDate(iso.slice(0, 10), locale)} ${new Date(iso).toLocaleTimeString(
          locale === 'es' ? 'es-CR' : 'en-US',
          { hour: '2-digit', minute: '2-digit', hour12: false },
        )}`
      : t.integrations.neverSynced;

  return (
    <Screen riskCount={riskCount}>
      <LargeTitle title={t.integrations.title} />

      <div className="mx-4 mt-3">
        <Card className="p-4">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 shrink-0 text-[var(--ink)]">
              <NotionMark size={30} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold text-[var(--ink)]">{t.integrations.notion}</div>
              <div className="text-[15px] text-[var(--sec)]">{store.company.name}</div>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
              style={{
                background: connected ? 'var(--green-bg)' : 'var(--chip-bg)',
                color: connected ? 'var(--green)' : 'var(--sec)',
              }}
            >
              {connected ? t.integrations.connected : t.integrations.notConnected}
            </span>
          </div>

          <div className="tn-tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--hair)] pt-3 text-[13px] text-[var(--ter)]">
            <span>
              {t.integrations.lastSync}: {when(lastSync)}
            </span>
            <span>
              {t.integrations.pages(sources.reduce((sum, s) => sum + s.counts.pages, 0))} ·{' '}
              {t.integrations.open(sources.reduce((sum, s) => sum + s.counts.open, 0))}
            </span>
            {isAdmin && sources.length > 0 ? (
              <span className="ml-auto">
                <TextButton onClick={syncing ? undefined : sync}>
                  {syncing ? t.integrations.syncing : t.integrations.syncNow}
                </TextButton>
              </span>
            ) : null}
          </div>
        </Card>
        {syncNote ? (
          <div className="mt-3">
            <Banner tone={syncNote.tone}>{syncNote.text}</Banner>
          </div>
        ) : firstError ? (
          <div className="mt-3">
            <Banner tone="error">
              <strong className="font-semibold">{t.integrations.syncFailed}:</strong> {firstError}
            </Banner>
          </div>
        ) : null}
      </div>

      <div className="mx-4 mt-4">
        <SectionLabel>{t.integrations.sources}</SectionLabel>
        {sources.length === 0 ? (
          <Card>
            <EmptyState
              icon={<NotionMark size={34} />}
              title={t.integrations.noSources}
              body={t.integrations.noSourcesHint}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {sources.map((source, index) => {
              const readers = roles.filter((r) => r.sourceIds.includes(source.id)).length;
              const row = (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[17px] font-semibold text-[var(--ink)]">{source.title}</span>
                    <span className="text-[13px] text-[var(--ter)]">
                      {source.kind === 'projects' ? t.integrations.kindProjects : t.integrations.kindTasks}
                    </span>
                  </div>
                  <div className="tn-tabular mt-0.5 flex flex-wrap gap-x-2.5 text-[13px] text-[var(--ter)]">
                    <span>{t.integrations.pages(source.counts.pages)}</span>
                    <span>{t.integrations.open(source.counts.open)}</span>
                    <span>{readers > 0 ? t.integrations.roleCount(readers) : t.integrations.noRoles}</span>
                    <span>{when(source.lastSyncAt)}</span>
                  </div>
                  {source.kind === 'tasks' ? (
                    <div className="mt-1.5">
                      <StatusLegend statusMap={source.statusMap} />
                    </div>
                  ) : null}
                  {source.lastSyncError ? (
                    <div className="mt-1 text-[13px] leading-snug text-[var(--red)]">
                      {source.lastSyncError}
                    </div>
                  ) : null}
                </div>
              );
              return isAdmin ? (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => setEditing(source)}
                  className={`tn-press flex w-full items-start gap-3 px-4 py-3 text-left ${
                    index === sources.length - 1 ? '' : 'tn-hairline'
                  }`}
                >
                  {row}
                </button>
              ) : (
                <div
                  key={source.id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    index === sources.length - 1 ? '' : 'tn-hairline'
                  }`}
                >
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
            <AddRow label={t.integrations.addSource} onClick={() => setAdding(true)} />
          </Card>
          <p className="px-5 pt-2 text-[13px] leading-snug text-[var(--ter)]">
            {t.integrations.pasteHint}
          </p>
        </div>
      ) : null}

      <GithubSection isAdmin={isAdmin} when={when} />

      {adding ? <AddSourceSheet onClose={() => setAdding(false)} /> : null}
      {editing ? <SourceSheet source={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}
