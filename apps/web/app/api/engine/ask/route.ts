import { NextResponse } from 'next/server';
import {
  askSchema,
  ensureGreeting,
  teamSignals,
  visibleProjects,
  visibleSignals,
  visibleTasks,
} from '@truenorth/core';
import { adminAuth, adminCredentials, adminDb } from '../../../../server/admin';
import { askClaude } from '../../../../server/engine/claude';
import { captureCompany, type Captured } from '../../../../server/engine/capture';
import type { AskAction, TeamFollowUp } from '@truenorth/core';
import { ASK_SYSTEM, askPrompt, type AskTurn, type FollowUpSubject } from '../../../../server/engine/prompts';

/**
 * "Preguntale": one question about today, answered from the same context the
 * morning run had. The caller is a signed-in person; what they can see is what
 * the answer may draw on — a private project they are not on stays out, and
 * the team view only exists for owners and admins.
 *
 * One model call per question. Nothing is stored: the conversation lives on
 * the phone for as long as the screen is open.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_HISTORY = 6;

export async function POST(request: Request) {
  const credentials = adminCredentials();
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.detail }, { status: 503 });
  }

  const idToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!idToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  let body: { companyId?: string; question?: string; history?: AskTurn[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const companyId = body.companyId;
  const question = body.question?.trim();
  if (!companyId || !question) {
    return NextResponse.json({ error: 'companyId and question required' }, { status: 400 });
  }

  const member = await adminDb()
    .collection('companies')
    .doc(companyId)
    .collection('members')
    .doc(uid)
    .get();
  if (!member.exists) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const captured = await captureCompany(companyId);
    const me = captured.members.find((m) => m.id === uid);
    if (!me) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const scoped: Captured = {
      ...captured,
      projects: visibleProjects(captured.projects, uid),
      tasks: visibleTasks(captured.tasks, captured.projects, uid),
    };
    const personal = visibleSignals(captured.signals, captured.projects, uid);

    // Managers ask about people; everybody else asks about their own work.
    const isManager = me.membership.access !== 'member';
    const byUser = isManager ? teamSignals(captured.signals, captured.projects, uid) : null;
    const team: FollowUpSubject[] | null = byUser
      ? captured.members.map((m) => ({
          member: m,
          signals: byUser.get(m.id) ?? [],
          situations: captured.situations.filter((s) => s.userId === m.id),
          recent: [],
        }))
      : null;
    const allowed = new Set([
      ...personal.map((s) => s.id),
      ...(team ?? []).flatMap((s) => s.signals.map((x) => x.id)),
    ]);

    const analysis = await adminDb()
      .collection('companies')
      .doc(companyId)
      .collection('analyses')
      .doc(captured.todayIso)
      .get();
    const briefing = analysis.exists ? String(analysis.data()?.briefing ?? '') : null;

    // Today's follow-up, so "ya le escribí a Marco" can name a real message.
    const followUpSnap = isManager
      ? await adminDb()
          .collection('companies')
          .doc(companyId)
          .collection('followups')
          .doc(`${captured.todayIso}_${uid}`)
          .get()
      : null;
    const todaysMessages = followUpSnap?.exists
      ? ((followUpSnap.data() as TeamFollowUp).messages ?? []).map((m) => ({
          id: m.id,
          userId: m.userId,
          ask: m.ask,
        }))
      : [];

    const history = (body.history ?? []).slice(-MAX_HISTORY);
    const answer = await askClaude(
      askPrompt(scoped, me, personal, team, briefing, history, question, todaysMessages),
      askSchema,
      {
        system: ASK_SYSTEM,
        // A question deserves an answer in seconds, not a minute; a smaller
        // model reads the same context and is plenty for one question.
        model: process.env.ASK_MODEL ?? 'claude-sonnet-5',
      },
    );

    const cited = answer.value.signalIds
      .filter((id) => allowed.has(id))
      .map((id) => captured.signals.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({ id: s.id, severity: s.severity, summary: s.summary }));

    // The proposal is checked here, not trusted: a person it names has to be
    // on the team, a message id has to be one of today's, and the things only
    // a manager may write stay with managers. Anything else becomes `none`.
    const proposed = answer.value.action;
    let action: (AskAction & { userName?: string }) | null = null;
    if (proposed && proposed.kind !== 'none') {
      const person = proposed.userId
        ? captured.members.find((m) => m.id === proposed.userId)
        : undefined;
      const managerOnly = proposed.kind !== 'message';
      const validMessage =
        proposed.kind !== 'mark_sent' || todaysMessages.some((m) => m.id === proposed.messageId);
      const needsText = proposed.kind !== 'mark_sent';
      if (person && (!managerOnly || isManager) && validMessage && (!needsText || proposed.text?.trim())) {
        action = {
          ...proposed,
          text:
            proposed.kind === 'message'
              ? ensureGreeting(proposed.text ?? '', person.displayName.split(' ')[0] ?? '')
              : (proposed.text ?? '').trim(),
          userName: person.displayName,
        };
      }
    }

    return NextResponse.json({
      answer: answer.value.answer,
      followUp: answer.value.followUp ?? null,
      signals: cited,
      action,
      // What the model actually proposed, before validation. Development only.
      proposed: process.env.NODE_ENV === 'production' ? undefined : proposed ?? null,
      usage: answer.usage,
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : String(cause) },
      { status: 502 },
    );
  }
}
