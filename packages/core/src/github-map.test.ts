import { describe, expect, it } from 'vitest';
import {
  defaultApproverRoleIds,
  githubDocId,
  isBot,
  pullToRecord,
  reviewStateFrom,
  taskCodeFrom,
  type GithubPull,
  type GithubReview,
} from './github-map';
import { githubLoginsOf, matchGithubUser } from './people';

const review = (login: string, state: GithubReview['state'], at: string, type = 'User'): GithubReview => ({
  id: Math.floor(Math.random() * 1e6),
  user: { login, type },
  state,
  submitted_at: at,
});

const pull = (overrides: Partial<GithubPull> = {}): GithubPull => ({
  id: 1,
  number: 42,
  title: 'TAR-966 | Portal de proveedores con link seguro',
  body: null,
  html_url: 'https://github.com/aditum/api/pull/42',
  state: 'open',
  draft: false,
  user: { login: 'jbelda', type: 'User' },
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-02T10:00:00Z',
  merged_at: null,
  closed_at: null,
  base: { ref: 'development' },
  head: { ref: 'feature/TAR-966', sha: 'abc' },
  requested_reviewers: [{ login: 'Sergiocr16', type: 'User' }],
  ...overrides,
});

describe('taskCodeFrom', () => {
  it('reads the branch first, then the title, then the body', () => {
    expect(taskCodeFrom('feature/TAR-966-cobros', 'TAR-12 | otra', null)).toBe('TAR-966');
    expect(taskCodeFrom('feature/portal', '[tar-12] portal', null)).toBe('TAR-12');
    expect(taskCodeFrom('main', 'Portal', 'Cierra TAR-7')).toBe('TAR-7');
    expect(taskCodeFrom('main', 'Portal', 'nada')).toBeNull();
  });
});

describe('reviewStateFrom', () => {
  it('lets a request for changes outweigh an approval, and the latest per reviewer count', () => {
    const verdict = reviewStateFrom(
      [
        review('ana', 'APPROVED', '2026-09-01T10:00:00Z'),
        review('ana', 'CHANGES_REQUESTED', '2026-09-02T10:00:00Z'),
        review('bob', 'APPROVED', '2026-09-03T10:00:00Z'),
      ],
      'jbelda',
    );
    expect(verdict).toEqual({ state: 'changes_requested', at: '2026-09-02T10:00:00Z', by: 'ana' });
  });

  it('keeps an approval standing after a plain comment, and clears it on dismissal', () => {
    const kept = reviewStateFrom(
      [review('ana', 'APPROVED', '2026-09-01T10:00:00Z'), review('ana', 'COMMENTED', '2026-09-02T10:00:00Z')],
      'jbelda',
    );
    expect(kept.state).toBe('approved');
    const cleared = reviewStateFrom(
      [review('ana', 'APPROVED', '2026-09-01T10:00:00Z'), review('ana', 'DISMISSED', '2026-09-02T10:00:00Z')],
      'jbelda',
    );
    expect(cleared.state).toBe('none');
  });

  it('ignores bots and the author, and reports comments as commented', () => {
    const verdict = reviewStateFrom(
      [
        review('copilot-pull-request-reviewer[bot]', 'COMMENTED', '2026-09-01T10:00:00Z'),
        review('jbelda', 'APPROVED', '2026-09-01T11:00:00Z'),
        review('ana', 'COMMENTED', '2026-09-02T10:00:00Z'),
      ],
      'jbelda',
    );
    expect(verdict).toEqual({ state: 'commented', at: '2026-09-02T10:00:00Z', by: 'ana' });
    expect(reviewStateFrom([], 'jbelda').state).toBe('none');
  });
});

