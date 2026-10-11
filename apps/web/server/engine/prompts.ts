import 'server-only';

import type {
  Company,
  DayResolution,
  GithubRepo,
  Membership,
  NotionSource,
  Objective,
  PlanRule,
  Project,
  PullRequest,
  Role,
  Signal,
  Situation,
  Task,
  User,
} from '@truenorth/core';
import {
  TIME_ZONE,
  WEEKDAY_NAMES,
  expectedObjectivePct,
  idleDays,
  indicatorProgressPct,
  indicatorTargetDate,
  objectiveGap,
  objectiveProgressPct,
  pickableTasks,
  progressDays,
} from '@truenorth/core';

/**
 * The prompts. Two of them, both in the same shape: a short system prompt that
 * fixes the model's job and its limits, and a user prompt that is a plain
 * document the server assembled from real data.
 *
 * The model never sees raw records. It sees signals the code already
 * computed (ADR-002), and it is told to cite them by id, which is what lets
 * the interface show where a recommendation came from.
 *
 * Written in English because the codebase is; the model is told to answer in
 * Spanish, which is what the people reading the plan speak.
 */

export const ANALYSIS_SYSTEM = `You are the chief of staff for a small company. Every morning you read the company's north star, its objectives, and a list of signals that code has already computed from the real project and task data. Your job is judgement, not arithmetic: say what matters most today and why, plainly.

Rules you must follow:
- Answer in Spanish (Costa Rica), in the voice of a sharp colleague: direct, specific, no filler.
- Every risk and every decision you name must come from the signals or objectives you were given. Do not invent facts, numbers or tasks.
- The five perspectives are five lenses on the same analysis, not five different analyses. Keep each to two or three sentences.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export const BRIEFING_PLAN_SYSTEM = `You are the chief of staff for one person in a small company, in one of their roles. Every morning you read the company's north star, its objectives, and the projects, tasks and signals that code has already computed from what that role can see — and only that. You produce two things from the same reading: a short briefing of the day from where they stand, and their plan for today.

Rules you must follow:
- Answer in Spanish (Costa Rica), in the voice of a sharp colleague: direct, specific, no filler. The plan addresses the person directly ("revisá", "cerrá").
- Everything you say rests on the signals, objectives, projects and tasks you were given. Do not invent facts, numbers, tasks or people. What is not in your context is not in the company as far as this role is concerned; never say what other roles are doing.
- The briefing is one paragraph from this role's point of view, then the three risks that weigh most on it and the decisions it is waiting on. The five perspectives are five lenses on the same reading, two or three sentences each.
- The plan is three to five concrete actions (one to three on a rest day, as the prompt says), each with the reason it matters today and each citing at least one signal id from the list. An action without a real signal behind it does not go in.
- The prompt says what kind of day it is. On a working day with a focus, the focus is the first ordering criterion: actions serving it go first, but an overdue-and-silent or blocked signal is never dropped for it. On a rest day the plan is one to three optional suggestions of research or improvement — read, explore, document, try something — never obligations, deadlines or chasing overdue work, in a light tone; the briefing still says honestly where things stand.
- Prefer actions that unblock the objective furthest behind. Prefer this person's own tasks over other people's. Never ask somebody carrying a workload signal to take on more.
- Owning a project is not doing its tasks. A task belongs to the people it names as responsible; when that is somebody else, the reader's action is to follow up, decide, unblock, review or merge — say which and name the person ("pedile a Juan el orden de integración", "revisá el PR de Juan") — never to define, execute or organise that work themselves. The plan tells the reader to *do* only their own tasks, tasks they may take from the list, or what the day's focus asks of them.
- Late is not the same as stuck. An overdue signal says whether the owner moved the task recently — a status change, an edit, a comment of theirs. If they did, the work is advancing: the action is to close it or fix its date, not to chase. Stuck is past its date with no word from the owner; somebody else's comment on it is a question, not progress.
- When the person has no open task of their own (their signals include no_owned_work:<their id>) and the context lists tasks they could take, propose taking one or two of those, citing that signal (plus unassigned:<taskId> when it appears). Only ever propose work from that list: never from a database the role sees only through assignments, and never work that already belongs to somebody else.
- Pull requests: the developer responsible for a task opens the pull request when the work is done and answers requested changes; whoever holds an approver role reviews and merges. pr_missing and pr_changes_requested are the developer's action; pr_awaiting_review and pr_approved_unmerged are the approver's — they go in the approver's plan, and nobody is ever asked to approve their own pull request. Each task line says what its pull request is waiting on; read it before calling a task stuck.
- Be honest in "consequenceIfNotDone": a concrete, plausible cost, not a threat. Estimated minutes are realistic; a plan fits in a working day alongside meetings.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export const PLAN_SYSTEM = `You write one person's plan for today, given their role, their work, and signals that code has already computed. The plan is three to five concrete actions (one to three on a rest day, as the prompt says), each with the reason it matters today, and each citing at least one signal id from the list you were given.

Rules you must follow:
- Answer in Spanish (Costa Rica). Address the person directly ("revisá", "cerrá"), no filler.
- Only cite signal ids that appear in the list. An action without a real signal behind it does not go in the plan.
- The prompt says what kind of day it is. On a working day with a focus, the focus is the first ordering criterion: actions serving it go first, but an overdue-and-silent or blocked signal is never dropped for it. On a rest day the plan is one to three optional suggestions of research or improvement — read, explore, document, try something — never obligations, deadlines or chasing overdue work, in a light tone.
- Prefer actions that unblock the objective furthest behind. Prefer this person's own tasks over other people's.
- Owning a project is not doing its tasks. A task belongs to the people it names as responsible; when that is somebody else, the reader's action is to follow up, decide, unblock, review or merge — say which and name the person ("pedile a Juan el orden de integración", "revisá el PR de Juan") — never to define, execute or organise that work themselves. The plan tells the reader to *do* only their own tasks, tasks they may take from the list, or what the day's focus asks of them.
- When the person has no open task of their own (their signals include no_owned_work:<their id>) and the context lists tasks they could take, propose taking one or two of those, citing that signal (plus unassigned:<taskId> when it appears). Only ever propose work from that list: never from a database the role sees only through assignments, and never work that already belongs to somebody else.
- Pull requests: the developer responsible for a task opens the pull request when the work is done and answers requested changes; whoever holds an approver role reviews and merges. pr_missing and pr_changes_requested are the developer's action; pr_awaiting_review and pr_approved_unmerged are the approver's — they go in the approver's plan, and nobody is ever asked to approve their own pull request. Each task line says what its pull request is waiting on; read it before calling a task stuck.
- Be honest in "consequenceIfNotDone": a concrete, plausible cost, not a threat.
- Estimated minutes are realistic; a plan should fit in a working day alongside meetings.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export const FOLLOWUP_SYSTEM = `You read the team on behalf of one manager. You produce two things: a short reading of how every person is doing against what is expected of them, and — only for the people who need one today — a message the manager can copy and send.

