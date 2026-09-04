import 'server-only';

import type {
  Company,
  Membership,
  Objective,
  Project,
  Signal,
  Task,
  User,
} from '@truenorth/core';
import { expectedProgressPct, progressGap } from '@truenorth/core';

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

export const PLAN_SYSTEM = `You write one person's plan for today, given their role, their work, and signals that code has already computed. The plan is three to five concrete actions, each with the reason it matters today, and each citing at least one signal id from the list you were given.

Rules you must follow:
- Answer in Spanish (Costa Rica). Address the person directly ("revisá", "cerrá"), no filler.
- Only cite signal ids that appear in the list. An action without a real signal behind it does not go in the plan.
- Prefer actions that unblock the objective furthest behind. Prefer this person's own tasks over other people's.
- Be honest in "consequenceIfNotDone": a concrete, plausible cost, not a threat.
- Estimated minutes are realistic; a plan should fit in a working day alongside meetings.
- Do not use tools. Reply with the JSON the schema asks for and nothing else.`;

export interface CompanyContext {
  company: Company;
  objectives: Objective[];
  projects: Project[];
  tasks: Task[];
  members: (User & { membership: Membership })[];
  signals: Signal[];
  today: Date;
  todayIso: string;
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

function fmtTask(task: Task, members: CompanyContext['members']): string {
  const owner = members.find((m) => m.id === task.assigneeUserId)?.displayName ?? 'sin responsable';
  return `- [${task.id}] ${task.code || '—'} ${task.title} — estado ${task.notionStatus ?? task.status}, prioridad ${task.priority}, vence ${task.dueDate ?? 'sin fecha'}, responsable ${owner}${task.dependsOn.length ? `, depende de ${task.dependsOn.join(', ')}` : ''}`;
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
${openTasks.map((t) => fmtTask(t, members)).join('\n') || '(ninguna)'}

## Equipo
${members.map((m) => `- ${m.displayName} — ${m.membership.roleTitle}: ${m.membership.roleDescription || 'sin descripción'}`).join('\n')}

## Señales calculadas hoy (${signals.length})
${signals.map(fmtSignal).join('\n') || '(ninguna)'}

Escribí el briefing ejecutivo de hoy: un resumen de un párrafo, los tres riesgos que más pesan, las decisiones pendientes, y una lectura breve desde cada perspectiva (ceo, coo, cto, cfo, pm).`;
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
  const mine = tasks.filter((t) => t.assigneeUserId === member.id && t.status !== 'done');
  const myProjects = projects.filter(
    (p) => p.ownerUserId === member.id || p.memberUserIds.includes(member.id),
  );

  return `# Plan de hoy para ${member.displayName} — ${todayIso}

## Su rol en ${company.name}
${member.membership.roleTitle}: ${member.membership.roleDescription || 'sin descripción'}

## Meta global
${company.northStar}

## Briefing de la empresa hoy
${briefing}

## Objetivos
${objectives.map((o) => fmtObjective(o, today)).join('\n') || '(ninguno)'}

## Sus proyectos
${myProjects.map((p) => fmtProject(p, objectives)).join('\n') || '(ninguno)'}

## Sus tareas abiertas (${mine.length})
${mine.map((t) => fmtTask(t, ctx.members)).join('\n') || '(ninguna)'}

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
