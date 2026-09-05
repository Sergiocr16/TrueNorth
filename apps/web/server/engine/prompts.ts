import 'server-only';

import type {
  Company,
  Membership,
  NotionSource,
  Objective,
  Project,
  Role,
  Signal,
  Situation,
  Task,
  User,
} from '@truenorth/core';
import { expectedProgressPct, idleDays, pickableTasks, progressGap } from '@truenorth/core';

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
- The plan is three to five concrete actions, each with the reason it matters today and each citing at least one signal id from the list. An action without a real signal behind it does not go in.
- Prefer actions that unblock the objective furthest behind. Prefer this person's own tasks over other people's. Never ask somebody carrying a workload signal to take on more.
- When the person has no open task of their own (their signals include no_owned_work:<their id>) and the context lists tasks they could take, propose taking one or two of those, citing that signal (plus unassigned:<taskId> when it appears). Only ever propose work from that list: never from a database the role sees only through assignments, and never work that already belongs to somebody else.
- Be honest in "consequenceIfNotDone": a concrete, plausible cost, not a threat. Estimated minutes are realistic; a plan fits in a working day alongside meetings.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export const PLAN_SYSTEM = `You write one person's plan for today, given their role, their work, and signals that code has already computed. The plan is three to five concrete actions, each with the reason it matters today, and each citing at least one signal id from the list you were given.

Rules you must follow:
- Answer in Spanish (Costa Rica). Address the person directly ("revisá", "cerrá"), no filler.
- Only cite signal ids that appear in the list. An action without a real signal behind it does not go in the plan.
- Prefer actions that unblock the objective furthest behind. Prefer this person's own tasks over other people's.
- When the person has no open task of their own (their signals include no_owned_work:<their id>) and the context lists tasks they could take, propose taking one or two of those, citing that signal (plus unassigned:<taskId> when it appears). Only ever propose work from that list: never from a database the role sees only through assignments, and never work that already belongs to somebody else.
- Be honest in "consequenceIfNotDone": a concrete, plausible cost, not a threat.
- Estimated minutes are realistic; a plan should fit in a working day alongside meetings.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export const FOLLOWUP_SYSTEM = `You read the team on behalf of one manager. You produce two things: a short reading of how every person is doing against what is expected of them, and — only for the people who need one today — a message the manager can copy and send.

Rules you must follow:
- Answer in Spanish (Costa Rica). Write each message in the manager's own voice, addressed to the person: warm and natural, the way a colleague writes, never a memo. No corporate filler, no emojis, no bullet points.
- Every message opens with a short greeting and the person's first name ("Hola Marco,"), so it can be pasted and sent exactly as it is. Close on a human note, not an order.
- Every person you were given gets exactly one reading, with their userId copied verbatim.
- A message goes only to somebody the data says needs one today. Silence is a valid answer and the reading is where you explain it; never invent a reason to write.
- Every message cites at least one signal id from that person's list. A message with nothing real behind it is not written.
- When the signal is about one task, the message belongs on that task: set target to "comentario" and taskId to that task's id. Reserve "directo" for what spans several tasks, or is about the person rather than the work.
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
- Cite the signal ids the answer rests on in signalIds; leave it empty when none apply. Never invent a task, a person or a number.
- You can also propose one action, which the person confirms before anything is written. Use it only when the message clearly asks for it:
  · situation — they tell you something going on with a person ("Marco anda con un tema familiar esta semana"). Fill userId, text (the note, in their words), situationKind, discreet (true unless they say it can be mentioned), endsAt when a date or "esta semana" is implied.
  · message — they ask you to write to somebody. Put the full message in text: warm, natural, opens with "Hola <nombre>," and can be sent as it is.
  · mark_sent — they report having sent one of today's messages ("ya le escribí a Marco"). Fill messageId from the list of today's messages.
  · expectation — they say what they expect of somebody ("de Lucía espero que…"). Put the sentence in text.
  Otherwise kind is none. Always fill summary with one line of what will happen. userId comes from the team list, never invented.
- An action is a proposal: the person confirms it on screen before anything is written. Say what you propose ("te lo dejo listo para confirmar"), never that it is already done.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

/**
 * What a prompt may draw on. Since ADR-008 this is always one role's view:
 * projects, tasks, people and signals are the scope's, never the company's.
 */
