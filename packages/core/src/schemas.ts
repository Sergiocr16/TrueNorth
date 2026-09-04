import { z } from 'zod';

/**
 * Output contracts for the engine. Claude Code is invoked headless with
 * `--json-schema` built from these, and the result is validated again with Zod
 * before anything is written. A change here is a change to the worker, the API
 * fallback and the UI at once, so it needs an ADR.
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

/* ------------------------------------------------------------------ */
/* Team follow-up                                                      */
/* ------------------------------------------------------------------ */

/** One person, read against what is expected of them. Produced for everybody. */
export const teamReadingSchema = z.object({
  userId: z.string(),
  standing: z.enum(['adelantado', 'en_curso', 'atrasado', 'trabado']),
  /** Two or three sentences on how they are doing. */
  reading: z.string().min(20).max(600),
  /** What the manager should do about it. */
  recommendation: z.string().min(10).max(400),
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
  /** Ready to copy: Costa Rican Spanish, second person, no filler. */
  message: z.string().min(20).max(700),
  /** Why it is being sent. The manager reads this; the person never does. */
  why: z.string().min(3).max(280),
  ask: z.string().max(200),
  /** A message always rests on a signal. A reading may not; this must. */
  signalIds: z.array(z.string()).min(1),
  escalate: z.boolean().default(false),
});

export const teamFollowUpSchema = z.object({
  readings: z.array(teamReadingSchema).max(20),
  messages: z.array(followUpSchema).max(10),
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

export type DailyPlanOutput = z.infer<typeof dailyPlanSchema>;
export type TeamReadingOutput = z.infer<typeof teamReadingSchema>;
export type FollowUpOutput = z.infer<typeof followUpSchema>;
export type TeamFollowUpOutput = z.infer<typeof teamFollowUpSchema>;
export type CompanyAnalysisOutput = z.infer<typeof companyAnalysisSchema>;
export type VoiceInterpretationOutput = z.infer<typeof voiceInterpretationSchema>;
