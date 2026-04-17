/**
 * Local Bun HTTP mock server for E2E tests.
 * Serves canned JSON responses for all OpenRouter endpoints.
 * Supports control headers for error injection and latency simulation.
 *
 * Control headers:
 *   x-mock-status    — override response HTTP status code
 *   x-mock-delay-ms  — add artificial delay before responding
 *   x-mock-error     — inject an error body (json string)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dir, 'responses');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
}

// Video state machine: tracks poll count per job ID
const videoState = new Map<string, { polls: number }>();

export interface MockServer {
  url: string;
  stop: () => Promise<void>;
  reset: () => void;
}

type BunRequest = Request & { params?: Record<string, string> };

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i] ?? '';
    const ep = pathParts[i] ?? '';
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = ep;
    } else if (pp !== ep) {
      return null;
    }
  }
  return params;
}

async function handleRequest(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  // Control headers
  const mockStatus = req.headers.get('x-mock-status');
  const mockDelayMs = req.headers.get('x-mock-delay-ms');
  const mockError = req.headers.get('x-mock-error');

  if (mockDelayMs) {
    await Bun.sleep(Number(mockDelayMs));
  }

  // Error injection
  if (mockError) {
    const status = mockStatus ? Number(mockStatus) : 400;
    let errorBody: unknown;
    try {
      errorBody = JSON.parse(mockError);
    } catch {
      errorBody = { error: { message: mockError } };
    }
    return new Response(JSON.stringify(errorBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Status override (non-error path — used for simulating auth failures etc.)
  const overrideStatus = mockStatus ? Number(mockStatus) : undefined;
  if (overrideStatus && overrideStatus >= 400) {
    const statusMessages: Record<number, string> = {
      401: 'Unauthorized',
      402: 'Insufficient credits',
      403: 'Forbidden',
      404: 'Not found',
      429: 'Too many requests',
      500: 'Internal server error',
    };
    const msg = statusMessages[overrideStatus] ?? 'Error';
    return new Response(JSON.stringify({ error: { message: msg, code: overrideStatus } }), {
      status: overrideStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status: overrideStatus ?? status,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'mock-req-001' },
    });
  }

  // Route matching
  // GET /models
  if (method === 'GET' && pathname === '/models') {
    return json(fixture('models'));
  }

  // GET /models/:author/:slug/endpoints
  const modelEndpointsMatch = matchPath('/models/:author/:slug/endpoints', pathname);
  if (method === 'GET' && modelEndpointsMatch) {
    return json(fixture('model-endpoints'));
  }

  // GET /providers
  if (method === 'GET' && pathname === '/providers') {
    return json(fixture('providers'));
  }

  // POST /chat/completions — stream or non-stream
  if (method === 'POST' && pathname === '/chat/completions') {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // ignore parse errors
    }

    if (body.stream === true) {
      // SSE streaming response — 3 chunks + [DONE]
      const chunks = [
        {
          id: 'chatcmpl-stream-001',
          model: 'openai/gpt-4o',
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null },
          ],
        },
        {
          id: 'chatcmpl-stream-001',
          model: 'openai/gpt-4o',
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-stream-001',
          model: 'openai/gpt-4o',
          choices: [{ index: 0, delta: { content: '!' }, finish_reason: 'stop' }],
        },
      ];
      const sseBody = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`;
      return new Response(sseBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'x-request-id': 'mock-stream-001',
        },
      });
    }

    return json(fixture('chat-completion'));
  }

  // POST /responses
  if (method === 'POST' && pathname === '/responses') {
    return json(fixture('responses-api'));
  }

  // POST /embeddings
  if (method === 'POST' && pathname === '/embeddings') {
    return json(fixture('embeddings'));
  }

  // POST /rerank
  if (method === 'POST' && pathname === '/rerank') {
    return json(fixture('rerank'));
  }

  // GET /generation?id=... or /generation/:id
  if (method === 'GET' && pathname === '/generation') {
    return json(fixture('generation'));
  }
  const generationIdMatch = matchPath('/generation/:id', pathname);
  if (method === 'GET' && generationIdMatch) {
    return json(fixture('generation'));
  }

  // GET /credits
  if (method === 'GET' && pathname === '/credits') {
    return json(fixture('credits'));
  }

  // GET /activity
  if (method === 'GET' && pathname === '/activity') {
    return json(fixture('activity'));
  }

  // Keys CRUD
  if (pathname === '/keys') {
    if (method === 'GET') return json(fixture('keys'));
    if (method === 'POST') return json(fixture('key-create'), 201);
  }
  const keyHashMatch = matchPath('/keys/:hash', pathname);
  if (keyHashMatch) {
    if (method === 'GET') return json((fixture('keys') as { data: unknown[] }).data[0]);
    if (method === 'PATCH') return json((fixture('keys') as { data: unknown[] }).data[0]);
    if (method === 'DELETE') return json({ deleted: true });
  }

  // Guardrails CRUD
  if (pathname === '/guardrails') {
    if (method === 'GET') return json(fixture('guardrails'));
    if (method === 'POST') return json({ data: { id: 'guard_new', name: 'New Guardrail' } }, 201);
  }
  const guardrailSlugMatch = matchPath('/guardrails/:slug', pathname);
  if (guardrailSlugMatch) {
    if (method === 'GET') return json((fixture('guardrails') as { data: unknown[] }).data[0]);
    if (method === 'PATCH') return json((fixture('guardrails') as { data: unknown[] }).data[0]);
    if (method === 'DELETE') return json({ deleted: true });
  }
  const guardrailAssignMatch = matchPath('/guardrails/:slug/member-assignments', pathname);
  if (guardrailAssignMatch) {
    return json({ data: [] });
  }

  // GET /organization/members
  if (method === 'GET' && pathname === '/organization/members') {
    return json(fixture('org-members'));
  }

  // Video endpoints with state machine
  if (method === 'POST' && pathname === '/videos') {
    const initial = fixture('video-create') as { data: { id: string } };
    const jobId = initial.data.id;
    videoState.set(jobId, { polls: 0 });
    return json(initial, 202);
  }

  const videoStatusMatch = matchPath('/videos/:id/status', pathname);
  if (method === 'GET' && videoStatusMatch) {
    const jobId = videoStatusMatch.id ?? 'unknown';
    const state = videoState.get(jobId) ?? { polls: 0 };
    state.polls += 1;
    videoState.set(jobId, state);

    // State machine: poll 1 = pending, poll 2 = in_progress, poll 3+ = completed
    let status: string;
    if (state.polls === 1) {
      status = 'pending';
    } else if (state.polls === 2) {
      status = 'in_progress';
    } else {
      status = 'completed';
    }

    const base = fixture('video-create') as { data: Record<string, unknown> };
    const jobData = { ...base.data, id: jobId, status };
    if (status === 'completed') {
      (jobData as Record<string, unknown>).unsigned_urls = [
        'https://cdn.example.com/vid_mock_1.mp4',
      ];
    }
    return json({ data: jobData });
  }

  const videoUnsignedMatch = matchPath('/videos/:id/unsigned_urls', pathname);
  if (method === 'GET' && videoUnsignedMatch) {
    return json({
      data: [{ file_name: 'output.mp4', unsigned_url: 'https://cdn.example.com/vid_mock_1.mp4' }],
    });
  }

  const videoIdMatch = matchPath('/videos/:id', pathname);
  if (method === 'GET' && videoIdMatch) {
    return json(fixture('video-completed'));
  }

  // POST /auth/keys (OAuth PKCE exchange)
  if (method === 'POST' && pathname === '/auth/keys') {
    return json(fixture('auth-keys'));
  }

  // Fallback 404
  return new Response(
    JSON.stringify({ error: { message: `No mock route: ${method} ${pathname}` } }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/** Start a local mock server on a free port. Returns url, stop(), and reset(). */
export async function startMockServer(): Promise<MockServer> {
  const server = Bun.serve({
    port: 0, // auto-assign free port
    fetch: handleRequest,
  });

  const url = `http://localhost:${server.port}`;

  return {
    url,
    stop: async () => {
      server.stop(true);
    },
    reset: () => {
      videoState.clear();
    },
  };
}