Rules you must follow:
- Answer in Spanish (Costa Rica). Write each message in the manager's own voice, addressed to the person: warm and natural, the way a colleague writes in a chat, never a memo. No corporate filler, no emojis, no bullet points.
- Short. A message is two to four short sentences, sixty words at most, about one thing: what you noticed, what you are asking, and a warm close. If there are two things to say, say the important one; the reading is where the rest goes. Do not recount the person's whole board, do not list task numbers, dates or counts; at most one date and one number.
- Name a task by what it is, never by its number alone: "la tarea del diferencial cambiario", "el gráfico contable". The code may follow the name once, in parentheses, and never stands in for it — "la 368" or "la cadena 851-856" tell the reader nothing.
- Every message opens with a short greeting and the person's first name ("Hola Marco,"), so it can be pasted and sent exactly as it is. Close on a human note, not an order.
- Every person you were given gets exactly one reading, with their userId copied verbatim. The reading is two or three plain sentences; the recommendation is one sentence. Same rule on names: tasks by what they are, the code at most once.
- A message goes only to somebody the data says needs one today. Silence is a valid answer and the reading is where you explain it; never invent a reason to write.
- Every message cites at least one signal id from that person's list. A message with nothing real behind it is not written.
- Pull requests: a pr_changes_requested signal is the developer's — ask them for the answer or the push; a pr_awaiting_review or pr_approved_unmerged signal is the manager's own review to do, not a message to anybody. Each task line says what its pull request is waiting on.
- When the signal is about one task, the message belongs on that task: set target to "comentario" and taskId to that task's id. Reserve "directo" for what spans several tasks, or is about the person rather than the work.
- Late is not the same as stuck. An overdue signal says whether the owner moved the task recently — a status change, an edit, a comment of theirs — and each task lists its owner's last advance. If they moved it, the work is advancing: acknowledge it and ask only for a date, never chase it as silence. Stuck is past its date with no word from the owner; somebody else's comment on it is a question waiting, not progress.
- When somebody is ahead, or has just delivered, the message that fits is recognition. A day where everyone gets a telling-off is a misreading, not a hard day.
- Never ask somebody carrying a workload signal to take on more; suggest moving work instead.
- A situation changes how you ask, never what you reveal. If it is marked discreet, do not mention it, allude to it, or hint that you know: soften the ask and say nothing about why.
- If the same thing was already raised on three recent days, set escalate and propose a conversation instead of another message.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export const ASK_SYSTEM = `You are the chief of staff of a small company, answering one question from a person on the team about today. You have the same context the morning engine had: the north star, objectives, projects, tasks with their last movement and comments, signals computed in code, and — when the person is a manager — how each team member is doing.

Rules you must follow:
- Answer in Spanish (Costa Rica), as a sharp colleague would out loud: two to five sentences, the answer first, then the reason. No headings, no lists, no filler.
- The person asking is named at the top. Speak to them as "vos": their tasks are "tus tareas", a comment they owe is one *you* owe. Never refer to them in the third person, and never offer to tell them something — they are the one reading.
- Only say what the context supports. If it does not answer the question, say so in one sentence and, if useful, ask the one question that would.
- Pull requests: each task line says whether its pull request is open, waiting for review, waiting on the author, approved or merged, and the approvers are named above. "Where is X" is answered from that, not from the Notion status alone.
- Cite the signal ids the answer rests on in signalIds; leave it empty when none apply. Never invent a task, a person or a number.
- You can also propose one action, which the person confirms before anything is written. Use it only when the message clearly asks for it:
  · situation — they tell you something going on with a person ("Marco anda con un tema familiar esta semana"). Fill userId, text (the note, in their words), situationKind, discreet (true unless they say it can be mentioned), endsAt when a date or "esta semana" is implied.
  · message — they ask you to write to somebody. Put the full message in text: warm, natural, opens with "Hola <nombre>," and can be sent as it is.
  · mark_sent — they report having sent one of today's messages ("ya le escribí a Marco"). Fill messageId from the list of today's messages.
  · expectation — they say what they expect of somebody ("de Lucía espero que…"). Put the sentence in text.
  · reminder — they ask to be reminded of something ("recordame llamar al banco mañana a las 3", "avisame a las 5 que revise el deploy"). userId is the person asking. text is the reminder itself, short and in their words. Resolve date (YYYY-MM-DD) and time (HH:mm, 24h) from the current day and time given at the top: "mañana" is the next day, "a las 3" in the afternoon unless they say otherwise, "en una hora" is now plus one hour. leadMinutes only when they say how early (5, 10, 15, 30 or 60). If the time cannot be resolved, kind is none and followUp asks for it.
  Otherwise kind is none. Always fill summary with one line of what will happen. userId comes from the team list, never invented.
- An action is a proposal: the person confirms it on screen before anything is written. Say what you propose ("te lo dejo listo para confirmar"), never that it is already done.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

/**
 * What a prompt may draw on. Since ADR-008 this is always one role's view:
 * projects, tasks, people and signals are the scope's, never the company's.
 */
export interface CompanyContext {
  company: Company;
  /** The objectives active for this role: the company's and the role's own (ADR-013). */
  objectives: Objective[];
  /** Other roles' objectives, by id and title only, so a project serving one is not read as orphaned. */
  otherObjectives?: Pick<Objective, 'id' | 'title'>[];
  projects: Project[];
  tasks: Task[];
  members: (User & { membership: Membership })[];
  signals: Signal[];
  /** The role the context was built for; null when a person has none. */
  role?: Role | null;
  /** The Notion sources that role reads, for naming where a task lives. */
  sources?: NotionSource[];
  /** Among `sources`, the ones the role reads only through the person's own assignments (ADR-009). */
  assignedOnlySourceIds?: string[];
  /** GitHub repositories the role reads, and the pull requests in view (ADR-010). */
  repos?: GithubRepo[];
  pullRequests?: PullRequest[];
  /** Who reviews and merges pull requests. */
  approverUserIds?: string[];
  today: Date;
  todayIso: string;
  /** The day itself (ADR-012): working or rest, and the focus that applies. */
  day: DayResolution;
}

/** "14:05" in Costa Rica right now, for anything the person says relative to the clock. */
function clockNow(): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(
    new Date(),
  );
}

/** "lunes 2026-09-07" — the day named, so the model does not have to work it out. */
function dayName(ctx: CompanyContext): string {
  return `${WEEKDAY_NAMES[ctx.day.weekday].es} ${ctx.todayIso}`;
}

/**
 * What kind of day it is, under the role. On a working day with a focus the
 * focus orders the plan; on a rest day nothing is owed.
 */
function dayLine(ctx: CompanyContext): string {
  const { day } = ctx;
  if (!day.working) {
    return `Hoy es ${dayName(ctx)}, día no laboral${day.focus ? ` (tema sugerido: «${day.focus}»)` : ''}. Nada es obligatorio hoy.`;
  }
  if (day.focus) {
    return `Hoy es ${dayName(ctx)}, día laboral. Enfoque del día: «${day.focus}». Ordená el plan según este enfoque — primero lo que lo sirve — sin dejar fuera una señal crítica; una acción que nace del enfoque y no de una tarea cita day_focus:${day.iso}.`;
  }
  return `Hoy es ${dayName(ctx)}, día laboral.`;
}

/** The closing instruction for the plan: the working-day shape, or the rest-day one. */
function planInstruction(ctx: CompanyContext): string {
  return ctx.day.working
    ? 'un titular con la prioridad de hoy, el porqué ligado a un objetivo (objectiveId), de tres a cinco acciones con su porqué, minutos estimados, y qué pasa si no se hace hoy.'
    : `un titular liviano, el porqué, y de una a tres sugerencias opcionales de investigación o mejora (leer, explorar, documentar, probar algo), cada una citando rest_day:${ctx.day.iso} y, si aplica, otra señal; sin plazos, sin vencidos, sin «qué pasa si no se hace».`;
}

/**
 * What the person says they actually did yesterday (ADR-014).
 *
 * Their own words, unmatched to anything. The three verdicts on a plan only
 * ever describe what the engine proposed; this is the one place the work it
 * never thought of can show up, so it is what a blind spot looks like.
 */
function dayLogSection(log: string | null): string {
  if (!log) return '';
  return `
