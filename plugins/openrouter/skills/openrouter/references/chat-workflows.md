# Chat workflows

## Single-turn (stateless)

```bash
openrouter chat send "What is the capital of France?" \
  --model openai/gpt-4o --json --no-stream
```

Extract: `jq -r '.data.choices[0].message.content'`

## System prompt + user message

```bash
openrouter chat send "Translate to French: Hello" \
  --system "You are a precise translator. Reply with the translation only." \
  --model openai/gpt-4o --json --no-stream
```

## Stdin (large context)

```bash
cat report.md | openrouter chat send "Summarize in 5 bullets." \
  --model anthropic/claude-3.5-sonnet --json --no-stream
```

## Multi-turn

CLI is stateless. Agent maintains the transcript and sends it each turn via heredoc:

```bash
TRANSCRIPT='[
  {"role":"system","content":"You are a helpful assistant."},
  {"role":"user","content":"What is Bun?"},
  {"role":"assistant","content":"Bun is a JS runtime."},
  {"role":"user","content":"How is it different from Node?"}
]'

openrouter chat send --messages-json "$TRANSCRIPT" \
  --model openai/gpt-4o --json --no-stream
```

(Use `--messages-json` if present in your CLI version; otherwise concatenate turns into a single prompt.)

## Tool / function calling

Define tools via `--tools-json` (JSON schema array). Model returns `tool_call` deltas in NDJSON:

```bash
TOOLS='[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}]'
openrouter chat send "Weather in HCMC?" \
  --model openai/gpt-4o --tools-json "$TOOLS" --output ndjson
```

Agent loop:

1. Parse `tool_call` events.
2. Execute tool locally.
3. Send follow-up turn with `{"role":"tool","tool_call_id":"...","content":"..."}`.
4. Repeat until `finish_reason=stop`.

## Model fallback

OpenRouter supports provider fallback via `--models` (comma-separated slugs):

```bash
openrouter chat send "Hi" \
  --models "openai/gpt-4o,anthropic/claude-3.5-sonnet" \
  --json --no-stream
```

First available provider wins. `meta.model` tells you which served it.

## Cost control

- Use `--max-tokens` to cap output.
- Pick `:free` tagged models for experimentation: `meta-llama/llama-3.2-1b-instruct:free`.
- Check usage after each call: `.meta.usage.total_tokens`.
- Audit spend: `openrouter analytics show --json --from 2026-04-01`.

## Timeouts & long generations

Default 30s. For long answers:

```bash
openrouter chat send "Write a 2000-word essay on..." \
  --model openai/gpt-4o --timeout 120000 --output ndjson
```

Prefer NDJSON for long outputs — you see tokens as they arrive, avoiding perceived hangs.

## Idempotency for retries

CLI injects a client-side `Idempotency-Key` header on POST endpoints. Safe to retry exit 70/71 without duplicate billing within the 24h window.
