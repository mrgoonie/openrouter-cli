/**
 * Interactive model picker using @clack/prompts select.
 * Fetches /models once per session (memory cache), filters by substring match,
 * and presents a select list. Throws in non-TTY environments.
 */

import { select } from '@clack/prompts';
import { z } from 'zod';
import { request } from '../client/client.ts';
import { CliError } from '../errors/exit-codes.ts';
import { isNonInteractive } from '../output/tty.ts';
import { ModelSchema } from '../types/openrouter.ts';

// ---------------------------------------------------------------------------
// In-memory cache (per process session)
// ---------------------------------------------------------------------------

type CachedModel = { id: string; name: string };
let modelCache: CachedModel[] | null = null;

async function fetchModels(opts: { apiKey?: string; baseUrl?: string }): Promise<CachedModel[]> {
  if (modelCache) return modelCache;

  const result = await request<unknown>({
    path: '/models',
    method: 'GET',
    auth: 'user',
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });

  const listSchema = z.object({ data: z.array(z.unknown()) }).passthrough();
  const parsed = listSchema.safeParse(result.data);
  const rawItems = parsed.success
    ? parsed.data.data
    : Array.isArray(result.data)
      ? result.data
      : [];

  const models: CachedModel[] = [];
  for (const item of rawItems) {
    const m = ModelSchema.safeParse(item);
    if (m.success) {
      models.push({ id: m.data.id, name: m.data.name ?? m.data.id });
    }
  }

  modelCache = models;
  return models;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PickModelOpts = {
  apiKey?: string;
  baseUrl?: string;
  /** Case-insensitive substring filter applied to model id and name. */
  filter?: string;
  /** Category filter — currently applied as additional substring on model id. */
  category?: string;
};

/**
 * Present an interactive model selection prompt.
 * Returns the selected model id string.
 * Throws CliError('usage') when running in non-interactive / non-TTY mode.
 */
export async function pickModel(opts: PickModelOpts): Promise<string> {
  if (isNonInteractive()) {
    throw new CliError(
      'usage',
      'model required in non-interactive mode',
      'pass --model <id> or run in a TTY',
    );
  }

  const allModels = await fetchModels({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  // Apply filters — simple case-insensitive substring match
  let filtered = allModels;
  if (opts.filter) {
    const q = opts.filter.toLowerCase();
    filtered = filtered.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }
  if (opts.category) {
    const cat = opts.category.toLowerCase();
    filtered = filtered.filter((m) => m.id.toLowerCase().includes(cat));
  }

  if (filtered.length === 0) {
    throw new CliError(
      'not_found',
      'No models matched the filter',
      'Try a different --filter or --category value, or pass --model directly',
    );
  }

  const options = filtered.map((m) => ({
    value: m.id,
    label: `${m.id} — ${m.name}`,
  }));

  const selected = await select({
    message: 'Pick a model',
    options,
    initialValue: options[0]?.value,
  });

  // @clack/prompts returns a symbol when the user cancels (Ctrl+C)
  if (typeof selected === 'symbol') {
    process.exit(0);
  }

  return selected as string;
}

/** Reset the in-memory model cache (useful in tests). */
export function resetModelCache(): void {
  modelCache = null;
}