export interface CompanyContext {
  company: Company;
  objectives: Objective[];
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
  today: Date;
  todayIso: string;
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
${pool.map((t) => fmtTask(t, ctx.members, ctx.today, ctx.sources)).join('\n')}
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

function fmtObjective(objective: Objective, today: Date): string {
  const expected = expectedProgressPct(objective.startDate, objective.targetDate, today);
  const gap = progressGap(objective, today);
  const indicators = objective.indicators
    .map((i) => `${i.name}: ${i.current} ${i.unit} (base ${i.baseline}, meta ${i.target})`)
    .join('; ');
  return `- [${objective.id}] ${objective.title} — avance ${objective.progressPct}% vs esperado ${expected}% (brecha ${gap} pts), estado ${objective.status}, fecha ${objective.targetDate}, prioridad ${objective.priority}${indicators ? `. Indicadores: ${indicators}` : ''}`;
}

function fmtProject(project: Project, objectives: Objective[]): string {
  const serves = project.objectiveIds
    .map((id) => objectives.find((o) => o.id === id)?.title)
    .filter(Boolean)
    .join(', ');
  return `- [${project.id}] ${project.name} — avance ${project.progressPct}%, estado ${project.status}, fecha ${project.targetDate}${serves ? `, sirve a: ${serves}` : ', SIN OBJETIVO'}`;
}

function fmtTask(
  task: Task,
  members: CompanyContext['members'],
  today?: Date,
  sources?: NotionSource[],
): string {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.displayName;
  const sourceName = task.sourceId ? sources?.find((s) => s.id === task.sourceId)?.title : undefined;
  const responsible = (task.assigneeUserIds ?? [])
    .map((id) => nameOf(id))
    .filter(Boolean)
    .join(', ');

  // Activity is what makes "this has not moved" sayable. Absent stamps are left
  // out rather than guessed at: a task we have never seen move is not stalled.
  const idle = today ? idleDays(task, today) : null;
  const activity: string[] = [];
  if (idle !== null) activity.push(`sin moverse hace ${idle} días`);
  if (task.lastCommentAt) {
    const author = nameOf(task.lastCommentBy ?? null) ?? 'alguien';
    const last = task.comments?.[task.comments.length - 1];
    activity.push(
      `último comentario de ${author} el ${task.lastCommentAt.slice(0, 10)}${last ? `: "${last.text}"` : ''}`,
    );
  }

  return `- [${task.id}] ${task.code || '—'} ${task.title} — estado ${task.notionStatus ?? task.status}, prioridad ${task.priority}, vence ${task.dueDate ?? 'sin fecha'}, ${responsible.includes(',') ? 'responsables' : 'responsable'} ${responsible || 'nadie'}${task.dependsOn.length ? `, depende de ${task.dependsOn.join(', ')}` : ''}${sourceName ? ` [fuente: ${sourceName}]` : ''}${activity.length ? `. ${activity.join('; ')}` : ''}`;
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
${objectives.map((o) => fmtObjective(o, today)).join('\n') || '(ninguno)'}

## Proyectos
${projects.map((p) => fmtProject(p, objectives)).join('\n') || '(ninguno)'}

## Tareas abiertas (${openTasks.length})
${openTasks.map((t) => fmtTask(t, members, today, ctx.sources)).join('\n') || '(ninguna)'}

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
  yesterday: { headline: string; done: string[]; skipped: string[] } | null,
): string {
  const { company, objectives, projects, tasks, members, signals, today, todayIso } = ctx;
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const mine = openTasks.filter((t) => t.assigneeUserIds.includes(member.id));
  const myProjects = projects.filter(
    (p) => p.ownerUserId === member.id || p.memberUserIds.includes(member.id),
  );

  return `# ${company.name} — ${todayIso} — para ${member.displayName}

## Su rol hoy
${roleLine(ctx, member)}
${sourcesLine(ctx)}
Todo lo que sigue es lo que este rol puede ver. No hay más; no supongas lo que otros roles hacen.

## Meta global
${company.northStar}
Fecha objetivo: ${company.northStarDeadline}

## Objetivos
${objectives.map((o) => fmtObjective(o, today)).join('\n') || '(ninguno)'}

## Proyectos a la vista
${projects.map((p) => fmtProject(p, objectives)).join('\n') || '(ninguno)'}

## Tareas abiertas a la vista (${openTasks.length})
${openTasks.map((t) => fmtTask(t, members, today, ctx.sources)).join('\n') || '(ninguna)'}

## Sus proyectos
${myProjects.map((p) => `- [${p.id}] ${p.name}`).join('\n') || '(ninguno)'}

## Sus tareas abiertas (${mine.length})
${mine.map((t) => `- [${t.id}] ${t.code || '—'} ${t.title}`).join('\n') || '(ninguna)'}
${pickableSection(ctx, member, mine)}
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
Continuá lo que quedó abierto si sigue importando; no repitas lo hecho.`
    : ''
}

Escribí primero el briefing del día desde este rol: un párrafo, los tres riesgos que más pesan, las decisiones pendientes y una lectura breve desde cada perspectiva (ceo, coo, cto, cfo, pm). Después su plan: un titular con la prioridad de hoy, el porqué ligado a un objetivo (objectiveId), de tres a cinco acciones con su porqué, minutos estimados, y qué pasa si no se hace hoy.`;
}

/** One person's plan. Runs once per member, after the analysis. */
export function planPrompt(
  ctx: CompanyContext,
  member: CompanyContext['members'][number],
  personalSignals: Signal[],
  briefing: string,
  yesterday: { headline: string; done: string[]; skipped: string[] } | null,
): string {
  const { company, objectives, projects, tasks, today, todayIso } = ctx;
  const mine = tasks.filter((t) => t.assigneeUserIds.includes(member.id) && t.status !== 'done');
  const myProjects = projects.filter(
    (p) => p.ownerUserId === member.id || p.memberUserIds.includes(member.id),
  );

  return `# Plan de hoy para ${member.displayName} — ${todayIso}

## Su rol en ${company.name}
${roleLine(ctx, member)}
${sourcesLine(ctx)}

## Meta global
${company.northStar}

## Briefing de la empresa hoy
${briefing}

## Objetivos
${objectives.map((o) => fmtObjective(o, today)).join('\n') || '(ninguno)'}

## Sus proyectos
${myProjects.map((p) => fmtProject(p, objectives)).join('\n') || '(ninguno)'}

## Sus tareas abiertas (${mine.length})
${mine.map((t) => fmtTask(t, ctx.members, today, ctx.sources)).join('\n') || '(ninguna)'}
${pickableSection(ctx, member, mine)}
## Señales que le tocan (${personalSignals.length}) — citá estos ids en signalIds
${personalSignals.map(fmtSignal).join('\n') || '(ninguna)'}

${
  yesterday
    ? `## Ayer
Prioridad: ${yesterday.headline}
Hecho: ${yesterday.done.join('; ') || 'nada marcado'}
Omitido: ${yesterday.skipped.join('; ') || 'nada'}
Continuá lo que quedó abierto si sigue importando; no repitas lo hecho.`
    : ''
}

Escribí su plan: un titular con la prioridad de hoy, el porqué ligado a un objetivo (objectiveId), de tres a cinco acciones con su porqué, minutos estimados, y qué pasa si no se hace hoy.`;
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
${open.map((t) => fmtTask(t, ctx.members, today, ctx.sources)).join('\n') || '- (ninguna)'}

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
${objectives.map((o) => fmtObjective(o, today)).join('\n') || '(ninguno)'}

## El equipo

${team.map(person).join('\n\n')}

Para cada persona escribí su lectura: compará lo que ${manager.displayName} espera de ella con lo que realmente pasó en sus tareas (estados que se movieron o no, comentarios respondidos o no, fechas), decí en qué estado la ubicás, y qué le recomendás a ${manager.displayName} hacer al respecto. La expectativa es el criterio; las señales y las tareas son la evidencia.

Después, solo para quienes hoy lo ameritan, escribí el mensaje que ${manager.displayName} les debería mandar: dónde va (comentario en la tarea o mensaje directo), con qué tono, el texto listo para copiar, qué está pidiendo exactamente, y por qué se lo manda.`;
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

  return `# Pregunta de ${member.displayName} — ${todayIso}
Quien pregunta es ${member.displayName} (userId ${member.id}); en el contexto aparece como responsable o autor con ese nombre. Hablale de vos.
Su rol hoy: ${roleLine(ctx, member)}. ${sourcesLine(ctx)} Todo lo que sigue es lo que ese rol puede ver; no hay más.

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
${objectives.map((o) => fmtObjective(o, today)).join('\n') || '(ninguno)'}

## Proyectos
${projects.map((p) => fmtProject(p, objectives)).join('\n') || '(ninguno)'}

## Tareas abiertas (${open.length})
${open.map((t) => fmtTask(t, ctx.members, today, ctx.sources)).join('\n') || '(ninguna)'}

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
