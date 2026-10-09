const DEV_API_BASE = 'http://localhost:3000/api';

/**
 * A production bundle never guesses where the API lives: a missing VITE_API_URL is a configuration error that
 * is reported loudly at startup (see `apiConfigError`), not silently pointed at localhost.
 */
export function resolveApiBase(env: { PROD?: boolean; VITE_API_URL?: string }): { base: string | null; error: string | null } {
  const configured = env.VITE_API_URL?.trim();
  if (configured) return { base: configured.replace(/\/+$/, ''), error: null };
  if (env.PROD) return { base: null, error: 'This build has no API address: VITE_API_URL must be set when the production bundle is built.' };
  return { base: DEV_API_BASE, error: null };
}

const resolved = resolveApiBase(import.meta.env);
/** Non-null when the bundle cannot know its API (production build without VITE_API_URL). */
export const apiConfigError: string | null = resolved.error;
const TOKEN_KEY = 'escape-demo-token';
const ATTEMPT_KEY = 'escape-demo-attempt';
const ROLE_KEY = 'escape-demo-role';

/** How long one request may wait for the server before it is abandoned (the caller then sees the same ApiError as for a network failure). */
export const REQUEST_TIMEOUT_MS = 20_000;

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } | string; message?: string };

export class ApiError extends Error {
  constructor(readonly status: number, readonly code?: string, message?: string, readonly details?: unknown) {
    super(message || `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

/**
 * Tab storage that never throws: with site data blocked, merely reading `sessionStorage` raises a SecurityError, and the app
 * must still start. It then keeps the session in memory for the life of the page (a reload opens a new guest session).
 */
const memory = new Map<string, string>();
const tabStore = {
  get(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; } },
  set(key: string, value: string): void { try { sessionStorage.setItem(key, value); } catch { memory.set(key, value); } },
  remove(key: string): void { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } memory.delete(key); },
};

/** The ONLY place browser storage is touched. The bearer lives in sessionStorage (per tab), never localStorage. */
export const demoSession = {
  getToken: () => tabStore.get(TOKEN_KEY),
  setToken: (token: string) => tabStore.set(TOKEN_KEY, token),
  clearToken: () => tabStore.remove(TOKEN_KEY),
  getAttemptId: () => tabStore.get(ATTEMPT_KEY),
  setAttemptId: (attemptId: string) => tabStore.set(ATTEMPT_KEY, attemptId),
  clearAttempt: () => tabStore.remove(ATTEMPT_KEY),
  /** Which kind of guest this tab opened last, so a recovery after a reload reopens the same kind (not a credential). */
  getRole: (): 'student' | 'teacher' => (tabStore.get(ROLE_KEY) === 'teacher' ? 'teacher' : 'student'),
  setRole: (role: 'student' | 'teacher') => tabStore.set(ROLE_KEY, role),
};

/** The display-language preference of this tab ('en' | 'fr'). Not a credential; storage stays in this module. */
export const uiPreference = {
  getLang: (): string | null => tabStore.get('escape-lab.lang'),
  setLang: (lang: string) => tabStore.set('escape-lab.lang', lang),
};

const unauthorizedListeners = new Set<() => void>();
/** Subscribes to "the server rejected our bearer". Returns an unsubscribe function. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

/** The longest wait worth quoting: one day. A server or proxy asking for more is not giving a delay a person can plan around. */
export const MAX_RETRY_WAIT_SECONDS = 86_400;

/** The wait a Retry-After header asks for, in seconds: a number of seconds or an HTTP date. Anything else, or more than a day, is no delay. */
function retryAfterSeconds(header: string | null): number | undefined {
  const text = header?.trim();
  if (!text) return undefined;
  const seconds = /^\d+$/.test(text) ? Number(text) : Math.ceil((Date.parse(text) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_RETRY_WAIT_SECONDS ? seconds : undefined;
}

const hasDelay = (details: unknown): boolean => {
  const quoted = details && typeof details === 'object' && !Array.isArray(details) ? (details as { retryAfterSeconds?: unknown }).retryAfterSeconds : undefined;
  return typeof quoted === 'number' && Number.isFinite(quoted) && quoted > 0;
};

function errorFrom(status: number, body: unknown, retryAfter: string | null = null): ApiError {
  const root = (body && typeof body === 'object' ? body : {}) as ErrorBody;
  const nested = typeof root.error === 'object' && root.error ? root.error : undefined;
  const message = root.message || nested?.message || (typeof root.error === 'string' ? root.error : undefined);
  let details = nested?.details;
  // A reply whose body quotes no usable delay of its own (a proxy answering 429, or details without retryAfterSeconds) can still carry one in the Retry-After header.
  const wait = status === 429 && !hasDelay(details) ? retryAfterSeconds(retryAfter) : undefined;
  if (wait !== undefined) details = details && typeof details === 'object' && !Array.isArray(details) ? { ...details, retryAfterSeconds: wait } : { retryAfterSeconds: wait };
  return new ApiError(status, nested?.code, message, details);
}

/**
 * Calls the Escape Lab API. A successful response that is not valid JSON is an
 * error (never coerced to `{}`), and a transport failure is an ApiError with status 0.
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = demoSession.getToken();
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  if (resolved.base === null) throw new ApiError(0, 'config_error', apiConfigError ?? 'The API address is not configured.');

  // A server that accepts the connection but never answers must not leave the screen waiting forever: after REQUEST_TIMEOUT_MS the
  // request is aborted and fails like a network error (status 0), so every existing handler (alerts, Retry, resync) applies.
  // An abort requested by the caller is a different thing and is passed on untouched.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const relay = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', relay, { once: true });
  const timeout = () => new ApiError(0, 'timeout', 'The Escape Lab server did not answer in time. Check your connection and retry.');

  let response: Response;
  let raw: string;
  try {
    try {
      response = await fetch(`${resolved.base}${path}`, { ...init, headers, signal: controller.signal });
    } catch (e) {
      if (timedOut) throw timeout();
      if (init.signal?.aborted) throw e;
      throw new ApiError(0, 'network_error', 'Cannot reach the Escape Lab server. Check your connection and retry.');
    }
    // The timer keeps running while the body is read: a reply that stalls half way is a timeout too.
    raw = await response.text().catch((e: unknown) => { if (init.signal?.aborted && !timedOut) throw e; return ''; });
    if (timedOut) throw timeout();
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', relay);
  }

  let body: unknown;
  let parsed = true;
  try {
    body = raw.length ? JSON.parse(raw) : undefined;
  } catch {
    parsed = false;
  }

  if (!response.ok) {
    // Only the bearer this very request carried may be discarded: if the guest session was already replaced
    // (another request failed first, or the learner switched guest), the newer credentials must survive.
    // A request that carried no bearer at all (the stored session vanished) must recover too, not repeat the same 401 forever.
    if (response.status === 401 && demoSession.getToken() === token && !path.startsWith('/auth/')) {
      demoSession.clearToken();
      demoSession.clearAttempt();
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw errorFrom(response.status, parsed ? body : undefined, response.headers.get('retry-after'));
  }
  if (!parsed) throw new ApiError(response.status, 'invalid_response', 'The server returned an unreadable response.');
  return body as T;
}
