import { NextResponse } from 'next/server';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { GithubClient, GithubError, githubConfigured } from '../../../../server/github/client';
import type { GithubStatus } from '../../../../server/github/types';

/** Whether the server has a working GitHub token, and whose it is. Admins only. */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }
  const companyId = new URL(request.url).searchParams.get('company');
  const caller = await authorizeCaller(request, companyId, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const configured = githubConfigured();
  if (!configured.ok) {
    const status: GithubStatus = { configured: false, login: null, error: configured.detail };
    return NextResponse.json(status);
  }
  try {
    const me = await new GithubClient().me();
    const status: GithubStatus = { configured: true, login: me.login };
    return NextResponse.json(status);
  } catch (cause) {
    const status: GithubStatus = {
      configured: true,
      login: null,
      error: cause instanceof GithubError ? cause.message : String(cause),
    };
    return NextResponse.json(status);
  }
}