describe('pullToRecord', () => {
  const ctx = {
    companyId: 'c1',
    tasksByCode: new Map([['TAR-966', { id: 't_966', projectId: 'p_portal' }]]),
    userIdByLogin: new Map([
      ['jbelda', 'u_juan'],
      ['sergiocr16', 'u_sergio'],
    ]),
    now: '2026-09-05T00:00:00Z',
  };
  const repo = { id: 'gh_1', projectId: 'p_repo' };

  it('links the task by code and takes its project over the repository’s', () => {
    const { record, unmatchedLogins } = pullToRecord(
      pull(),
      { reviews: [], headCommitAt: '2026-09-02T09:00:00Z', authorCommentAt: null },
      repo,
      ctx,
    );
    expect(record.id).toBe(githubDocId('gh_1', 42));
    expect(record.taskCode).toBe('TAR-966');
    expect(record.taskId).toBe('t_966');
    expect(record.projectId).toBe('p_portal');
    expect(record.authorUserId).toBe('u_juan');
    expect(record.reviewerUserIds).toEqual(['u_sergio']);
    expect(record.peopleUserIds).toEqual(['u_juan', 'u_sergio']);
    expect(record.state).toBe('open');
    expect(record.lastAuthorActivityAt).toBe('2026-09-02T09:00:00Z');
    expect(unmatchedLogins).toEqual([]);
  });

  it('falls back to the repository’s project, reports unknown logins, and reads merged', () => {
    const { record, unmatchedLogins } = pullToRecord(
      pull({
        title: 'chore | pipeline',
        head: { ref: 'chore/pipeline', sha: 'x' },
        user: { login: 'stranger', type: 'User' },
        state: 'closed',
        merged_at: '2026-09-03T00:00:00Z',
        requested_reviewers: [],
      }),
      { reviews: [], headCommitAt: null, authorCommentAt: null },
      repo,
      ctx,
    );
    expect(record.taskId).toBeNull();
    expect(record.projectId).toBe('p_repo');
    expect(record.authorUserId).toBeNull();
    expect(record.peopleUserIds).toEqual([]);
    expect(record.state).toBe('merged');
    expect(unmatchedLogins).toEqual(['stranger']);
  });

  it('takes the later of push and comment as the author’s last activity', () => {
    const { record } = pullToRecord(
      pull(),
      { reviews: [], headCommitAt: '2026-09-02T09:00:00Z', authorCommentAt: '2026-09-04T09:00:00Z' },
      repo,
      ctx,
    );
    expect(record.lastAuthorActivityAt).toBe('2026-09-04T09:00:00Z');
  });
});

describe('approvers and identities', () => {
  it('defaults the approvers to the role called CTO, whatever its case', () => {
    expect(defaultApproverRoleIds([{ id: 'a', name: 'CTO' }, { id: 'b', name: 'PM' }, { id: 'c', name: ' cto ' }])).toEqual(['a', 'c']);
    expect(defaultApproverRoleIds([{ id: 'b', name: 'PM' }])).toEqual([]);
  });

  it('knows a bot when it sees one', () => {
    expect(isBot({ login: 'copilot-pull-request-reviewer[bot]' })).toBe(true);
    expect(isBot({ login: 'jbelda', type: 'Bot' })).toBe(true);
    expect(isBot({ login: 'jbelda', type: 'User' })).toBe(false);
  });

  it('matches a GitHub user by any stored login, then by profile name, never by guessing', () => {
    const people = [
      { id: 'u_sergio', displayName: 'Sergio Castro', githubLogin: 'Sergiocr16', githubLogins: ['Sergiocr16', 'aditumcr'] },
      { id: 'u_juan', displayName: 'Juan Belda' },
      { id: 'u_juan2', displayName: 'Juan Solano' },
    ];
    expect(githubLoginsOf(people[0]!)).toEqual(['sergiocr16', 'aditumcr']);
    expect(matchGithubUser({ login: 'ADITUMCR' }, people)?.id).toBe('u_sergio');
    expect(matchGithubUser({ login: 'jbelda', name: 'Juan Belda' }, people)?.id).toBe('u_juan');
    expect(matchGithubUser({ login: 'jbelda', name: 'Juan' }, people)).toBeNull();
    expect(matchGithubUser({ login: 'jbelda' }, people)).toBeNull();
  });
});
