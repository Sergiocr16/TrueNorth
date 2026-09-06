import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { GithubClient, GithubError } from '../../../../server/github/client';
import type { GithubRepoChoice } from '../../../../server/github/types';

/** Every repository the token can see, for the picker on the Integrations screen. Admins only. */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }
  let body: { companyId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const caller = await authorizeCaller(request, body.companyId ?? null, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  try {
    const repos = await new GithubClient().repos();
    const choices: GithubRepoChoice[] = repos.map((r) => ({
      repoId: r.id,
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
      pushedAt: r.pushed_at,
      archived: Boolean(r.archived),
    }));
    return NextResponse.json({ repos: choices });
  } catch (cause) {
    const status = cause instanceof GithubError ? (cause.status === 0 ? 503 : 502) : 500;
    return NextResponse.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status });
  }
}
