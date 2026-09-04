import 'server-only';

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Claude Code, invoked headless from the server.
 *
 * `claude -p` runs on the same machine as this process (ADR-005), signed in
 * with the subscription. It is given no tools and one turn: the server has
 * already read everything the model needs and put it in the prompt, so all
 * that is asked of the model is judgement, returned as JSON that matches a
 * schema. The schema is handed to Claude Code with `--json-schema` and the
 * reply is validated again with Zod, because a contract enforced once is a
 * contract enforced by hope.
 */

export interface ClaudeUsage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  model: string;
}

export interface ClaudeAnswer<T> {
  value: T;
  usage: ClaudeUsage;
  /** Every model the CLI billed for this call, as it reported them. */
  modelUsage: Record<string, unknown>;
}

export class ClaudeError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
    public readonly exitCode: number | null,
  ) {
    super(message);
    this.name = 'ClaudeError';
  }
}

/** The envelope `--output-format json` prints. Only what we read is typed. */
const envelope = z.object({
  type: z.string().optional(),
  is_error: z.boolean().optional(),
  result: z.unknown().optional(),
  structured_output: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The environment the child starts from.
 *
 * Anything that decides which model answers has to come from this module, not
 * from whatever the parent happened to inherit: a server started from inside
 * another Claude Code session picks up that session's model variables and the
 * engine silently answers with a different model than it was configured for.
 * The same goes for the markers that tell the CLI it is nested inside another
 * instance.
 */
const STRIPPED_EXACT = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'CLAUDECODE',
  'CLAUDE_CONFIG_DIR',
  'MAX_THINKING_TOKENS',
];

/**
 * Every CLAUDE_CODE_* variable goes too, as a family rather than a list. They
 * carry a parent session's identity — its id, its messaging socket, its
 * "this is a child session" marker — and a child that believes it is nested
 * inside another instance answers differently and ignores --model. That is
 * only reachable when the server itself was started from inside Claude Code,
 * which is exactly how it gets started during development.
 */
const STRIPPED_PREFIX = /^CLAUDE_CODE_/;

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of STRIPPED_EXACT) delete env[name];
  for (const name of Object.keys(env)) {
    if (STRIPPED_PREFIX.test(name)) delete env[name];
  }
  // With ENGINE_AUTH=subscription the child must not see an API key, or it
  // would bill the key instead of using the signed-in session.
  if ((process.env.ENGINE_AUTH ?? 'subscription') === 'subscription') {
    delete env.ANTHROPIC_API_KEY;
  }
  return env;
}

/**
 * Where the child runs. An empty directory of its own, so Claude Code does not
 * read this repository's CLAUDE.md or any project settings into the prompt:
 * the engine's context is exactly what the server puts on stdin.
 */
