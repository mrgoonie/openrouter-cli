/**
 * Zod schemas for OpenRouter API response shapes.
 * All object schemas use .passthrough() for forward compatibility with new fields.
 * Split into sub-files if this exceeds 200 lines.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

export const ChatMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string(), z.array(z.unknown())]),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatChoiceSchema = z
  .object({
    index: z.number().optional(),
    message: ChatMessageSchema.optional(),
    finish_reason: z.string().nullable().optional(),
    delta: z.unknown().optional(),
  })
  .passthrough();
export type ChatChoice = z.infer<typeof ChatChoiceSchema>;

export const ChatCompletionResponseSchema = z
  .object({
    id: z.string().optional(),
    object: z.string().optional(),
    created: z.number().optional(),
    model: z.string().optional(),
    choices: z.array(ChatChoiceSchema),
    usage: z.unknown().optional(),
  })
  .passthrough();
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

export const ChatCompletionChunkSchema = z
  .object({
    id: z.string().optional(),
    object: z.string().optional(),
    created: z.number().optional(),
    model: z.string().optional(),
    choices: z.array(ChatChoiceSchema),
  })
  .passthrough();
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;

/** Request schema for POST /chat/completions — passthrough so extra fields are forwarded. */
export const ChatCompletionRequestSchema = z
  .object({
    model: z.string(),
    messages: z.array(z.unknown()),
    stream: z.boolean().optional(),
  })
  .passthrough();
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

/** Delta in a streaming chunk choice. */
export const StreamDeltaSchema = z
  .object({
    role: z.string().optional(),
    content: z.string().nullable().optional(),
    tool_calls: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type StreamDelta = z.infer<typeof StreamDeltaSchema>;

/** Choice within a streaming chunk. */
export const StreamChoiceSchema = z
  .object({
    index: z.number().optional(),
    delta: StreamDeltaSchema,
    finish_reason: z.string().nullable().optional(),
  })
  .passthrough();
export type StreamChoice = z.infer<typeof StreamChoiceSchema>;

/** A single SSE chunk from the /chat/completions streaming endpoint. */
export const ChatCompletionStreamChunkSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    choices: z.array(StreamChoiceSchema),
    usage: z.unknown().optional(),
  })
  .passthrough();
export type ChatCompletionStreamChunk = z.infer<typeof ChatCompletionStreamChunkSchema>;

