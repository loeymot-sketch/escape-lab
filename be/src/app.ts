// Application factory: wires db, game, router and the Node HTTP server.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import type { IncomingMessage, Server } from 'node:http';
import { AnthropicHintProvider, StandardOnlyProvider } from './assistant.ts';
import type { HintProvider } from './assistant.ts';
import { verifyToken } from './auth.ts';
import { openDb } from './db.ts';
import type { DB } from './db.ts';
import { Game } from './game.ts';
import { ApiError, EMPTY_BODY, RateLimiter, bad, compilePath, forbidden, notFound, readJson, send, unauthorized, validate } from './http.ts';
import type { Ctx, Route } from './http.ts';
import { buildRoutes } from './routes.ts';
import { openApi } from './openapi.ts';

export interface Config {
  dbPath: string;
  secret: string;
  corsOrigin: string;
  teacherInviteCode: string;
  /** Enables POST /api/auth/demo and the seeded demo data. Never enable in production. */
  demo?: boolean;
  /** Per-IP limits; defaults suit production. */
  limits?: { registerPerHour?: number; loginFailuresPerIp?: number; joinPerUser?: number; answerPerMinute?: number; hintPerMinute?: number; startPerMinute?: number; writePerMinute?: number };
  assistant?: HintProvider;
  /** Number of trusted reverse-proxy hops in front of the API (true = 1). The client address is the Nth entry from the right of X-Forwarded-For. Only safe when the API port is reachable solely through those proxies. */
  trustProxy?: boolean | number;
  now?: () => number;
}

const intEnv = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);

export function configFromEnv(env = process.env): Config {
  const prod = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (prod && (env.AUTH_SECRET ?? '').length < 32) throw new Error('AUTH_SECRET (at least 32 characters) is required in production.');
  if (prod && (!env.CORS_ORIGIN || env.CORS_ORIGIN === '*')) throw new Error('CORS_ORIGIN must name the web origin in production (not "*").');
  if (prod && env.DEMO_MODE === '1' && env.ALLOW_DEMO_IN_PRODUCTION !== '1') throw new Error('DEMO_MODE=1 mints passwordless tokens and is refused in production (set ALLOW_DEMO_IN_PRODUCTION=1 to override).');
  const proxy = (env.TRUST_PROXY ?? '').toLowerCase();
  const hops = proxy === 'true' || proxy === '1' ? 1 : intEnv(proxy) ?? 0;
  return {
    // `||`, not `??`: a blank DB_PATH (compose `${DB_PATH}` unset, `-e DB_PATH=`) would open SQLite's throw-away temporary database.
    dbPath: env.DB_PATH || './data/escape-lab.db',
    secret: env.AUTH_SECRET || randomBytes(32).toString('hex'),
    corsOrigin: env.CORS_ORIGIN || '*',
    teacherInviteCode: env.TEACHER_INVITE_CODE ?? '',
    demo: env.DEMO_MODE === '1',
    trustProxy: hops > 0 ? hops : false,
    limits: {
      registerPerHour: intEnv(env.RATE_REGISTER_PER_HOUR), loginFailuresPerIp: intEnv(env.RATE_LOGIN_FAILURES_PER_IP), joinPerUser: intEnv(env.RATE_JOIN_PER_USER),
      answerPerMinute: intEnv(env.RATE_ANSWER_PER_MINUTE), hintPerMinute: intEnv(env.RATE_HINT_PER_MINUTE), startPerMinute: intEnv(env.RATE_START_PER_MINUTE), writePerMinute: intEnv(env.RATE_WRITE_PER_MINUTE),
    },
    assistant: env.LAB_ASSISTANT_API_KEY && env.LAB_ASSISTANT_MODEL ? new AnthropicHintProvider(env.LAB_ASSISTANT_API_KEY, env.LAB_ASSISTANT_MODEL) : new StandardOnlyProvider(),
  };
}

