import { z } from 'zod';

/**
 * Output contracts for the engine. Claude Code is invoked headless with
 * `--json-schema` built from these, and the result is validated again with Zod
 * before anything is written. A change here is a change to the worker, the API
 * fallback and the UI at once, so it needs an ADR.
 *
 * Since ADR-012 there are two plan contracts, chosen in code by the character
 * of the day: the working-day plan below, and the rest-day plan after it.
 */

export const planItemSchema = z.object({
  title: z.string().min(3).max(120),
  why: z.string().min(3).max(280),
  objectiveId: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  estimatedMinutes: z.number().int().min(5).max(480),
  deadlineTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm')
    .optional(),
  signalIds: z.array(z.string()).min(1),
});

export const dailyPlanSchema = z.object({
  headline: z.string().min(3).max(160),
  why: z.string().min(3).max(400),
  items: z.array(planItemSchema).min(3).max(5),
  consequenceIfNotDone: z.string().min(3).max(280),
});

/**
 * A rest day (ADR-012): one to three optional suggestions of research or
 * improvement. No deadline, nothing owed, nothing longer than a couple of
 * hours. Every item is optional by definition, so the flag is stamped in
 * code rather than asked of the model.
 */
export const restDayPlanItemSchema = planItemSchema
  .omit({ deadlineTime: true })
  .extend({ estimatedMinutes: z.number().int().min(5).max(120) })
  .strict();

export const restDayPlanSchema = z.object({
  headline: z.string().min(3).max(160),
  why: z.string().min(3).max(400),
  items: z.array(restDayPlanItemSchema).min(1).max(3),
});

export const perspectiveSchema = z.object({
  key: z.enum(['ceo', 'coo', 'cto', 'cfo', 'pm']),
  reading: z.string().min(3).max(600),
});

export const companyAnalysisSchema = z.object({
  briefing: z.string().min(10).max(2000),
  topRisks: z.array(z.string()).min(1).max(3),
  pendingDecisions: z.array(z.string()).max(5),
  perspectives: z.array(perspectiveSchema).length(5),
});

/**
 * The morning call for one person in one role: their briefing and their plan
 * together, from the same context (ADR-008). Composes the two contracts above
 * rather than replacing them, so each keeps its own shape and its own ADR.
 */
export const personalBriefingSchema = z.object({
  analysis: companyAnalysisSchema,
  plan: dailyPlanSchema,
});

/** The same morning call on a rest day: the briefing still says where things stand; the plan is the light one. */
export const restDayBriefingSchema = z.object({
  analysis: companyAnalysisSchema,
  plan: restDayPlanSchema,
});

/* ------------------------------------------------------------------ */
/* Team follow-up                                                      */
/* ------------------------------------------------------------------ */

/** One person, read against what is expected of them. Produced for everybody. */
export const teamReadingSchema = z.object({
  userId: z.string(),
  standing: z.enum(['adelantado', 'en_curso', 'atrasado', 'trabado']),
  /** Two or three plain sentences on how they are doing. */
  reading: z.string().min(20).max(380),
  /** What the manager should do about it, in one sentence. */
  recommendation: z.string().min(10).max(220),
  /** May be empty: somebody on track has nothing to cite. */
  signalIds: z.array(z.string()),
});

/**
 * One suggested message. Produced only for the people who need one today.
 *
 * `target` is flat rather than a discriminated union because the model fills
 * this in through a JSON schema, and a flat enum plus an optional id is far
 * harder to get wrong than a tagged union. The pair is checked in code, where
 * the task id also has to resolve to a task the manager may actually see.
 */
export const followUpSchema = z.object({
  userId: z.string(),
  /** 'comentario' puts it on the Notion task named by `taskId`. */
  target: z.enum(['directo', 'comentario']),
  taskId: z.string().optional(),
  tone: z.enum(['reconocimiento', 'seguimiento', 'ajuste', 'apoyo', 'decision']),
  /** Ready to copy: Costa Rican Spanish, second person, two to four short sentences. */
  message: z.string().min(20).max(420),
  /** Why it is being sent, in one sentence. The manager reads this; the person never does. */
  why: z.string().min(3).max(200),
  ask: z.string().max(140),
  /** A message always rests on a signal. A reading may not; this must. */
  signalIds: z.array(z.string()).min(1),
  escalate: z.boolean().default(false),
});

export const teamFollowUpSchema = z.object({
  readings: z.array(teamReadingSchema).max(20),
  messages: z.array(followUpSchema).max(10),
});

/**
 * An answer to a question about the day. Short, and it cites what it rests on
 * so the screen can show the signals under it — same contract as a plan item,
 * except that a question with no signal behind the answer is still answered.
 */
export const askActionSchema = z.object({
  /** What the assistant proposes to do. `none` is the usual answer. */
  kind: z.enum(['none', 'situation', 'message', 'mark_sent', 'expectation', 'reminder']),
  /** The person it concerns, by userId, for everything but `none`. */
  userId: z.string().optional(),
  /** For `mark_sent`: the id of today's message being reported as sent. */
  messageId: z.string().optional(),
  /** The note, the message body, or the expectation sentence. */
  text: z.string().max(1400).optional(),
  situationKind: z.enum(['personal', 'carga', 'desempeno', 'salud', 'motivacion', 'otro']).optional(),
  discreet: z.boolean().optional(),
  /** YYYY-MM-DD, when the situation has an end. */
  endsAt: z.string().optional(),
  /** For `reminder`: the day and the wall-clock time (HH:mm) in Costa Rica, and how early to be told. */
  date: z.string().optional(),
  time: z.string().optional(),
  leadMinutes: z.number().int().optional(),
  /** One line saying what will happen, shown on the confirmation card. */
  summary: z.string().max(160).optional(),
});

export const askSchema = z.object({
  answer: z.string().min(1).max(1400),
  signalIds: z.array(z.string()).max(8),
  /** A question back, when the honest answer needs one. */
  followUp: z.string().max(200).optional(),
  /**
   * The assistant interprets; the app writes, and only after the person
   * confirms (ADR-004). So an action is a proposal, never a side effect.
   */
  action: askActionSchema.optional(),
});

export const interpretedChangeSchema = z.object({
  taskCode: z.string().optional(),
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  field: z.enum(['status', 'dueDate', 'note', 'assignee']),
  from: z.string(),
  to: z.string(),
  /** Must be a literal substring of the transcript, so the UI can show it. */
  quote: z.string().min(1),
});

export const voiceInterpretationSchema = z.object({
  changes: z.array(interpretedChangeSchema).max(12),
  /** Anything the model heard but could not map to a task. */
  unmatched: z.array(z.string()).max(5).default([]),
});

export type RestDayPlanOutput = z.infer<typeof restDayPlanSchema>;
export type RestDayBriefingOutput = z.infer<typeof restDayBriefingSchema>;
export type DailyPlanOutput = z.infer<typeof dailyPlanSchema>;
export type TeamReadingOutput = z.infer<typeof teamReadingSchema>;
export type FollowUpOutput = z.infer<typeof followUpSchema>;
export type TeamFollowUpOutput = z.infer<typeof teamFollowUpSchema>;
export type AskOutput = z.infer<typeof askSchema>;
export type AskAction = z.infer<typeof askActionSchema>;
export type CompanyAnalysisOutput = z.infer<typeof companyAnalysisSchema>;
export type PersonalBriefingOutput = z.infer<typeof personalBriefingSchema>;
export type VoiceInterpretationOutput = z.infer<typeof voiceInterpretationSchema>;
