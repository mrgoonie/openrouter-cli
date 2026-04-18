# Agent / JSON mode

## Envelope schema (v1)

Success:

```json
{
  "schema_version": "1",
  "success": true,
  "data": { /* command-specific payload */ },
  "error": null,
  "meta": {
    "request_id": "gen-01HXYZ...",
    "elapsed_ms": 312,
    "model": "openai/gpt-4o",
    "usage": { "prompt_tokens": 42, "completion_tokens": 128, "total_tokens": 170 }
  }
}
```

Failure:

```json
{
  "schema_version": "1",
  "success": false,
  "data": null,
  "error": { "code": "unauthorized", "message": "Invalid API key", "status": 401 },
  "meta": {}
}
```

Always branch on **both** `$?` (exit code) AND `success` field.

## Error codes (error.code values)

`unauthorized` `forbidden` `not_found` `insufficient_credits` `rate_limited`
`server_error` `timeout` `bad_request` `bad_response_shape` `video_failed`
`missing_api_key` `management_key_required`

Map to exit codes in main SKILL.md table.

## NDJSON streaming (`--output ndjson`)

One JSON object per line. Event types:

```jsonl
{"type":"start","request_id":"gen-...","model":"openai/gpt-4o"}
{"type":"delta","content":"Hel"}
{"type":"delta","content":"lo"}
{"type":"tool_call","id":"call_1","name":"get_weather","arguments":"{\"city\":\"HCMC\"}"}
{"type":"usage","prompt_tokens":12,"completion_tokens":34}
{"type":"end","finish_reason":"stop"}
{"type":"error","code":"rate_limited","message":"...","status":429}
```

Parser pattern (bash):

```bash
openrouter chat send "..." --model openai/gpt-4o --output ndjson \
  | while IFS= read -r line; do
      case "$(echo "$line" | jq -r .type)" in
        delta) echo -n "$(echo "$line" | jq -r .content)" ;;
        end)   echo ;;
        error) echo "ERR: $line" >&2 ;;
      esac
    done
```

## Piping input

Large inputs: use stdin, not positional args.

```bash
openrouter chat send "Summarize:" --model openai/gpt-4o --json --no-stream < big.txt
openrouter chat send "Translate" --model openai/gpt-4o --json --no-stream <<< "$PAYLOAD"
```

## Retry strategy

Client already retries on 429/5xx/network errors (3× exponential backoff). External retry loop should:

- **Never** retry exit 2, 64, 65, 66, 67, 68 (user-fixable).
- Retry exit 69, 70, 71 with jitter (the built-in retries exhausted).
- Cap total attempts at 5; escalate to user if still failing.

## Request tracing

`meta.request_id` from any response can be fed into:

```bash
openrouter generations get <request_id> --json
```

…to fetch cost, provider routing, and token counts after-the-fact.