## Lo que realmente hizo ayer, en sus palabras
${log}
Leelo como la verdad sobre su día, no como un reporte de avance. Si hizo algo
que el plan nunca le pidió y se repite, eso es un punto ciego del plan, no un
desvío de la persona: tomalo en cuenta al priorizar hoy. No inventes tareas ni
señales a partir de esto, y no supongas que algo quedó terminado en Notion
porque lo mencionó.`;
}

/**
 * The rules this person confirmed about how they work (ADR-014).
 *
 * Prose, like the role description: it changes how the plan is ordered and
 * worded, never where an item comes from — todo ítem sigue citando una señal
 * calculada en código.
 */
function planRulesSection(rules: PlanRule[]): string {
  if (rules.length === 0) return '';
  return `
## Cómo trabaja esta persona — reglas que confirmó
${rules.map((r) => `- ${r.text}`).join('\n')}
Estas reglas las escribió o confirmó la persona sobre sí misma. Respetalas al
elegir y redactar las acciones. Si una regla choca con una señal, la señal
sigue siendo el hecho: no la escondas, replanteá la acción para que respete la
regla (por ejemplo, pedir cuentas en vez de ejecutar).`;
}

/**
 * The invitation to propose one rule, only when the day gave a reason.
 *
 * The engine interprets, the app writes, and the person confirms (ADR-004):
 * what comes back is a proposal stored on the plan, never something that
 * reaches a prompt on its own.
 */
function proposeRuleInstruction(log: string | null, hasIrrelevant: boolean): string {
  if (!log && !hasIrrelevant) return '';
  return `
