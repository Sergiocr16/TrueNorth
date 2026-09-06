import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_FINISHED_STATUSES,
  defaultApproverRoleIds,
  githubLoginsOf,
  isBot,
  matchGithubUser,
  pullToRecord,
  type GithubPull,
  type GithubRepo,
  type GithubReview,
  type GithubSyncRun,
  type KnownPerson,
  type PullRequest,
  type Role,
} from '@truenorth/core';
import { adminDb } from '../admin';
import { Writer } from '../writer';
import { GithubClient, GithubError } from './client';
import type { GithubSyncReport } from './types';

/**
 * The GitHub sync: every registered repository, pull requests in, records out.
 *
 * Same shape as the Notion sync, and it runs after it on purpose: a pull
 * request is linked to a task by the code in its branch, and the task has to
 * be in Firestore first. Deterministic: what a pull request means — which
 * task, waiting on whom — is decided by pure functions in @truenorth/core.
 *
 * People are never created from here. GitHub knows logins; Notion knows the
 * team. A login is matched to a member by the login the member declared, or
 * by the profile's name, and is otherwise reported on the repository so an
 * admin can say who it is.
 */

/** Re-read everything at least this often. */
const FULL_SYNC_EVERY_DAYS = 7;
/** How far back a full read goes: older pull requests are history, not work. */
const HISTORY_DAYS = 90;
/** Closed pull requests older than this leave the collection. */
const RETENTION_DAYS = 90;
/** Overlap on the incremental window. */
const OVERLAP_MS = 10 * 60_000;

export interface GithubSyncOptions {
  full?: boolean;
  only?: string;
}

interface MemberRow {
  id: string;
  displayName: string;
  githubLogin?: string;
  githubLogins?: string[];
  hasAccount: boolean;
}

function isoNow(): string {
  return new Date().toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function loadRepos(companyId: string, only?: string): Promise<GithubRepo[]> {
  const snap = await adminDb().collection('companies').doc(companyId).collection('githubRepos').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GithubRepo).filter((r) => !only || r.id === only);
}

async function loadMembers(companyId: string): Promise<MemberRow[]> {
  const snap = await adminDb().collection('companies').doc(companyId).collection('members').get();
  return snap.docs.map((d) => {
    const m = d.data() as Partial<MemberRow>;
    return {
      id: d.id,
      displayName: m.displayName ?? '',
      githubLogin: m.githubLogin,
      githubLogins: Array.isArray(m.githubLogins) ? m.githubLogins : undefined,
      hasAccount: m.hasAccount !== false,
    };
  });
}

function peopleFrom(members: MemberRow[]): KnownPerson[] {
  return members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    githubLogin: m.githubLogin,
    githubLogins: m.githubLogins,
  }));
}

/** Tasks by code, open and closed: a merged pull request still names its task. */
async function loadTasksByCode(companyId: string): Promise<Map<string, { id: string; projectId: string | null }>> {
  const snap = await adminDb().collection('companies').doc(companyId).collection('tasks').get();
  const map = new Map<string, { id: string; projectId: string | null }>();
  for (const d of snap.docs) {
    const code = String(d.get('code') ?? '').trim().toUpperCase();
    if (code) map.set(code, { id: d.id, projectId: (d.get('projectId') as string | null) ?? null });
  }
  return map;
}

async function loadStored(companyId: string): Promise<Map<string, PullRequest>> {
  const snap = await adminDb().collection('companies').doc(companyId).collection('pullRequests').get();
  return new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as PullRequest]));
}

function countsOf(pulls: Iterable<PullRequest>): GithubRepo['counts'] {
  const counts = { open: 0, awaiting: 0, changesRequested: 0, approved: 0 };
  for (const pr of pulls) {
    if (pr.state !== 'open') continue;
    counts.open += 1;
    if (pr.reviewState === 'changes_requested') counts.changesRequested += 1;
    else if (pr.reviewState === 'approved') counts.approved += 1;
    else if (!pr.draft) counts.awaiting += 1;
  }
  return counts;
}

/** The run in progress per company: a second caller joins it instead of reading GitHub twice. */
const inFlight = new Map<string, Promise<GithubSyncReport[]>>();

/** The run in progress for a company, if any. */
export function githubSyncInFlight(companyId: string): Promise<GithubSyncReport[]> | null {
  return inFlight.get(companyId) ?? null;
}

/**
 * Runs the sync, or joins the run already going for the company — a full
 * read of a busy repository takes minutes, and the screen's button must not
 * start a second one. A joined run keeps its own options.
 */
export function syncGithub(companyId: string, options: GithubSyncOptions = {}): Promise<GithubSyncReport[]> {
  const current = inFlight.get(companyId);
  if (current) return current;
  const run = runSync(companyId, options).finally(() => inFlight.delete(companyId));
  inFlight.set(companyId, run);
  return run;
}

