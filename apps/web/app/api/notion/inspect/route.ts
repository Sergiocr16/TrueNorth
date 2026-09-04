import { NextResponse } from 'next/server';
import type { NotionSourceKind } from '@truenorth/core';
import { adminCredentials, authorizeCaller } from '../../../../server/admin';
import { NotionError } from '../../../../server/notion/client';
import { inspectDatabase } from '../../../../server/notion/inspect';

/**
 * Reads a Notion database's schema and suggests a mapping, for the
 * Integrations screen. Admins only; nothing is written.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  let body: { companyId?: string; input?: string; dataSourceId?: string; kind?: NotionSourceKind };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const caller = await authorizeCaller(request, body.companyId ?? null, { admin: true });
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!body.input?.trim()) return NextResponse.json({ error: 'input required' }, { status: 400 });

  try {
    const result = await inspectDatabase(body.input, body.dataSourceId, body.kind);
    return NextResponse.json(result);
  } catch (cause) {
    if (cause instanceof NotionError) {
      const status = cause.status === 0 ? 503 : cause.status === 404 ? 404 : 502;
      return NextResponse.json({ error: cause.message, code: cause.code }, { status });
    }
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 500 },
    );
  }
}