Además, si —y solo si— lo que hizo ayer o lo que marcó como "no aplica" revela
una forma de trabajar que el plan debería respetar de ahora en adelante,
devolvé una sola regla en \`proposedRule\`: una frase en primera persona sobre
cómo trabaja esta persona, su alcance (\`general\` si vale en cualquier rol,
\`role\` si es solo de este) y la evidencia concreta en \`why\`. Nada de reglas
genéricas ("priorizar lo importante") ni de repetir algo que ya esté en la
lista de arriba. Si no hay evidencia clara de una, omitila: una propuesta
cada día no sirve de nada.`;
}

/** "Tareas Software (solo lo asignado a la persona)" or "Backlog Software (todo)". */
function sourceLabel(source: NotionSource, ctx: CompanyContext): string {
  const assignedOnly = ctx.assignedOnlySourceIds?.includes(source.id) ?? false;
  return `${source.title} (${assignedOnly ? 'solo lo asignado a la persona' : 'todo'})`;
}

/** What the role sees of Notion, source by source, or the honest "nothing". */
function sourcesLine(ctx: CompanyContext): string {
  const labels = (ctx.sources ?? []).map((s) => sourceLabel(s, ctx)).join(', ');
  return labels
    ? `Lo que este rol ve de Notion: ${labels}.`
    : 'Este rol no lee ninguna base de Notion; solo lo registrado en la app.';
}

/**
 * The section offering unowned work, only when the person has none of their
 * own: what code already decided they may take (`pickableTasks`), so the model
 * never has to guess which database is a pool and which is private.
 */
function pickableSection(
  ctx: CompanyContext,
  member: CompanyContext['members'][number],
  mine: Task[],
): string {
  if (mine.length > 0) return '';
  const pool = pickableTasks({
    tasks: ctx.tasks,
    assignedOnlySourceIds: ctx.assignedOnlySourceIds ?? [],
  }).slice(0, PICKABLE_SHOWN);
  if (pool.length === 0) return '';
  return `
## Tareas sin responsable que podría tomar (${pool.length}) — solo de las bases que ve completas
${pool.map((t) => fmtTask(t, ctx.members, ctx.today, ctx.sources, ctx.pullRequests)).join('\n')}
No tiene tareas propias abiertas (señal no_owned_work:${member.id}): proponé tomar una o dos de estas, citando esa señal.
`;
}

/** How many unowned tasks the model is offered; the list is sorted by priority first. */
const PICKABLE_SHOWN = 15;

/** "CTO: estabilidad… Además responde por: …" — the role, then the person's own line. */
function roleLine(ctx: CompanyContext, member: CompanyContext['members'][number]): string {
  const role = ctx.role;
  const head = role
    ? `${role.name}${role.description ? `: ${role.description}` : ''}`
    : `${member.membership.roleTitle || 'Sin rol'}`;
  const own = member.membership.roleDescription?.trim();
  return own ? `${head}. Además responde por: ${own}` : head;
}

/** One person as the follow-up sees them: role, signals, context, history. */
export interface FollowUpSubject {
  member: CompanyContext['members'][number];
  /** Only signals the manager is allowed to see. */
  signals: Signal[];
  /** Active notes about this person. Discreet ones change the tone, not the text. */
  situations: Situation[];
  /** What was suggested about them recently, and what the manager did with it. */
  recent: { date: string; tone: string; ask: string; outcome: string }[];
}

function fmtObjective(objective: Objective, today: Date, roleName: string | null = null): string {
  const scope = objective.scope === 'role' ? `rol ${roleName ?? objective.roleId ?? ''}`.trim() : 'general';
  const expected = expectedObjectivePct(objective, today);
  const gap = objectiveGap(objective, today);
  const progress = objectiveProgressPct(objective);
  const indicators = objective.indicators
    .map(
      (i) =>
        `${i.name}: ${i.current} ${i.unit} (base ${i.baseline}, meta ${i.target} para ${indicatorTargetDate(i, objective)}, ${indicatorProgressPct(i)}% recorrido)`,
    )
    .join('; ');
  return `- [${objective.id}] ${objective.title} (${scope}) — avance ${progress}% vs esperado ${expected}% (brecha ${gap} pts), estado ${objective.status}, fecha ${objective.targetDate}, prioridad ${objective.priority}${indicators ? `. Indicadores: ${indicators}` : '. Sin indicadores: el avance es un número escrito a mano'}`;
}

