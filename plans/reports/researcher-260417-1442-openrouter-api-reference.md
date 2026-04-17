# OpenRouter API Reference for CLI Development

**Date:** 2026-04-17 | **Status:** Complete | **Source:** openrouter.ai/docs

## Overview

**Base URL:** `https://openrouter.ai/api/v1`

**Auth Methods:**
- **User/Provisioning Key:** `Authorization: Bearer <API_KEY>` (standard API calls, chat, embeddings, etc.)
- **Management Key:** `Authorization: Bearer <MGMT_KEY>` (org admin: keys, guardrails, credits, members, analytics)
- **OAuth PKCE:** See section 11

---

## 1. API Reference (Overview & Streaming)

| Aspect | Details |
|--------|---------|
| **Base URL** | `https://openrouter.ai/api/v1` |
| **Rate Limits** | Per docs: manage via key credit limits; 429 returned on exceed |
| **Streaming (SSE)** | Set `stream: true` in request body; response format: `data: {JSON}\n\n` |
| **Stream Terminator** | `data: [DONE]` |
| **SSE Comments** | Ignored keep-alives (`: OPENROUTER PROCESSING`); safe to discard |
| **Generation ID** | Returned in response header `X-Generation-Id` for all endpoints |

---

## 2. Analytics

| Field | Value |
|-------|-------|
| **Path** | `/activity` |
| **Method** | `GET` |
| **Auth** | Management key (Bearer) |
| **Params** | `date` (YYYY-MM-DD), `api_key_hash` (SHA-256 hex), `user_id` (org member) |
| **Response** | Activity grouped by endpoint (last 30 completed UTC days) |

---

## 3. APIKeys (CRUD)

| Operation | Path | Method | Auth | Notes |
|-----------|------|--------|------|-------|
| **Create** | `/keys` | POST | Mgmt | Required: `name`; Opt: `expires_at`, `limit`, `limit_reset` (daily/weekly/monthly) |
| **List** | `/keys` | GET | Mgmt | Returns all keys with usage metrics |
| **Get** | `/keys/{key_id}` | GET | Mgmt | Fetch single key metadata |
| **Update** | `/keys/{key_id}` | PATCH | Mgmt | Patch `limit`, `expires_at`, `name`, etc. |
| **Delete** | `/keys/{key_id}` | DELETE | Mgmt | Revoke key immediately |

**Response:** API key object with `key` string (shown only on create), `usage`, `limit`, `expires_at`, `created_at`.

---

## 4. Chat Completions

| Field | Value |
|-------|-------|
| **Path** | `/chat/completions` |
| **Method** | `POST` |
| **Auth** | User/Provisioning key (Bearer) |
| **Streaming** | Set `stream: true` for SSE response |
| **Required** | `messages` (array), `model` (string) |
| **Optional** | `temperature` (0–2), `max_tokens`, `top_p` (0–1), `frequency_penalty`/`presence_penalty` (-2–2), `tools` (fn defs), `response_format`, `stop` (≤4), `provider`, `plugins` |
| **Response** | `id`, `object`, `created`, `model`, `choices` (with `message` or `delta`), `usage` |
| **Finish Reason** | `stop`, `length`, `tool_calls`, `content_filter`, `error` |
| **Error Codes** | 400 (params), 401 (auth), 402 (credits), 429 (rate limit), 500+ |

---

## 5. Credits

| Field | Value |
|-------|-------|
| **Path** | `/credits` |
| **Method** | `GET` |
| **Auth** | Management key (Bearer) |
| **Response** | `total_credits_purchased` (decimal), `total_credits_used` (decimal) |

---

## 6. Embeddings

| Field | Value |
|-------|-------|
| **Path** | `/embeddings` |
| **Method** | `POST` |
| **Auth** | User/Provisioning key (Bearer) |
| **Required** | `input` (text/tokens/multimodal), `model` (string) |
| **Optional** | `dimensions` (int), `encoding_format` (float/base64), `input_type`, `provider` |
| **Response** | `data` (array of embedding objects), `id`, `model`, `usage` (with `cost`), `object: "list"` |

---

## 7. Endpoints (Model-Specific)