/** OpenAI-compatible tool definition. */
export const ToolSchema = z
  .object({
    type: z.literal('function'),
    function: z
      .object({
        name: z.string(),
        description: z.string().optional(),
        parameters: z.unknown().optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type Tool = z.infer<typeof ToolSchema>;

// ---------------------------------------------------------------------------
// Responses API (Beta)
// ---------------------------------------------------------------------------

/** Request schema for POST /responses. */
export const ResponsesRequestSchema = z
  .object({
    model: z.string(),
    input: z.array(z.unknown()),
  })
  .passthrough();
export type ResponsesRequest = z.infer<typeof ResponsesRequestSchema>;

/** Response shape from POST /responses. */
export const ResponsesResponseSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    output: z.array(z.unknown()).optional(),
    usage: z.unknown().optional(),
    reasoning_details: z.unknown().optional(),
  })
  .passthrough();
export type ResponsesResponse = z.infer<typeof ResponsesResponseSchema>;

/** A single SSE chunk from the /responses streaming endpoint. */
export const ResponsesStreamChunkSchema = z
  .object({
    type: z.string().optional(),
    delta: z.unknown().optional(),
    usage: z.unknown().optional(),
  })
  .passthrough();
export type ResponsesStreamChunk = z.infer<typeof ResponsesStreamChunkSchema>;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const ModelSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    context_length: z.number().optional(),
    pricing: z
      .object({
        prompt: z.string().optional(),
        completion: z.string().optional(),
        image: z.string().optional(),
        request: z.string().optional(),
      })
      .passthrough()
      .optional(),
    architecture: z
      .object({
        modality: z.string().optional(),
        tokenizer: z.string().optional(),
        instruct_type: z.string().nullable().optional(),
      })
      .passthrough()
      .optional(),
    top_provider: z
      .object({
        max_completion_tokens: z.number().nullable().optional(),
        is_moderated: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Model = z.infer<typeof ModelSchema>;

// ---------------------------------------------------------------------------
// Models — list + endpoints response wrappers
// ---------------------------------------------------------------------------

export const ModelListResponseSchema = z
  .object({
    data: z.array(ModelSchema),
  })
  .passthrough();
export type ModelListResponse = z.infer<typeof ModelListResponseSchema>;

/** Endpoint entry within GET /models/{author}/{slug}/endpoints */
export const ModelEndpointSchema = z
  .object({
    name: z.string().optional(),
    context_length: z.number().optional(),
    pricing: z
      .object({
        prompt: z.string().optional(),
        completion: z.string().optional(),
      })
      .passthrough()
      .optional(),
    uptime_last_30d: z.number().optional(),
  })
  .passthrough();
export type ModelEndpoint = z.infer<typeof ModelEndpointSchema>;

export const ModelEndpointsResponseSchema = z
  .object({
    data: z
      .object({
        id: z.string().optional(),
        endpoints: z.array(ModelEndpointSchema).optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type ModelEndpointsResponse = z.infer<typeof ModelEndpointsResponseSchema>;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const ProviderSchema = z
  .object({
    slug: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    models_count: z.number().optional(),
  })
  .passthrough();
export type Provider = z.infer<typeof ProviderSchema>;

export const ProviderListSchema = z
  .object({
    data: z.array(ProviderSchema),
  })
  .passthrough();
export type ProviderList = z.infer<typeof ProviderListSchema>;

// ---------------------------------------------------------------------------
// Generations
// ---------------------------------------------------------------------------

export const GenerationSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    tokens_prompt: z.number().optional(),
    tokens_completion: z.number().optional(),
    native_tokens_prompt: z.number().nullable().optional(),
    native_tokens_completion: z.number().nullable().optional(),
    total_cost: z.number().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
export type Generation = z.infer<typeof GenerationSchema>;

export const GenerationDetailSchema = z
  .object({
    data: GenerationSchema,
  })
  .passthrough();
export type GenerationDetail = z.infer<typeof GenerationDetailSchema>;

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export const CreditsResponseSchema = z
  .object({
    data: z
      .object({
        total_credits: z.number(),
        total_usage: z.number(),
      })
      .passthrough(),
  })
  .passthrough();
export type CreditsResponse = z.infer<typeof CreditsResponseSchema>;

// ---------------------------------------------------------------------------
// Video jobs
// ---------------------------------------------------------------------------

export const VideoStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
export type VideoStatus = z.infer<typeof VideoStatusSchema>;

export const VideoJobSchema = z
  .object({
    id: z.string(),
    status: VideoStatusSchema,
    polling_url: z.string().optional(),
    unsigned_urls: z.array(z.string()).optional(),
    created_at: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();
export type VideoJob = z.infer<typeof VideoJobSchema>;

/** Request body schema for POST /videos — passthrough for extra provider-specific fields. */
export const VideoCreateRequestSchema = z
  .object({
    prompt: z.string(),
    model: z.string(),
    aspect_ratio: z.string().optional(),
    duration: z.number().optional(),
    resolution: z.string().optional(),
    size: z.string().optional(),
    frame_images: z.array(z.string()).optional(),
    generate_audio: z.boolean().optional(),
    provider: z.unknown().optional(),
  })
  .passthrough();
export type VideoCreateRequest = z.infer<typeof VideoCreateRequestSchema>;

/** Response shape for POST /videos (202 Accepted). */
export const VideoCreateResponseSchema = z
  .object({
    data: VideoJobSchema,
  })
  .passthrough();
export type VideoCreateResponse = z.infer<typeof VideoCreateResponseSchema>;

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const ApiKeySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    usage: z.number().optional(),
    limit: z.number().nullable().optional(),
    expires_at: z.string().nullable().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
export type ApiKey = z.infer<typeof ApiKeySchema>;

/** Full API key object returned by management endpoints (includes one-time `key` field on create). */
export const ApiKeyObjectSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    usage: z.number().optional(),
    limit: z.number().nullable().optional(),
    expires_at: z.string().nullable().optional(),
    created_at: z.string().optional(),
    /** Only present immediately after creation — shown once. */
    key: z.string().optional(),
    hash: z.string().optional(),
  })
  .passthrough();
export type ApiKeyObject = z.infer<typeof ApiKeyObjectSchema>;

/** Request body for POST /keys. */
export const CreateKeyRequestSchema = z
  .object({
    name: z.string(),
    expires_at: z.string().optional(),
    limit: z.number().optional(),
    limit_reset: z.enum(['daily', 'weekly', 'monthly']).optional(),
  })
  .passthrough();
export type CreateKeyRequest = z.infer<typeof CreateKeyRequestSchema>;

/** Response envelope for GET /keys. */
export const KeyListResponseSchema = z
  .object({
    data: z.array(ApiKeyObjectSchema),
  })
  .passthrough();
export type KeyListResponse = z.infer<typeof KeyListResponseSchema>;

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export const GuardrailSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();
export type Guardrail = z.infer<typeof GuardrailSchema>;

/** Assignments returned by GET /guardrails/{id}/member-assignments. */
export const GuardrailAssignmentsSchema = z.unknown().transform((v) => v);
export type GuardrailAssignments = unknown;

// ---------------------------------------------------------------------------
// Org members
// ---------------------------------------------------------------------------

export const OrgMemberSchema = z
  .object({
    id: z.string().optional(),
    email: z.string().optional(),
    name: z.string().optional(),
    role: z.string().optional(),
    joined_at: z.string().optional(),
  })
  .passthrough();
export type OrgMember = z.infer<typeof OrgMemberSchema>;

/** Response envelope for GET /organization/members. */
export const OrgMembersResponseSchema = z
  .object({
    data: z.array(OrgMemberSchema),
  })
  .passthrough();
export type OrgMembersResponse = z.infer<typeof OrgMembersResponseSchema>;

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const ActivityRowSchema = z
  .object({
    endpoint: z.string().optional(),
    requests: z.number().optional(),
    tokens: z.number().optional(),
    cost: z.number().optional(),
  })
  .passthrough();
export type ActivityRow = z.infer<typeof ActivityRowSchema>;

export const ActivityResponseSchema = z
  .object({
    data: z.array(ActivityRowSchema),
  })
  .passthrough();
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

export const EmbeddingRequestSchema = z
  .object({
    model: z.string(),
    input: z.union([z.string(), z.array(z.string())]),
    dimensions: z.number().optional(),
    encoding_format: z.enum(['float', 'base64']).optional(),
    input_type: z.string().optional(),
    provider: z.unknown().optional(),
  })
  .passthrough();
export type EmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;

export const EmbeddingObjectSchema = z
  .object({
    object: z.literal('embedding'),
    embedding: z.union([z.array(z.number()), z.string()]),
    index: z.number(),
  })
  .passthrough();
export type EmbeddingObject = z.infer<typeof EmbeddingObjectSchema>;

export const EmbeddingResponseSchema = z
  .object({
    data: z.array(EmbeddingObjectSchema),
    usage: z
      .object({
        prompt_tokens: z.number(),
        total_tokens: z.number(),
        cost: z.number().optional(),
      })
      .passthrough(),
    model: z.string(),
  })
  .passthrough();
export type EmbeddingResponse = z.infer<typeof EmbeddingResponseSchema>;

// ---------------------------------------------------------------------------
// Rerank
// ---------------------------------------------------------------------------

export const RerankRequestSchema = z
  .object({
    model: z.string(),
    query: z.string(),
    documents: z.array(z.string()),
    top_n: z.number().optional(),
    provider: z.unknown().optional(),
  })
  .passthrough();
export type RerankRequest = z.infer<typeof RerankRequestSchema>;

export const RerankResultSchema = z
  .object({
    index: z.number(),
    relevance_score: z.number(),
    document: z
      .object({
        text: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type RerankResult = z.infer<typeof RerankResultSchema>;

export const RerankResponseSchema = z
  .object({
    results: z.array(RerankResultSchema),
    model: z.string(),
    usage: z.unknown().optional(),
  })
  .passthrough();
export type RerankResponse = z.infer<typeof RerankResponseSchema>;
