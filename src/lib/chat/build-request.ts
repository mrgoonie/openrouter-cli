/**
 * Pure builder for /chat/completions and /responses request bodies.
 * Loads JSON files referenced by --tools / --response-format / --provider / --plugins,
 * validates them via zod, and assembles the API body with correct snake_case field names.
 * No network calls — purely synchronous transformation + file I/O.
 */

import { z } from 'zod';
import { CliError } from '../errors/exit-codes.ts';
import { ToolSchema } from '../types/openrouter.ts';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type BuildChatRequestArgs = {
  message: string;
  system?: string;
  model: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  /** Path to a JSON file containing an array of OpenAI tool definitions. */
  tools?: string;
  /** Path to a JSON file containing a response_format object. */
  responseFormat?: string;
  /** Path to a JSON file containing provider routing preferences. */
  provider?: string;
  /** Path to a JSON file containing plugins config. */
  plugins?: string;
};

// ---------------------------------------------------------------------------
// File-loading helpers
// ---------------------------------------------------------------------------

/** Read and JSON-parse a file, throw CliError on failure. */
async function readJsonFile(filePath: string, flagName: string): Promise<unknown> {
  try {
    return await Bun.file(filePath).json();
  } catch (err) {
    throw new CliError(
      'usage',
      `Failed to read ${flagName} file: ${filePath}`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Validate tools array — each item must match ToolSchema. */
function validateTools(raw: unknown, filePath: string): unknown[] {
  const arrResult = z.array(z.unknown()).safeParse(raw);
  if (!arrResult.success) {
    throw new CliError('usage', `--tools file must be a JSON array: ${filePath}`);
  }
  const validated: unknown[] = [];
  for (const item of arrResult.data) {
    const result = ToolSchema.safeParse(item);
    if (!result.success) {
      throw new CliError(
        'usage',
        `Invalid tool definition in ${filePath}: ${result.error.message}`,
        'Each tool must have type:"function" and a function.name',
      );
    }
    validated.push(result.data);
  }
  return validated;
}

/** Validate response_format — must be an object. */
function validateResponseFormat(raw: unknown, filePath: string): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('usage', `--response-format file must be a JSON object: ${filePath}`);
  }
  return raw;
}

/** Validate provider — must be an object. */
function validateProvider(raw: unknown, filePath: string): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('usage', `--provider file must be a JSON object: ${filePath}`);
  }
  return raw;
}

/** Validate plugins — must be an array. */
function validatePlugins(raw: unknown, filePath: string): unknown[] {
  const result = z.array(z.unknown()).safeParse(raw);
  if (!result.success) {
    throw new CliError('usage', `--plugins file must be a JSON array: ${filePath}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export type ChatRequestBody = {
  body: Record<string, unknown>;
};

/**
 * Build the request body for POST /chat/completions.
 * Loads and validates any file-referenced flags.
 * Returns {body} — the caller adds auth headers via the client.
 */
export async function buildChatRequest(args: BuildChatRequestArgs): Promise<ChatRequestBody> {
  // Build messages array
  const messages: Array<{ role: string; content: string }> = [];
  if (args.system) {
    messages.push({ role: 'system', content: args.system });
  }
  messages.push({ role: 'user', content: args.message });

  // Assemble body — snake_case per API spec
  const body: Record<string, unknown> = {
    model: args.model,
    messages,
  };

  if (args.stream !== undefined) body.stream = args.stream;
  if (args.temperature !== undefined) body.temperature = args.temperature;
  if (args.maxTokens !== undefined) body.max_tokens = args.maxTokens;
  if (args.topP !== undefined) body.top_p = args.topP;
  if (args.frequencyPenalty !== undefined) body.frequency_penalty = args.frequencyPenalty;
  if (args.presencePenalty !== undefined) body.presence_penalty = args.presencePenalty;
  if (args.stop && args.stop.length > 0) body.stop = args.stop;

  // File-referenced flags — load, parse, validate
  if (args.tools) {
    const raw = await readJsonFile(args.tools, '--tools');
    body.tools = validateTools(raw, args.tools);
  }

  if (args.responseFormat) {
    const raw = await readJsonFile(args.responseFormat, '--response-format');
    body.response_format = validateResponseFormat(raw, args.responseFormat);
  }

  if (args.provider) {
    const raw = await readJsonFile(args.provider, '--provider');
    body.provider = validateProvider(raw, args.provider);
  }

  if (args.plugins) {
    const raw = await readJsonFile(args.plugins, '--plugins');
    body.plugins = validatePlugins(raw, args.plugins);
  }

  return { body };
}