| Field | Value |
|-------|-------|
| **Path** | `/models/{author}/{slug}/endpoints` |
| **Method** | `GET` |
| **Auth** | User/Provisioning key (Bearer) |
| **Params** | `author` (path), `slug` (path) |
| **Response** | Model architecture, available endpoints, pricing, latency, uptime, supported parameters |

---

## 8. Generations (Fetch by ID)

| Field | Value |
|-------|-------|
| **Path** | `/generation` |
| **Method** | `GET` |
| **Auth** | User/Provisioning key (Bearer) |
| **Params** | `id` (query, required) — generation ID |
| **Response** | Comprehensive metadata: `id`, `model`, `provider_name`, `tokens_prompt`, `tokens_completion`, `total_cost`, `latency`, `created_at`, `finish_reason`, `provider_responses` (fallback attempts), `cached_tokens`, `reasoning_tokens`, `web_search_engine` |
| **Error Codes** | 401, 402, 404 (not found), 429, 500+ |

---

## 9. Guardrails (CRUD + Member Assignments)

| Operation | Path | Method | Auth | Notes |
|-----------|------|--------|------|-------|
| **List** | `/guardrails` | GET | Mgmt | Returns all org guardrails |
| **Create** | `/guardrails` | POST | Mgmt | Spending limits, model restrictions, provider filters |
| **Get** | `/guardrails/{id}` | GET | Mgmt | Single guardrail details |
| **Update** | `/guardrails/{id}` | PATCH | Mgmt | Modify spending, restrictions |
| **Delete** | `/guardrails/{id}` | DELETE | Mgmt | Remove guardrail |
| **List Assignments** | `/guardrails/{id}/member-assignments` | GET | Mgmt | Members assigned to guardrail |
| **Bulk Assign Keys** | `/guardrails/{id}/keys/assign` | POST | Mgmt | `keys` (array) |
| **Bulk Assign Members** | `/guardrails/{id}/members/assign` | POST | Mgmt | `user_ids` (array) |

---

## 10. Models

| Field | Value |
|-------|-------|
| **Path** | `/models` |
| **Method** | `GET` |
| **Auth** | User/Provisioning key (Bearer) |
| **Optional Params** | `category`, `supported_parameters`, `output_modalities`, `use_rss`, `use_rss_chat_links` |
| **Response** | `data` (array): `id`, `name`, `canonical_slug`, `description`, `context_length`, `knowledge_cutoff`, `pricing` (prompt/completion), `architecture`, `supported_parameters`, `top_provider`, `links` |

---

## 11. OAuth (PKCE Flow)

**Flow Steps:**
1. Generate `code_verifier` (random string)
2. Hash verifier: `code_challenge = base64url(sha256(code_verifier))`
3. **Redirect to:** `https://openrouter.ai/auth?callback_url={YOUR_URL}&code_challenge={CHALLENGE}&code_challenge_method=S256`
4. User logs in & authorizes; redirected to `{callback_url}?code={AUTH_CODE}`
5. **POST to:** `https://openrouter.ai/api/v1/auth/keys` with:
   - Header: `Authorization: Bearer <user_api_key>` (if user already has key) OR body with OAuth code
   - Body: `code`, `code_verifier`, `code_challenge_method`
6. Response: `data` with `id` (API key), `app_id`, `created_at`

**Notes:**
- Only HTTPS on ports 443 & 3000 allowed for `callback_url`
- S256 recommended over plain text
- Alternative endpoints: `/auth/keys/code` (POST) to create auth code programmatically

---

## 12. Organization

| Field | Value |
|-------|-------|
| **Path** | `/organization/members` |
| **Method** | `GET` |
| **Auth** | Management key (Bearer) |
| **Response** | List of org members with `user_id`, `email`, `name`, `created_at`, `role` |

---

## 13. Providers

| Field | Value |
|-------|-------|
| **Path** | `/providers` |
| **Method** | `GET` |
| **Auth** | User/Provisioning key (Bearer) |
| **Response** | Array: `id`, `name`, `status`, `url`, `models_count`, `capabilities` |

---

## 14. Rerank