const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?(\.[A-Za-z0-9_]([A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)*$/;

/**
 * Interface the HTTP server binds to. Demo mode mints passwordless tokens, so it stays on loopback unless HOST says otherwise; without demo mode all interfaces (undefined) as before.
 * HOST is trimmed; blank means "not set". `localhost` means the IPv4 loopback (a plain "localhost" bind can end up IPv6-only and refuse IPv4 clients); `[::1]` is accepted
 * with its brackets. Anything that is not an IP address or a plausible host name throws a message fit to print.
 */
export function listenHost(cfg: { demo?: boolean }, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = (env.HOST ?? '').trim();
  if (!raw) return cfg.demo ? '127.0.0.1' : undefined;
  const h = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  if (h.toLowerCase() === 'localhost') return '127.0.0.1';
  // Digits and dots only is an IPv4 literal or nothing: "999.1.1.1" or "10.0.0.1.5" is not a host name that DNS could resolve.
  if (isIP(h) || (!/^[0-9.]+$/.test(h) && HOSTNAME.test(h))) return h;
  throw new Error(`HOST "${raw}" is not a valid IP address or host name (examples: 127.0.0.1, 0.0.0.0, ::, ::1).`);
}

/** The PORT to listen on: blank means 3000; otherwise an integer from 0 to 65535 (0 = any free port). */
export function listenPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.PORT ?? '').trim();
  if (!raw) return 3000;
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 65535) throw new Error(`PORT "${raw}" is not a port number (0 to 65535).`);
  return Number(raw);
}

/** URL for the startup log: IPv6 literals are bracketed, and "all interfaces" is shown as localhost. */
export function listenUrl(host: string | undefined, port: number): string {
  const h = host ?? 'localhost';
  return `http://${h.includes(':') ? `[${h}]` : h}:${port}`;
}

/** The error Node raises on a request whose client disconnected before the body was complete ("aborted", ECONNRESET). */
function isClientAbort(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return code === 'ECONNRESET' || code === 'ERR_STREAM_PREMATURE_CLOSE' || (e instanceof Error && e.message === 'aborted');
}

export interface App { server: Server; db: DB; game: Game; limiter: RateLimiter; close: () => Promise<void> }