/**
 * The run itself. It marks the integration while it goes (`syncStartedAt`)
 * and leaves a summary when it ends (`lastRun`), because the screen watches
 * the document rather than the response.
 */
async function runSync(companyId: string, options: GithubSyncOptions): Promise<GithubSyncReport[]> {
  const repos = await loadRepos(companyId, options.only);
  if (repos.length === 0) return [];

  const base = adminDb().collection('companies').doc(companyId);
  const integration = base.collection('integrations').doc('github');
  const runStartedAt = isoNow();
  await integration.set({ syncStartedAt: runStartedAt }, { merge: true });

  try {
    return await readRepos(companyId, repos, options, runStartedAt);
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await integration
      .set(
        {
          syncStartedAt: null,
          lastError: error,
          lastRun: { startedAt: runStartedAt, finishedAt: isoNow(), pulls: 0, written: 0, error } satisfies GithubSyncRun,
        },
        { merge: true },
      )
      .catch(() => undefined);
    throw cause;
  }
}

async function readRepos(
  companyId: string,
  repos: GithubRepo[],
  options: GithubSyncOptions,
  runStartedAt: string,
): Promise<GithubSyncReport[]> {
  const base = adminDb().collection('companies').doc(companyId);
  let client: GithubClient;
  try {
    client = new GithubClient();
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    await base.collection('integrations').doc('github').set(
      {
        lastError: error,
        syncStartedAt: null,
        lastRun: { startedAt: runStartedAt, finishedAt: isoNow(), pulls: 0, written: 0, error } satisfies GithubSyncRun,
      },
      { merge: true },
    );
    return repos.map((r) => ({
      repoId: r.id,
      fullName: r.fullName,
      mode: 'skipped' as const,
      pulls: 0,
      written: 0,
      deleted: 0,
      unmatchedLogins: [],
      error,
      durationMs: 0,
    }));
  }

  const [members, tasksByCode, stored, rolesSnap] = await Promise.all([
    loadMembers(companyId),
    loadTasksByCode(companyId),
    loadStored(companyId),
    base.collection('roles').get(),
  ]);
  const people = peopleFrom(members);
  const userIdByLogin = new Map<string, string>();
  for (const person of people) for (const login of githubLoginsOf(person)) userIdByLogin.set(login, person.id);

  const writer = new Writer();
  const reports: GithubSyncReport[] = [];

  /**
   * A login nobody declared: ask GitHub for the profile name and try the team
   * by name. A hit is remembered on the member so the next run is exact.
   */
  const resolveLogin = async (login: string): Promise<void> => {
    const key = login.toLowerCase();
    if (userIdByLogin.has(key)) return;
    let name: string | null = null;
    try {
      name = (await client.user(login)).name;
    } catch {
      name = null;
    }
    const match = matchGithubUser({ login, name }, people);
    if (!match) return;
    userIdByLogin.set(key, match.id);
    const member = members.find((m) => m.id === match.id);
    await writer.update(base.collection('members').doc(match.id), {
      ...(member?.githubLogin ? {} : { githubLogin: login }),
      githubLogins: FieldValue.arrayUnion(login),
    });
    if (member) {
      member.githubLogin = member.githubLogin ?? login;
      member.githubLogins = [...(member.githubLogins ?? []), login];
    }
  };

  for (const repo of repos) {
    const started = Date.now();
    const startedIso = new Date(started).toISOString();
    const report: GithubSyncReport = {
      repoId: repo.id,
      fullName: repo.fullName,
      mode: 'incremental',
      pulls: 0,
      written: 0,
      deleted: 0,
      unmatchedLogins: [],
      durationMs: 0,
    };
    const repoRef = base.collection('githubRepos').doc(repo.id);
    const before = writer.written;
    const deletedBefore = writer.deleted;

    try {
      const lastFull = repo.lastFullSyncAt ? new Date(repo.lastFullSyncAt).getTime() : 0;
      const full = Boolean(options.full) || !repo.lastSyncAt || Date.now() - lastFull > FULL_SYNC_EVERY_DAYS * 86_400_000;
      report.mode = full ? 'full' : 'incremental';
      const since = full
        ? daysAgo(HISTORY_DAYS)
        : new Date(new Date(repo.lastSyncAt as string).getTime() - OVERLAP_MS).toISOString();

      const pulls = (await client.pulls(repo.owner, repo.name, since)).filter((p) => p.updated_at >= since);
      report.pulls = pulls.length;

      // Details only where they can have changed: an open pull request, or one
      // whose update time moved since we last saw it.
      const reviewsByNumber = new Map<number, GithubReview[]>();
      const details = new Map<number, { headCommitAt: string | null; authorCommentAt: string | null }>();
      for (const pull of pulls) {
        const known = stored.get(`gh_${repo.id}_${pull.number}`);
        const changed = !known || known.updatedAt !== pull.updated_at;
        if (pull.state !== 'open' && !changed) continue;
        reviewsByNumber.set(pull.number, await client.reviews(repo.owner, repo.name, pull.number));
        const headCommitAt =
          known && known.headRef === pull.head.ref && known.lastPushAt && !changed
            ? known.lastPushAt
            : await client.commitDate(repo.owner, repo.name, pull.head.sha);
        let authorCommentAt: string | null = null;
        if (pull.state === 'open' && !pull.draft) {
          const comments = await client.comments(repo.owner, repo.name, pull.number);
          authorCommentAt =
            comments
              .filter((c) => !isBot(c.user) && c.user.login.toLowerCase() === pull.user.login.toLowerCase())
              .map((c) => c.created_at)
              .sort()
              .pop() ?? null;
        }
        details.set(pull.number, { headCommitAt, authorCommentAt });
      }

      // Everybody these pull requests name, matched before mapping.
      const logins = new Set<string>();
      for (const pull of pulls) {
        if (!details.has(pull.number)) continue;
        if (!isBot(pull.user)) logins.add(pull.user.login);
        for (const u of pull.requested_reviewers ?? []) if (!isBot(u)) logins.add(u.login);
        for (const r of reviewsByNumber.get(pull.number) ?? []) if (!isBot(r.user)) logins.add(r.user.login);
      }
      for (const login of logins) await resolveLogin(login);

      const unmatched = new Set<string>();
      const now = isoNow();
      for (const pull of pulls) {
        const extra = details.get(pull.number);
        if (!extra) continue;
        const { record, unmatchedLogins } = pullToRecord(
          pull,
          { reviews: reviewsByNumber.get(pull.number) ?? [], ...extra },
          repo,
          { companyId, tasksByCode, userIdByLogin, now },
        );
        for (const login of unmatchedLogins) unmatched.add(login);
        const { id, ...rest } = record;
        await writer.set(base.collection('pullRequests').doc(id), rest);
        stored.set(id, record);
      }

      // Old closed pull requests leave; the engine only ever reads open ones
      // and the recently merged.
      const cutoff = daysAgo(RETENTION_DAYS);
      for (const pr of [...stored.values()]) {
        if (pr.repoId !== repo.id || pr.state === 'open') continue;
        const endedAt = pr.mergedAt ?? pr.closedAt ?? pr.updatedAt;
        if (endedAt < cutoff) {
          await writer.delete(base.collection('pullRequests').doc(pr.id));
          stored.delete(pr.id);
        }
      }

      report.unmatchedLogins = [...unmatched];
      await writer.set(repoRef, {
        ...(({ id: _id, ...rest }) => rest)(repo),
        lastSyncAt: startedIso,
        ...(full ? { lastFullSyncAt: startedIso } : {}),
        lastSyncError: null,
        counts: countsOf([...stored.values()].filter((pr) => pr.repoId === repo.id)),
        unmatchedLogins: [...unmatched],
      });
      await writer.flush();
      report.written = writer.written - before - 1;
      report.deleted = writer.deleted - deletedBefore;
    } catch (cause) {
      const message =
        cause instanceof GithubError
          ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
          : cause instanceof Error
            ? cause.message
            : String(cause);
      report.error = message;
      await writer.flush().catch(() => undefined);
      await repoRef.set({ lastSyncError: message }, { merge: true }).catch(() => undefined);
    }
    report.durationMs = Date.now() - started;
    reports.push(report);
  }

  // The connection document: created with the defaults the first time, then
  // only its clock and last error move — the approver roles and the finished
  // statuses are the admin's to edit on screen.
  const integration = base.collection('integrations').doc('github');
  const existing = await integration.get();
  let login: string | null = existing.get('login') ?? null;
  try {
    login = (await client.me()).login;
  } catch {
    /* the sync already reported what failed */
  }
  const roles = rolesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Role);
  const error = reports.find((r) => r.error)?.error ?? null;
  const lastRun: GithubSyncRun = {
    startedAt: runStartedAt,
    finishedAt: isoNow(),
    pulls: reports.reduce((sum, r) => sum + r.pulls, 0),
    written: reports.reduce((sum, r) => sum + r.written, 0),
    error,
  };
  await integration.set(
    {
      lastSyncAt: lastRun.finishedAt,
      lastError: error,
      login,
      syncStartedAt: null,
      lastRun,
      ...(existing.exists
        ? {}
        : { approverRoleIds: defaultApproverRoleIds(roles), finishedStatuses: [...DEFAULT_FINISHED_STATUSES] }),
    },
    { merge: true },
  );

  return reports;
}
