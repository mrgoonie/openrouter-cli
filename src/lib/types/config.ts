/**
 * Zod schema for the TOML config file at $XDG_CONFIG_HOME/openrouter/config.toml.
 * Matches design-guidelines.md §10. All objects use .passthrough() for drift tolerance.
 */

import { z } from 'zod';

export const ConfigSchema = z
  .object({
    schema: z.number().optional(),
    auth: z
      .object({
        api_key: z.string().optional(),
        management_key: z.string().optional(),
        refresh_token: z.string().optional(),
        use_keychain: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    defaults: z
      .object({
        model: z.string().optional(),
        provider: z.string().optional(),
        output: z.enum(['pretty', 'json', 'ndjson', 'table', 'text', 'yaml', 'auto']).optional(),
        retries: z.number().int().min(0).optional(),
        timeout: z.union([z.string(), z.number()]).optional(),
        base_url: z.string().url().optional(),
      })
      .passthrough()
      .optional(),
    headers: z
      .object({
        http_referer: z.string().optional(),
        app_name: z.string().optional(),
      })
      .passthrough()
      .optional(),
    telemetry: z
      .object({
        enabled: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    video: z
      .object({
        poll_interval: z.string().optional(),
        wait_timeout: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type Config = z.infer<typeof ConfigSchema>;