| Field | Value |
|-------|-------|
| **Path** | `/rerank` |
| **Method** | `POST` |
| **Auth** | User/Provisioning key (Bearer) |
| **Required** | `documents` (array of strings), `query` (string), `model` (string) |
| **Optional** | `top_n` (int), `provider` (routing prefs) |
| **Response** | `id` (ORID), `model`, `provider`, `results` (array: `document`, `index`, `relevance_score`), `usage` (cost, search_units, total_tokens) |

---

## 15. Beta.Responses (OpenAI-Compatible)

| Field | Value |
|-------|-------|
| **Path** | `/responses` (beta) |
| **Method** | `POST` |
| **Auth** | User/Provisioning key (Bearer) |
| **Streaming** | Set `stream: true` for SSE |
| **Special Params** | `reasoning` (enable reasoning mode), `tools` (function calling), `web_search` (enable search) |
| **Response** | `reasoning_details` (array of reasoning chains if enabled), `choices` with message/delta, `usage` |
| **Notes** | Beta API; may have breaking changes. Drop-in OpenAI Responses API replacement. |

---

## 16. VideoGeneration

| Field | Value |
|-------|-------|
| **Path** | `/videos` |
| **Method** | `POST` |
| **Auth** | User/Provisioning key (Bearer) |
| **Status Code** | `202 Accepted` (async job) |
| **Required** | `model` (string), `prompt` (string) |
| **Optional** | `aspect_ratio` (16:9/9:16/1:1/4:3/3:4/21:9/9:21), `duration` (seconds), `resolution` (480p/720p/1080p/1K/2K/4K), `size` (WIDTHxHEIGHT), `frame_images` (array), `generate_audio` (bool), `provider` |
| **Response** | `id` (job ID), `polling_url` (status check endpoint), `status` (pending/in_progress/completed/failed/cancelled/expired), `generation_id`, `unsigned_urls` (on completion), `usage` (cost) |
| **Polling** | Use `polling_url` from initial response to check async job status |

---

## Summary: Auth Hierarchy

| Key Type | Endpoints | Use Case |
|----------|-----------|----------|
| **API Key** | Chat, embeddings, rerank, models, providers, generations, OAuth | User-facing requests |
| **Provisioning Key** | Same as API Key but issued programmatically | App-to-app requests |
| **Management Key** | Keys, guardrails, org, analytics, credits | Admin/org control |

---

## Unresolved Questions

1. **Key expiration grace period:** Is there a buffer between `expires_at` and actual key revocation?
2. **Analytics lookback:** Hardcoded to 30 UTC days—configurable?
3. **Generation ID retention:** How long are generation records queryable via `/generation?id=`?
4. **Video polling timeout:** Max polling duration before job expires?
5. **Guardrail cascade:** When a guardrail is deleted, are assigned keys/members revoked immediately?
6. **OAuth scope:** Can PKCE flow request specific model access or is entire org key returned?
7. **Streaming cancellation refund:** If stream canceled mid-generation, are partial tokens refunded?
8. **Reasoning effort levels:** How are effort levels passed (param name/values not shown in beta docs)?

---

## Sources

- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
- [API Authentication](https://openrouter.ai/docs/api/reference/authentication)
- [Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)
- [Streaming Guide](https://openrouter.ai/docs/api/reference/streaming)
- [Models Endpoint](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [Embeddings](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings)
- [Rerank](https://openrouter.ai/docs/api/api-reference/rerank/create-rerank)
- [Analytics/Activity](https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity)
- [API Keys Management](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys)
- [Guardrails](https://openrouter.ai/docs/api/api-reference/guardrails/list-guardrails)
- [Generations by ID](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
- [Endpoints per Model](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints)
- [Organization Members](https://openrouter.ai/docs/guides/administration/organization-management)
- [Providers List](https://openrouter.ai/docs/api/api-reference/providers/list-providers)
- [OAuth PKCE Flow](https://openrouter.ai/docs/guides/overview/auth/oauth)
- [OAuth Auth Code Endpoint](https://openrouter.ai/docs/api/api-reference/o-auth/create-auth-keys-code)
- [Credits Endpoint](https://openrouter.ai/docs/api/api-reference/credits/get-credits)
- [Video Generation](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos)
- [Beta Responses API](https://openrouter.ai/docs/api/reference/responses/overview)
