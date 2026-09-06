/**
 * Shapes shared between the GitHub routes and the browser. No server code
 * here: the store and the Integrations screen import these types.
 */

export interface GithubSyncReport {
  repoId: string;
  fullName: string;
  mode: 'incremental' | 'full' | 'skipped';
  pulls: number;
  written: number;
  deleted: number;
  unmatchedLogins: string[];
  error?: string;
  durationMs: number;
}

export interface GithubStatus {
  configured: boolean;
  /** The token's account, when the token works. */
  login: string | null;
  error?: string;
}

export interface GithubRepoChoice {
  repoId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  pushedAt: string | null;
  archived: boolean;
}