function fmtProject(
  project: Project,
  objectives: Objective[],
  members: CompanyContext['members'] = [],
  others: Pick<Objective, 'id' | 'title'>[] = [],
): string {
  const serves = project.objectiveIds
    .map((id) => objectives.find((o) => o.id === id)?.title)
    .filter(Boolean)
    .join(', ');
  // Linked only to another role's objective: served, just not by anything
  // this role reads (ADR-013).
  const elsewhere = !serves && project.objectiveIds.some((id) => others.some((o) => o.id === id));
  // Who answers for the project as a whole; the task lines say who does each one.
  const owner = members.find((m) => m.id === project.ownerUserId)?.displayName;
  return `- [${project.id}] ${project.name} — avance ${project.progressPct}%, estado ${project.status}, fecha ${project.targetDate}${owner ? `, responsable del proyecto: ${owner}` : ''}${serves ? `, sirve a: ${serves}` : elsewhere ? ', sirve a un objetivo de otro rol' : ', SIN OBJETIVO'}`;
}

function fmtTask(
  task: Task,
  members: CompanyContext['members'],
  today?: Date,
  sources?: NotionSource[],
  pullRequests?: PullRequest[],
): string {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.displayName;
  const sourceName = task.sourceId ? sources?.find((s) => s.id === task.sourceId)?.title : undefined;
  const responsible = (task.assigneeUserIds ?? [])
    .map((id) => nameOf(id))
    .filter(Boolean)
    .join(', ');

  // Activity is what makes "this has not moved" sayable. Absent stamps are left
  // out rather than guessed at: a task we have never seen move is not stalled.
  // Two clocks: anybody's activity, and the owner's own progress — a status
  // change, an edit, or a comment of theirs. A late task whose owner wrote on
  // it yesterday is moving; one where only others have asked is not.
  const idle = today ? idleDays(task, today) : null;
  const progress = today ? progressDays(task, today) : null;
  const activity: string[] = [];
  if (progress !== null) activity.push(`último avance del responsable hace ${progress} días`);
  if (idle !== null && idle !== progress) activity.push(`última actividad de cualquiera hace ${idle} días`);
  if (task.lastCommentAt) {
    const author = nameOf(task.lastCommentBy ?? null) ?? 'alguien';
    const last = task.comments?.[task.comments.length - 1];
    activity.push(
      `último comentario de ${author} el ${task.lastCommentAt.slice(0, 10)}${last ? `: "${last.text}"` : ''}`,
    );
  }

  // The task's pull request, when there is one: what the code is waiting on
  // is the fact that turns "this has not moved" into "this waits on me".
  const pr = latestPullFor(task.id, pullRequests);
  const prFact = pr && today ? ` ${fmtPull(pr, members, today)}` : '';

  return `- [${task.id}] ${task.code || '—'} ${task.title} — estado ${task.notionStatus ?? task.status}, prioridad ${task.priority}, vence ${task.dueDate ?? 'sin fecha'}, ${responsible.includes(',') ? 'responsables' : 'responsable'} ${responsible || 'nadie'}${task.dependsOn.length ? `, depende de ${task.dependsOn.join(', ')}` : ''}${sourceName ? ` [fuente: ${sourceName}]` : ''}${activity.length ? `. ${activity.join('; ')}` : ''}${prFact}`;
}

