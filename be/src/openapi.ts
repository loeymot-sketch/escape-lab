// OpenAPI 3.1 document generated from the route table, so docs cannot drift from the code.
import type { Route } from './http.ts';

/** Error statuses a route can return beyond the generic ones (validation, auth, not found), by `METHOD path`. */
const EXTRA_ERRORS: Record<string, number[]> = {
  'POST /api/auth/register': [403, 409, 429],
  'POST /api/auth/login': [401, 429],
  'POST /api/auth/demo': [404, 429],
  'POST /api/labs/:slug/unlock': [409, 422, 429],
  'POST /api/missions/:id/start': [429],
  'POST /api/attempts/:id/answer': [409, 429],
  'POST /api/attempts/:id/hint': [409, 429],
  'GET /api/attempts/:id/result': [409],
  'GET /api/labs/:slug/results': [409],
  'POST /api/classes/join': [429],
  'PUT /api/content/missions/:id/status': [409, 429],
  'POST /api/classes': [409, 429],
  'PUT /api/profile': [409, 429],
};
const ERROR_RESPONSE = { $ref: '#/components/responses/Error' };
const RATE_LIMITED_RESPONSE = { $ref: '#/components/responses/RateLimited' };
const HEADER_TOO_LARGE_RESPONSE = { $ref: '#/components/responses/HeaderTooLarge' };
const ERROR_BODY = { 'application/json': { schema: { type: 'object', properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } } } };

export function openApi(routes: Route[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const path = r.path.replace(/:([A-Za-z]+)/g, '{$1}');
    const params = [
      ...[...r.path.matchAll(/:([A-Za-z]+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })),
      ...(r.query ?? []).map((q) => ({ name: q.name, in: 'query', required: false, schema: q.schema, ...(q.description ? { description: q.description } : {}) })),
    ];
    (paths[path] ??= {})[r.method.toLowerCase()] = {
      tags: [r.tag],
      summary: r.summary,
      ...(params.length ? { parameters: params } : {}),
      ...(r.auth !== 'none' || r.description
        ? { ...(r.auth !== 'none' ? { security: [{ bearer: [] }] } : {}), description: [r.auth !== 'none' ? `Requires a ${r.auth === 'user' ? 'signed-in' : r.auth} account.` : '', r.description ?? ''].filter(Boolean).join(' ') }
        : {}),
      ...(r.body ? { requestBody: { required: !!r.body.required?.length, content: { 'application/json': { schema: r.body } } } } : {}),
      responses: {
        [String(r.status ?? 200)]: { description: 'Success' },
        // 400 covers body, query and path validation; 413/415 only exist where a JSON body is read.
        ...(r.body || params.length ? { '400': ERROR_RESPONSE } : {}),
        ...(r.body || r.method === 'POST' || r.method === 'PUT' ? { '400': ERROR_RESPONSE, '413': ERROR_RESPONSE, '415': ERROR_RESPONSE } : {}),
        ...(r.auth !== 'none' ? { '401': ERROR_RESPONSE, '403': ERROR_RESPONSE } : {}),
        '404': ERROR_RESPONSE,
        '405': ERROR_RESPONSE,
        // Sent by Node's HTTP parser before the application runs (R16-A-07), so it is the same for every operation.
        '431': HEADER_TOO_LARGE_RESPONSE,
        ...Object.fromEntries((EXTRA_ERRORS[`${r.method} ${r.path}`] ?? []).map((code) => [String(code), code === 429 ? RATE_LIMITED_RESPONSE : ERROR_RESPONSE])),
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Escape Lab API', version: '0.1.0',
      description: 'Server-authoritative API for Escape Lab. Answer keys, explanations and hints never leave the server before they are earned. All scoring is computed here from server timestamps.',
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: ['System', 'Auth', 'Student', 'Labs', 'Vault', 'Missions', 'Social', 'Profile', 'Classes', 'Content', 'Demo'].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      responses: {
        Error: { description: 'Error', content: ERROR_BODY },
        HeaderTooLarge: { description: 'Request Header Fields Too Large (the header block, for example an oversized Authorization value, is above Node\'s 16 KB limit). Answered by the HTTP server before the application runs: no body and no JSON error envelope. The same applies to the other protocol-level errors Node answers itself on any operation, for example a bare `400 Bad Request` for a malformed request line, header or HTTP version, or for a Content-Length / Transfer-Encoding conflict; these are not declared per operation. The UI never produces them.' },
        RateLimited: {
          description: 'Too many requests (error code rate_limited). `error.details.retryAfterSeconds` and the Retry-After header say how long to wait.',
          headers: {
            'Retry-After': {
              description: 'Seconds to wait before trying again (a whole number, at least 1). When CORS is enabled the API sends Access-Control-Expose-Headers: Retry-After, so a browser script can read it.',
              schema: { type: 'integer', minimum: 1 },
            },
          },
          content: ERROR_BODY,
        },
      },
    },
  };
}
