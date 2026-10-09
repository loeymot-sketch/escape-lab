import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, REQUEST_TIMEOUT_MS, api, demoSession, onUnauthorized, resolveApiBase } from './api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('guest API boundary', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('keeps guest credentials scoped to the current tab and sends bearer authorization', async () => {
    demoSession.setToken('guest-token');
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer guest-token');
    expect(localStorage.getItem('escape-demo-token')).toBeNull();
    expect(sessionStorage.getItem('escape-demo-token')).toBe('guest-token');
  });

  it('turns a backend error into a typed status, code and details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'incorrect_code', message: 'Incorrect code.', details: { attemptsLeft: 3 } } }, 422)));
    await expect(api('/labs/hematology/unlock', { method: 'POST' })).rejects.toMatchObject({ status: 422, code: 'incorrect_code', message: 'Incorrect code.', details: { attemptsLeft: 3 } });
  });

  it('does not turn an unparsable successful body into an empty object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>', { status: 200 })));
    await expect(api('/dashboard')).rejects.toMatchObject({ status: 200, code: 'invalid_response' });
  });

  it('keeps an empty successful body as undefined, never as a plausible object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    await expect(api('/dashboard')).resolves.toBeUndefined();
  });

  it('reports an HTML error page with the HTTP status instead of a parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(api('/dashboard')).rejects.toMatchObject({ status: 502, message: 'Request failed (502)' });
  });

  it('reports a transport failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await api('/dashboard').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('clears the bearer and notifies listeners on a 401; a call with no stored session also reopens one, but /auth routes never do', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    demoSession.setToken('stale');
    demoSession.setAttemptId('attempt-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'unauthorized', message: 'Authentication required.' } }, 401)));
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(demoSession.getToken()).toBeNull();
    expect(demoSession.getAttemptId()).toBeNull();

    // The stored session vanished (cleared storage): the next call carries no bearer, gets a 401 and must reopen a guest session.
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(2);
    // Signing in itself is never treated as an expired session.
    await expect(api('/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('keeps a newer guest session when a 401 arrives for the bearer it replaced', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    demoSession.setToken('old-token');
    demoSession.setAttemptId('old-attempt');
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { respond = resolve; })));
    const inFlight = api('/me');
    // Meanwhile the learner switched guest: a new bearer and attempt are stored.
    demoSession.setToken('new-token');
    demoSession.setAttemptId('new-attempt');
    respond(json({ error: { code: 'unauthorized', message: 'Authentication required.' } }, 401));
    await expect(inFlight).rejects.toMatchObject({ status: 401 });
    expect(demoSession.getToken()).toBe('new-token');
    expect(demoSession.getAttemptId()).toBe('new-attempt');
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('still clears the session when the 401 is for the bearer that is stored', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    demoSession.setToken('same');
    demoSession.setAttemptId('attempt');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'unauthorized', message: 'x' } }, 401)));
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    expect(demoSession.getToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('API address resolution', () => {
  it('uses the configured address without a trailing slash', () => {
    expect(resolveApiBase({ PROD: true, VITE_API_URL: 'https://api.example.test/api/' })).toEqual({ base: 'https://api.example.test/api', error: null });
  });

  it('falls back to localhost only outside production', () => {
    expect(resolveApiBase({ PROD: false })).toEqual({ base: 'http://localhost:3000/api', error: null });
  });

  it('refuses to guess in a production build without VITE_API_URL', () => {
    for (const env of [{ PROD: true }, { PROD: true, VITE_API_URL: '' }, { PROD: true, VITE_API_URL: '   ' }]) {
      const result = resolveApiBase(env);
      expect(result.base).toBeNull();
      expect(result.error).toContain('VITE_API_URL');
    }
  });
});

describe('blocked browser storage', () => {
  it('still keeps the guest session (in memory) when reading sessionStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')!;
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    try {
      expect(demoSession.getToken()).toBeNull();
      demoSession.setToken('in-memory');
      expect(demoSession.getToken()).toBe('in-memory');
      demoSession.setRole('teacher');
      expect(demoSession.getRole()).toBe('teacher');
      demoSession.clearToken();
      expect(demoSession.getToken()).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', original);
    }
  });
});

describe('request timeout (R9-B-03)', () => {
  /** A fetch that never answers but, like the real one, rejects with an AbortError when its signal fires. */
  const hanging = () => vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  }));

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('gives up on a request the server never answers, with the same ApiError shape as a network failure', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hanging());
    const pending = api('/auth/demo', { method: 'POST' }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'timeout' });
    expect((error as ApiError).message).toMatch(/did not answer/i);
  });

  it('also times out while the body is being read', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => Promise.resolve({
      ok: true,
      status: 200,
      text: () => new Promise<string>((_resolve, reject) => { init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); }),
    } as unknown as Response)));
    const pending = api('/dashboard').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ status: 0, code: 'timeout' });
  });

  it('clears its timer once the reply arrived (no late abort, no leaked timer)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/health')).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
    const signal = (fetchMock.mock.calls[0] as [string, RequestInit])[1].signal!;
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
    expect(signal.aborted).toBe(false);
  });

  it('does not report a caller-initiated abort as a timeout or a network failure', async () => {
    vi.stubGlobal('fetch', hanging());
    const caller = new AbortController();
    const pending = api('/dashboard', { signal: caller.signal }).catch((e: unknown) => e);
    caller.abort();
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as DOMException).name).toBe('AbortError');
  });
});

describe('Retry-After on an empty 429 (R12-C-04)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('turns the Retry-After header into the delay when the body carries none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '7' } })));
    const error = await api('/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, details: { retryAfterSeconds: 7 } });
  });
  it('keeps the delay the server put in the body over the header, and ignores an unreadable header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Slow.', details: { retryAfterSeconds: 3 } } }), { status: 429, headers: { 'Retry-After': '9' } })));
    expect(await api('/x').catch((e: unknown) => e)).toMatchObject({ details: { retryAfterSeconds: 3 } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': 'soon' } })));
    expect(((await api('/x').catch((e: unknown) => e)) as { details?: unknown }).details).toBeUndefined();
  });
});

describe('Retry-After edge cases (R14-B-04)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const reply = (details: unknown, header: string) => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Slow.', ...(details === undefined ? {} : { details }) } }), { status: 429, headers: { 'Retry-After': header } });
  const failure = async (response: Response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    return (await api('/x').catch((e: unknown) => e)) as { details?: unknown };
  };
  it('uses the header whenever the body carries no usable delay of its own', async () => {
    for (const details of [{}, [], null, 'busy', { retryAfterSeconds: 0 }, { retryAfterSeconds: -4 }, { retryAfterSeconds: 'soon' }]) {
      expect((await failure(reply(details, '30'))).details, JSON.stringify(details)).toMatchObject({ retryAfterSeconds: 30 });
    }
    // other detail fields survive next to the delay taken from the header
    expect((await failure(reply({ limit: 5 }, '30'))).details).toEqual({ limit: 5, retryAfterSeconds: 30 });
  });
  it('keeps the body delay when there is one', async () => {
    expect((await failure(reply({ retryAfterSeconds: 3 }, '30'))).details).toEqual({ retryAfterSeconds: 3 });
  });
  it('ignores a header that asks for more than a day', async () => {
    expect((await failure(reply(undefined, '86400'))).details).toEqual({ retryAfterSeconds: 86400 });
    expect((await failure(reply(undefined, '86401'))).details).toBeUndefined();
    expect((await failure(reply(undefined, '99999999999'))).details).toBeUndefined();
  });
});