/** The pull request that speaks for a task: open first, then the latest. */
function latestPullFor(taskId: string, pullRequests?: PullRequest[]): PullRequest | undefined {
  const mine = (pullRequests ?? []).filter((pr) => pr.taskId === taskId);
  if (mine.length === 0) return undefined;
  const open = mine.filter((pr) => pr.state === 'open').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return open[0] ?? [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** One pull request in a sentence: where it goes and what it is waiting on. */
function fmtPull(pr: PullRequest, members: CompanyContext['members'], today: Date): string {
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.displayName;
  const days = (iso: string | null | undefined) =>
    iso ? Math.max(0, Math.floor((today.getTime() - new Date(iso).getTime()) / 86_400_000)) : null;
  const who = nameOf(pr.authorUserId) ?? pr.authorLogin;
  const head = `PR #${pr.number} de ${who} hacia ${pr.baseRef}`;
  if (pr.state === 'merged') return `${head}: fusionado el ${(pr.mergedAt ?? pr.updatedAt).slice(0, 10)}.`;
  if (pr.state === 'closed') return `${head}: cerrado sin fusionar.`;
  if (pr.draft) return `${head}: borrador, no pide revisión todavía.`;
  if (pr.reviewState === 'changes_requested') {
    const answered = pr.lastAuthorActivityAt && pr.lastReviewAt && pr.lastAuthorActivityAt > pr.lastReviewAt;
    return `${head}: ${nameOf(pr.lastReviewBy) ?? 'un revisor'} pidió cambios hace ${days(pr.lastReviewAt)} días, ${answered ? 'el autor ya respondió' : 'sin respuesta del autor'}.`;
  }
  if (pr.reviewState === 'approved') return `${head}: aprobado hace ${days(pr.lastReviewAt)} días, sin fusionar.`;
  return `${head}: abierto hace ${days(pr.createdAt)} días, sin aprobación${pr.lastPushAt ? ` (último push hace ${days(pr.lastPushAt)} días)` : ''}.`;
}

/** What the role reads of GitHub, and who approves, or nothing. */
function githubLine(ctx: CompanyContext): string {
  const repos = ctx.repos ?? [];
  if (repos.length === 0) return '';
  const projectName = (id: string | null) => ctx.projects.find((p) => p.id === id)?.name;
  const named = repos
    .map((r) => `${r.fullName}${projectName(r.projectId) ? ` (proyecto ${projectName(r.projectId)}, base ${r.baseBranch})` : ` (base ${r.baseBranch})`}`)
    .join(', ');
  const approvers = (ctx.approverUserIds ?? [])
    .map((id) => ctx.members.find((m) => m.id === id)?.displayName)
    .filter(Boolean)
    .join(', ');
  return `Repositorios de GitHub que ve: ${named}. ${approvers ? `Aprueban y fusionan los pull requests: ${approvers}.` : 'Nadie tiene rol aprobador configurado.'}`;
}

/** Open pull requests that name no task, so nothing waiting on somebody is invisible. */
function untaskedPullsSection(ctx: CompanyContext): string {
  const open = (ctx.pullRequests ?? []).filter((pr) => pr.state === 'open' && !pr.taskId).slice(0, 15);
  if (open.length === 0) return '';
  return `
## Pull requests abiertos sin tarea (${open.length})
${open.map((pr) => `- [${pr.id}] ${pr.title} — ${fmtPull(pr, ctx.members, ctx.today)}`).join('\n')}
`;
}

function fmtSignal(signal: Signal): string {
  return `- [${signal.id}] (${signal.severity}) ${signal.summary.es}`;
}

/** The company-wide analysis, one call per company per day. */
export function analysisPrompt(ctx: CompanyContext): string {
  const { company, objectives, projects, tasks, members, signals, today, todayIso } = ctx;
  const openTasks = tasks.filter((t) => t.status !== 'done');

  return `# ${company.name} — ${todayIso}

## Meta global
${company.northStar}
Fecha objetivo: ${company.northStarDeadline}

## Objetivos
${objectives.map((o) => fmtObjective(o, today, ctx.role?.name ?? null)).join('\n') || '(ninguno)'}

## Proyectos
${projects.map((p) => fmtProject(p, objectives, ctx.members, ctx.otherObjectives)).join('\n') || '(ninguno)'}

## Tareas abiertas (${openTasks.length})
${openTasks.map((t) => fmtTask(t, members, today, ctx.sources, ctx.pullRequests)).join('\n') || '(ninguna)'}

## Equipo
${members.map((m) => `- ${m.displayName} — ${m.membership.roleTitle}: ${m.membership.roleDescription || 'sin descripción'}`).join('\n')}

## Señales calculadas hoy (${signals.length})
${signals.map(fmtSignal).join('\n') || '(ninguna)'}

Escribí el briefing ejecutivo de hoy: un resumen de un párrafo, los tres riesgos que más pesan, las decisiones pendientes, y una lectura breve desde cada perspectiva (ceo, coo, cto, cfo, pm).`;
}

/**
 * The morning call for one person in one role: briefing and plan from the
 * same reading. Everything in it is the role's view; the model is told so.
 */
export function briefingAndPlanPrompt(
  ctx: CompanyContext,
  member: CompanyContext['members'][number],
  personalSignals: Signal[],
  yesterday: { headline: string; done: string[]; skipped: string[]; irrelevant: string[] } | null,
  dayLog: string | null,
  rules: PlanRule[],
): string {
  const { company, objectives, projects, tasks, members, signals, today, todayIso } = ctx;
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const mine = openTasks.filter((t) => t.assigneeUserIds.includes(member.id));
  const myProjects = projects.filter(
    (p) => p.ownerUserId === member.id || p.memberUserIds.includes(member.id),
  );

  return `# ${company.name} — ${dayName(ctx)} — para ${member.displayName}

## Su rol hoy
${roleLine(ctx, member)}
${dayLine(ctx)}
${sourcesLine(ctx)}
${githubLine(ctx)}
Todo lo que sigue es lo que este rol puede ver. No hay más; no supongas lo que otros roles hacen.

## Meta global
${company.northStar}
Fecha objetivo: ${company.northStarDeadline}

## Objetivos
${objectives.map((o) => fmtObjective(o, today, ctx.role?.name ?? null)).join('\n') || '(ninguno)'}

## Proyectos a la vista
${projects.map((p) => fmtProject(p, objectives, ctx.members, ctx.otherObjectives)).join('\n') || '(ninguno)'}

## Tareas abiertas a la vista (${openTasks.length})
${openTasks.map((t) => fmtTask(t, members, today, ctx.sources, ctx.pullRequests)).join('\n') || '(ninguna)'}

## Sus proyectos
${myProjects.map((p) => `- [${p.id}] ${p.name}`).join('\n') || '(ninguno)'}

## Sus tareas abiertas (${mine.length})
${mine.map((t) => `- [${t.id}] ${t.code || '—'} ${t.title}`).join('\n') || '(ninguna)'}
${pickableSection(ctx, member, mine)}${untaskedPullsSection(ctx)}
## Personas a la vista
${members.map((m) => `- ${m.displayName} — ${m.membership.roleTitle || 'sin rol'}`).join('\n')}

## Señales calculadas hoy (${signals.length})
${signals.map(fmtSignal).join('\n') || '(ninguna)'}

## Señales que le tocan (${personalSignals.length}) — citá estos ids en el plan
${personalSignals.map(fmtSignal).join('\n') || '(ninguna)'}
${
  yesterday
    ? `
## Ayer
Prioridad: ${yesterday.headline}
Hecho: ${yesterday.done.join('; ') || 'nada marcado'}
Omitido: ${yesterday.skipped.join('; ') || 'nada'}
No aplica (la persona dijo que no era suyo o no tenía sentido): ${yesterday.irrelevant.join('; ') || 'nada'}
Continuá lo que quedó abierto si sigue importando; no repitas lo hecho; y lo marcado como "no aplica" no lo vuelvas a proponer, ni nada equivalente — si era trabajo de otra persona, a lo sumo pedile cuentas a esa persona.`
    : ''
}${dayLogSection(dayLog)}${planRulesSection(rules)}

Escribí primero el briefing del día desde este rol: un párrafo, los tres riesgos que más pesan, las decisiones pendientes y una lectura breve desde cada perspectiva (ceo, coo, cto, cfo, pm). Después su plan: ${planInstruction(ctx)}${proposeRuleInstruction(dayLog, (yesterday?.irrelevant.length ?? 0) > 0)}`;
}

/** One person's plan. Runs once per member, after the analysis. */
export function planPrompt(
  ctx: CompanyContext,
  member: CompanyContext['members'][number],
  personalSignals: Signal[],
  briefing: string,
  yesterday: { headline: string; done: string[]; skipped: string[]; irrelevant: string[] } | null,
  dayLog: string | null,
  rules: PlanRule[],
): string {
  const { company, objectives, projects, tasks, today, todayIso } = ctx;
  const mine = tasks.filter((t) => t.assigneeUserIds.includes(member.id) && t.status !== 'done');
  const myProjects = projects.filter(
    (p) => p.ownerUserId === member.id || p.memberUserIds.includes(member.id),
  );

  return `# Plan de hoy para ${member.displayName} — ${dayName(ctx)}

## Su rol en ${company.name}
${roleLine(ctx, member)}
${dayLine(ctx)}
${sourcesLine(ctx)}
${githubLine(ctx)}

## Meta global
${company.northStar}

## Briefing de la empresa hoy
${briefing}

## Objetivos
${objectives.map((o) => fmtObjective(o, today, ctx.role?.name ?? null)).join('\n') || '(ninguno)'}

## Sus proyectos
${myProjects.map((p) => fmtProject(p, objectives, ctx.members, ctx.otherObjectives)).join('\n') || '(ninguno)'}

## Sus tareas abiertas (${mine.length})
${mine.map((t) => fmtTask(t, ctx.members, today, ctx.sources, ctx.pullRequests)).join('\n') || '(ninguna)'}
${pickableSection(ctx, member, mine)}
## Señales que le tocan (${personalSignals.length}) — citá estos ids en signalIds
${personalSignals.map(fmtSignal).join('\n') || '(ninguna)'}

${
  yesterday
    ? `## Ayer
Prioridad: ${yesterday.headline}
Hecho: ${yesterday.done.join('; ') || 'nada marcado'}
Omitido: ${yesterday.skipped.join('; ') || 'nada'}
No aplica (la persona dijo que no era suyo o no tenía sentido): ${yesterday.irrelevant.join('; ') || 'nada'}
Continuá lo que quedó abierto si sigue importando; no repitas lo hecho; y lo marcado como "no aplica" no lo vuelvas a proponer, ni nada equivalente — si era trabajo de otra persona, a lo sumo pedile cuentas a esa persona.`
    : ''
}${dayLogSection(dayLog)}${planRulesSection(rules)}

Escribí su plan: ${planInstruction(ctx)}${proposeRuleInstruction(dayLog, (yesterday?.irrelevant.length ?? 0) > 0)}`;
}

/**
 * The team follow-up. One call per manager per day.
 *
 * One call for the whole team rather than one per person, because deciding who
 * to write to is half the judgement: the task is stuck, and whether that is the
 * developer's problem or the lead's is only visible with everyone side by side.
 */
export function followUpPrompt(
  ctx: CompanyContext,
  manager: CompanyContext['members'][number],
  team: FollowUpSubject[],
  briefing: string,
): string {
  const { company, objectives, tasks, today, todayIso } = ctx;

  const person = (subject: FollowUpSubject): string => {
    const { member, signals, situations, recent } = subject;
    const open = tasks.filter((t) => t.assigneeUserIds.includes(member.id) && t.status !== 'done');

    return `### ${member.displayName} — userId: ${member.id}
Rol: ${member.membership.roleTitle}. ${member.membership.roleDescription || 'Sin descripción.'}
${member.membership.commsTone ? `Tono con el que se le habla: ${member.membership.commsTone}.` : ''}

Lo que ${manager.displayName} espera de esta persona, en sus palabras:
${member.membership.expectations?.trim() || '(nadie lo ha escrito todavía)'}

Situación:
${
  situations
    .map(
      (s) =>
        `- ${s.discreet ? 'RESERVADO, NO LO MENCIONES NI LO INSINUÉS' : 'Se puede mencionar'} — ${s.kind}: ${s.note}${s.endsAt ? ` (hasta ${s.endsAt})` : ''}`,
    )
    .join('\n') || '- (ninguna registrada)'
}

Sus tareas abiertas (${open.length}):
${open.map((t) => fmtTask(t, ctx.members, today, ctx.sources, ctx.pullRequests)).join('\n') || '- (ninguna)'}

Señales sobre esta persona (${signals.length}) — solo podés citar estos ids:
${signals.map(fmtSignal).join('\n') || '- (ninguna)'}

Lo que ya se le dijo:
${
  recent
    .map((r) => `- ${r.date} (${r.tone}, ${r.outcome}): ${r.ask}`)
    .join('\n') || '- (nada en los últimos días)'
}`;
  };

  return `# Seguimiento del equipo de ${company.name} — ${todayIso}

Escribís para ${manager.displayName}, que es quien va a leer esto y quien va a mandar los mensajes. Su rol hoy: ${roleLine(ctx, manager)}. Todo lo que sigue es lo que ese rol puede ver; las personas que no aparecen no están en su vista.

## Meta global
${company.northStar}
Fecha objetivo: ${company.northStarDeadline}

## Briefing de hoy
${briefing}

## Objetivos
${objectives.map((o) => fmtObjective(o, today, ctx.role?.name ?? null)).join('\n') || '(ninguno)'}

## El equipo

${team.map(person).join('\n\n')}

Para cada persona escribí su lectura en dos o tres frases: compará lo que ${manager.displayName} espera de ella con lo que realmente pasó en sus tareas, decí en qué estado la ubicás, y en una frase qué le recomendás a ${manager.displayName}. La expectativa es el criterio; las señales y las tareas son la evidencia. Nombrá las tareas por lo que son, no por su número.

Después, solo para quienes hoy lo ameritan, escribí el mensaje que ${manager.displayName} les debería mandar: dónde va (comentario en la tarea o mensaje directo), con qué tono, el texto listo para copiar — corto, de una sola cosa, como se escribe en un chat —, qué está pidiendo exactamente, y por qué se lo manda.`;
}

export interface AskTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * A question about today, with the whole day as context. One call per
 * question; the conversation so far travels along so a follow-up question
 * reads as one.
 */
export function askPrompt(
  ctx: CompanyContext,
  member: CompanyContext['members'][number],
  personalSignals: Signal[],
  team: FollowUpSubject[] | null,
  briefing: string | null,
  history: AskTurn[],
  question: string,
  todaysMessages: { id: string; userId: string; ask: string }[] = [],
): string {
  const { company, objectives, projects, tasks, today, todayIso } = ctx;
  const open = tasks.filter((t) => t.status !== 'done');

  return `# Pregunta de ${member.displayName} — ${dayName(ctx)}
Ahora son las ${clockNow()} (hora de Costa Rica). Quien pregunta es ${member.displayName} (userId ${member.id}); en el contexto aparece como responsable o autor con ese nombre. Hablale de vos.
Su rol hoy: ${roleLine(ctx, member)}. ${sourcesLine(ctx)} ${githubLine(ctx)} Todo lo que sigue es lo que ese rol puede ver; no hay más.

## Personas (userId — nombre, rol)
${ctx.members.map((m) => `- ${m.id} — ${m.displayName}, ${m.membership.roleTitle}`).join('\n')}
${
  todaysMessages.length
    ? `\n## Mensajes sugeridos hoy (messageId — para quién: qué pide)\n${todaysMessages
        .map((m) => `- ${m.id} — ${ctx.members.find((x) => x.id === m.userId)?.displayName ?? m.userId}: ${m.ask}`)
        .join('\n')}\n`
    : ''
}
## Meta global
${company.northStar}
Fecha objetivo: ${company.northStarDeadline}
${briefing ? `\n## Briefing de hoy\n${briefing}\n` : ''}
## Objetivos
${objectives.map((o) => fmtObjective(o, today, ctx.role?.name ?? null)).join('\n') || '(ninguno)'}

## Proyectos
${projects.map((p) => fmtProject(p, objectives, ctx.members, ctx.otherObjectives)).join('\n') || '(ninguno)'}

## Tareas abiertas (${open.length})
${open.map((t) => fmtTask(t, ctx.members, today, ctx.sources, ctx.pullRequests)).join('\n') || '(ninguna)'}
${untaskedPullsSection(ctx)}
## Señales (${personalSignals.length}) — citá estos ids en signalIds
${personalSignals.map(fmtSignal).join('\n') || '(ninguna)'}
${
  team
    ? `\n## El equipo, como lo ve quien pregunta\n${team
        .map(
          (s) =>
            `- ${s.member.displayName} (${s.member.membership.roleTitle}): ${s.signals.length} señales${s.signals.length ? ' — ' + s.signals.map((x) => x.id).join(', ') : ''}. Se espera: ${s.member.membership.expectations?.trim() || '(sin escribir)'}`,
        )
        .join('\n')}\n`
    : ''
}
${
  history.length
    ? `## Conversación hasta ahora\n${history.map((h) => `${h.role === 'user' ? 'Pregunta' : 'Respuesta'}: ${h.text}`).join('\n')}\n`
    : ''
}
## Pregunta
${question}`;
}