function workDir(): string {
  const dir = process.env.ENGINE_WORKDIR ?? join(tmpdir(), 'truenorth-engine');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Ask Claude Code a question and get back a value that matches `schema`.
 *
 * @param prompt   Everything the model needs, already assembled.
 * @param schema   The shape of the answer. Converted to JSON Schema for the CLI.
 * @param options  `system` is prepended as the system prompt; `timeoutMs`
 *                 defaults to five minutes, which a full company analysis can
 *                 approach on a Raspberry Pi.
 */
export async function askClaude<S extends z.ZodType>(
  prompt: string,
  schema: S,
  options: { system?: string; timeoutMs?: number; model?: string } = {},
): Promise<ClaudeAnswer<z.output<S>>> {
  const bin = process.env.CLAUDE_BIN ?? 'claude';
  const jsonSchema = JSON.stringify(toJsonSchema(schema));

  const args = [
    '-p',
    // Restricted mode ignores the user's settings files, which is what keeps a
    // personal SessionEnd hook from running inside the engine and failing the
    // run, and drops the tools the engine never wants anyway. Auth is
    // untouched, so the subscription still applies (unlike --bare, which
    // demands an API key).
    '--restricted',
    // No MCP servers either: none are configured for this and a server that
    // cannot connect only slows the child down.
    '--strict-mcp-config',
    '--output-format',
    'json',
    // No tools at all: the server already read everything the model needs, so
    // reaching for one only burns a turn. Without this the model would
    // occasionally try to go looking and hit the turn limit (error_max_turns).
    '--tools',
    '',
    '--json-schema',
    jsonSchema,
    // One turn is enough to answer; the margin is there so a stray tool attempt
    // costs a turn rather than the whole run.
    '--max-turns',
    '4',
  ];
  if (options.system) args.push('--system-prompt', options.system);
  const model = options.model ?? process.env.ENGINE_MODEL;
  if (model) args.push('--model', model);

  const env = childEnv();

  const started = Date.now();
  const { stdout, stderr, code } = await run(bin, args, prompt, env, options.timeoutMs);

  if (code !== 0) {
    // A non-zero exit often says nothing on stderr and explains itself in the
    // JSON envelope on stdout instead, so both are carried into the error.
    const explained = explain(stdout);
    throw new ClaudeError(
      explained ? `claude exited with ${code}: ${explained}` : `claude exited with ${code}`,
      stderr || stdout.slice(0, 2000),
      code,
    );
  }

  let parsed: z.infer<typeof envelope>;
  try {
    parsed = envelope.parse(JSON.parse(stdout));
  } catch (cause) {
    throw new ClaudeError(
      `claude returned something that is not the JSON envelope: ${String(cause)}`,
      stdout.slice(0, 2000),
      code,
    );
  }

  if (parsed.is_error) {
    throw new ClaudeError(
      `claude reported an error: ${String(parsed.result)}`,
      stderr,
      code,
    );
  }

  // Structured output lands in `structured_output` on current builds; older
  // ones put the JSON text in `result`. Accept either.
  const raw =
    parsed.structured_output !== undefined
      ? parsed.structured_output
      : typeof parsed.result === 'string'
        ? tryParse(parsed.result)
        : parsed.result;

  const checked = schema.safeParse(raw);
  if (!checked.success) {
    throw new ClaudeError(
      `claude's answer did not match the schema: ${checked.error.message}`,
      JSON.stringify(raw).slice(0, 2000),
      code,
    );
  }

  // `modelUsage` can list several models: the one that answered plus whatever
  // the CLI used for its own housekeeping. The answer is the expensive one, so
  // reporting the first key at random would misattribute the plan.
  const usedModel = pickModel(parsed.modelUsage) || model || '';

  return {
    value: checked.data,
    modelUsage: parsed.modelUsage ?? {},
    usage: {
      costUsd: parsed.total_cost_usd ?? 0,
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
      durationMs: parsed.duration_ms ?? Date.now() - started,
      model: usedModel,
    },
  };
}

/**
 * Claude Code checks the schema with a draft-07 validator and rejects the
 * 2020-12 `$schema` marker Zod 4 emits by default, so the schema is targeted
 * at draft-07 and the marker is dropped.
 */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<
    string,
    unknown
  >;
  return rest;
}

/** The model that did the work: the one that cost the most of those listed. */
function pickModel(usage: Record<string, unknown> | undefined): string {
  if (!usage) return '';
  let best = '';
  let bestCost = -1;
  for (const [name, value] of Object.entries(usage)) {
    const cost =
      value && typeof value === 'object' && typeof (value as { costUSD?: unknown }).costUSD === 'number'
        ? (value as { costUSD: number }).costUSD
        : 0;
    if (cost > bestCost) {
      best = name;
      bestCost = cost;
    }
  }
  return best;
}

/** Pulls the human-readable reason out of whatever the CLI printed, if any. */
function explain(stdout: string): string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const reason = record.result ?? record.error ?? record.subtype;
      if (typeof reason === 'string') return reason.slice(0, 500);
    }
  } catch {
    /* not JSON; fall through to the raw text */
  }
  return stdout.trim().slice(0, 500);
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Some builds wrap the JSON in a code fence; strip one if present.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        /* fall through */
      }
    }
    return text;
  }
}

function run(
  bin: string,
  args: string[],
  stdin: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: workDir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new ClaudeError(`claude did not answer within ${timeoutMs} ms`, stderr, null));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (cause) => {
      clearTimeout(timer);
      reject(new ClaudeError(`could not start ${bin}: ${cause.message}`, '', null));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}