export function createApp(cfg: Config): App {
  const db = openDb(cfg.dbPath);
  const now = cfg.now ?? Date.now;
  const game = new Game(db, { now, assistant: cfg.assistant });
  const limiter = new RateLimiter(now);
  const routes = buildRoutes({ db, game, limiter, secret: cfg.secret, teacherInviteCode: cfg.teacherInviteCode, now, limits: cfg.limits, demo: !!cfg.demo });
  const table = routes.map((r) => ({ r, ...compilePath(r.path) }));
  const spec = openApi(routes);

  const cors = (origin: string | undefined): Record<string, string> => {
    const h: Record<string, string> = { Vary: 'Origin' };
    if (cfg.corsOrigin === '*' || (origin && origin === cfg.corsOrigin)) {
      h['Access-Control-Allow-Origin'] = cfg.corsOrigin === '*' ? '*' : origin!;
      h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS';
      // Retry-After is not CORS-safelisted: without this a browser script cannot read it from a 429.
      h['Access-Control-Expose-Headers'] = 'Retry-After';
      h['Access-Control-Max-Age'] = '600';
    }
    return h;
  };

  const clientIp = (req: IncomingMessage) => {
    const hops = cfg.trustProxy === true ? 1 : cfg.trustProxy || 0;
    if (hops > 0) {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      if (fwd.length >= hops) return fwd[fwd.length - hops]!;
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    try {
      let url: URL;
      try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { throw bad('Malformed request target.'); }
      // Methods a path answers (HEAD rides on GET, OPTIONS on everything); empty for a path that does not exist.
      const allowFor = (pathname: string): string[] => {
        const ms = new Set<string>(pathname === '/api/openapi.json' ? ['GET'] : []);
        for (const t of table) if (t.re.test(pathname)) ms.add(t.r.method);
        return ms.size ? [...ms].flatMap((m) => (m === 'GET' ? ['GET', 'HEAD'] : [m])).concat('OPTIONS') : [];
      };
      if (req.method === 'OPTIONS') {
        const allow = allowFor(url.pathname);
        if (!allow.length) throw notFound('No such endpoint.');
        res.writeHead(204, { ...cors(origin), Allow: allow.join(', ') }); res.end(); return;
      }
      // HEAD is GET without a body (RFC 9110 section 9.3.2): same routes, guards, status and headers; Node drops the body of a response to HEAD.
      // Only routes declared as GET answer it; HEAD is never offered on the others.
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      if (method === 'GET' && url.pathname === '/api/openapi.json') { send(res, 200, spec, cors(origin)); return; }

      let match: { r: Route; params: Record<string, string> } | undefined;
      for (const t of table) {
        const m = t.re.exec(url.pathname);
        if (!m) continue;
        if (t.r.method !== method) continue;
        try { match = { r: t.r, params: Object.fromEntries(t.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)])) }; } catch { throw bad('Malformed percent-encoding in the request path.'); }
        break;
      }
      if (!match) { const allow = allowFor(url.pathname); throw allow.length ? new ApiError(405, 'method_not_allowed', 'Method not allowed.', undefined, { Allow: allow.join(', ') }) : notFound('No such endpoint.'); }

      const ctx: Ctx = { req, params: match.params, query: url.searchParams, body: undefined, ip: clientIp(req) };

      if (match.r.auth !== 'none') {
        const h = req.headers.authorization ?? '';
        const tok = /^Bearer\s+/i.test(h) ? verifyToken(h.replace(/^Bearer\s+/i, ''), cfg.secret, Math.floor(now() / 1000)) : null;
        if (!tok) throw unauthorized();
        const row = db.prepare('SELECT id, role, name, email, is_demo_account FROM users WHERE id = ?').get(tok.sub) as (NonNullable<Ctx['user']> & { is_demo_account: number }) | undefined;
        if (!row) throw unauthorized();
        // A token minted while demo mode was on must not outlive it: the seeded accounts share a published password.
        // Only the accounts seedDemo created are refused; a real account that happens to sit on the demo domain keeps working.
        if (!cfg.demo && row.is_demo_account) throw unauthorized();
        const u: NonNullable<Ctx['user']> = { id: row.id, role: row.role, name: row.name, email: row.email };
        ctx.user = u;
        if (match.r.auth === 'student' && u.role !== 'student') throw forbidden('This endpoint is for student accounts.', 'wrong_role');
        if (match.r.auth === 'teacher' && u.role !== 'teacher') throw forbidden('This endpoint is for teacher accounts.', 'wrong_role');
      }

      for (const q of match.r.query ?? []) {
        const v = ctx.query.get(q.name);
        if (v === null) continue;
        const errs = validate(v, q.schema, `query.${q.name}`);
        if (errs.length) throw new ApiError(400, 'validation_error', 'The request is invalid.', errs);
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        ctx.body = await readJson(req);
        if (match.r.body) {
          const errs = validate(ctx.body === undefined || (ctx.body === null && match.r.body !== EMPTY_BODY) ? {} : ctx.body, match.r.body);
          if (ctx.body === undefined && match.r.body.required?.length) errs.unshift('body is required');
          if (errs.length) throw new ApiError(400, 'validation_error', 'The request is invalid.', errs);
          ctx.body ??= {};
        }
      }

      // HEAD is a safe method: the handler runs with every write refused (see Game.readOnlyRequest). All GET handlers are synchronous.
      const out = await (req.method === 'HEAD' ? game.readOnlyRequest(() => match!.r.handler(ctx)) : match.r.handler(ctx));
      send(res, match.r.status ?? 200, out, cors(origin));
    } catch (e) {
      if (e instanceof ApiError) {
        send(res, e.status, { error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } }, { ...cors(origin), ...(e.headers ?? {}) });
      } else if (isClientAbort(e)) {
        // The client went away mid-request (reset / closed socket while the body was still arriving): nobody is left to answer and nothing is wrong on our side.
        return;
      } else {
        console.error(e);
        send(res, 500, { error: { code: 'internal_error', message: 'Something went wrong.' } }, cors(origin));
      }
    }
  });

  return {
    server, db, game, limiter,
    close: () => new Promise<void>((resolve) => { server.close(() => { db.close(); resolve(); }); server.closeAllConnections?.(); }),
  };
}
