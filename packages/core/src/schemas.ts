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
export type CompanyAnalysisOutput = z.infer<typeof companyAnalysisSchema>;
export type VoiceInterpretationOutput = z.infer<typeof voiceInterpretationSchema>;
