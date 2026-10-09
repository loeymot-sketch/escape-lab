// Minimal HTTP toolkit: errors, a JSON-schema-subset validator (also the source of the OpenAPI
// document), a path-parameter router and an in-memory sliding-window rate limiter.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hasBidiControl } from './names.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  headers?: Record<string, string>;
  constructor(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}
export const bad = (message: string, details?: unknown) => new ApiError(400, 'validation_error', message, details);
export const unauthorized = (message = 'Authentication required.') => new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource.', code = 'forbidden', details?: unknown) =>
  new ApiError(403, code, message, details);
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);
export const conflict = (code: string, message: string, details?: unknown) => new ApiError(409, code, message, details);

// ---------------------------------------------------------------- validation
export interface Schema {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array';
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  enum?: (string | number)[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  description?: string;
  example?: unknown;
}

const CONTROL_CHARS = /[\p{Cc}\u2028\u2029]/u;
const LONE_SURROGATE = /\p{Cs}/u;
// Also private-use, unassigned, lone-surrogate and default-ignorable code points: they render as nothing (or as a tofu box) and carry no name.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Z}\p{M}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}\u2800\u3164\u115F\u1160\uFFA0]/gu;
export const hasVisibleCharacter = (value: string): boolean => value.replace(INVISIBLE, '').length > 0;
// Characters that are not drawn: like INVISIBLE but WITHOUT the combining marks (a mark after a letter is part of a password such as a decomposed é or a Devanagari vowel sign).
const INVISIBLE_SECRET = /[\p{Cc}\p{Cf}\p{Z}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}\u2800\u3164\u115F\u1160\uFFA0]/gu;
/** Characters of a password a person could see (R15-A-07): invisible, format, filler and whitespace characters do not count, nor combining marks that follow no visible character. */
export const visibleSecretLength = (value: string): number => [...value.normalize('NFC').replace(INVISIBLE_SECRET, '').replace(/^\p{M}+/u, '')].length;
/** Number of characters (code points) a person can see: invisible ones do not count. */
export const visibleLength = (value: string): number => [...value.replace(INVISIBLE, '')].length;

/** Returns a list of human-readable problems; empty when the value conforms. */
/** Body schema of the routes that take no body: nothing or an empty object. A literal JSON `null` is refused there (R20-A-06), unlike on routes where every field is optional. */
export const EMPTY_BODY: Schema = { type: 'object', additionalProperties: false };

export function validate(value: unknown, schema: Schema, path = 'body'): string[] {
  const errs: string[] = [];
  const t = schema.type;
  if (t === 'string') {
    if (typeof value !== 'string') return [`${path} must be a string`];
    // Length counts characters (code points), not UTF-16 units. Control characters (NUL included) never belong in a typed field.
    // A pattern never runs on a value whose length is already invalid: a regular expression over a 60 KB string can freeze the server.
    if (schema.maxLength !== undefined && value.length > schema.maxLength * 2) return [`${path} must be at most ${schema.maxLength} characters`];
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) errs.push(`${path} must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && length > schema.maxLength) errs.push(`${path} must be at most ${schema.maxLength} characters`);
    if (errs.length) return errs;
    if (CONTROL_CHARS.test(value)) errs.push(`${path} must not contain control characters`);
    // Names and labels (the `\S` pattern): bidi overrides / embeddings / isolates make a string draw as another one.
    else if (schema.pattern === '\\S' && hasBidiControl(value)) errs.push(`${path} must not contain bidirectional control characters`);
    // A lone surrogate is not text: SQLite would store U+FFFD, so the comparison key (computed on the submitted string) and the stored value would disagree (R16-A-01 names,
    // R17-A-03 every string field: e-mail, password, program, study level ...; two submissions differing only by the surrogate would collide).
    else if (LONE_SURROGATE.test(value)) errs.push(`${path} must not contain unpaired surrogate characters`);
    // The `\S` pattern means "has a visible character": invisible-only text (zero-width, blank fillers, marks) does not count.
    else if (schema.pattern === '\\S' ? !hasVisibleCharacter(value) : schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path} has an invalid format`);
  } else if (t === 'integer' || t === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (t === 'integer' && !Number.isInteger(value))) return [`${path} must be ${t === 'integer' ? 'an integer' : 'a number'}`];
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path} must be <= ${schema.maximum}`);
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') return [`${path} must be a boolean`];
  } else if (t === 'array') {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path} must have at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items!, `${path}[${i}]`)));
  } else if (t === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} must be an object`];
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (o[k] === undefined) errs.push(`${path}.${k} is required`);
    for (const [k, v] of Object.entries(o)) {
      const sub = schema.properties && Object.hasOwn(schema.properties, k) ? schema.properties[k] : undefined;
      if (sub) errs.push(...validate(v, sub, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}.${k} is not allowed`);
      else if (typeof schema.additionalProperties === 'object') errs.push(...validate(v, schema.additionalProperties, `${path}.${k}`));
    }
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) errs.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  return errs;
}

// ------------------------------------------------------------------- routing
export interface Ctx {
  req: IncomingMessage;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  /** Set by the auth guard. */
  user?: { id: number; role: 'student' | 'teacher'; name: string; email: string };
  ip: string;
}
export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  auth: 'none' | 'user' | 'student' | 'teacher';
  tag: string;
  summary: string;
  /** Longer OpenAPI description (rules, error codes). */
  description?: string;
  body?: Schema;
  /** Optional query parameters (validated before the handler runs, and documented in OpenAPI). */
  query?: Array<{ name: string; schema: Schema; description?: string }>;
  /** HTTP status for success. Defaults to 200. */
  status?: number;
  handler: (ctx: Ctx) => unknown;
}

export function compilePath(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = [];
  const re = path.replace(/:([A-Za-z]+)/g, (_, k: string) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp(`^${re}$`), keys };
}

export async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
    chunks.push(c as Buffer);
  }
  if (size === 0) return undefined;
  const ct = req.headers['content-type'] ?? '';
  // The media type must BE application/json: 'text/plain; x=application/json' is a CORS-safelisted type a third-party page can send without a preflight.
  if (ct.split(';')[0]!.trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('Request body is not valid JSON.'); }
}

export function send(res: ServerResponse, status: number, payload: unknown, extra: Record<string, string> = {}): void {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...extra,
  });
  res.end(body);
}

// ---------------------------------------------------------------- rate limits
export class RateLimiter {
  /** Each key remembers its own window, so pruning never drops a 10-minute lockout because a 60-second key triggered the sweep. */
  private hits = new Map<string, { windowMs: number; at: number[] }>();
  private lastSweep = 0;
  now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }
  /** Registers one hit; throws 429 when the key exceeded `max` hits in `windowMs`. */
  hit(key: string, max: number, windowMs: number): void {
    const t = this.now();
    const arr = (this.hits.get(key)?.at ?? []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      const retry = Math.max(1, Math.ceil((windowMs - (t - arr[0]!)) / 1000));
      this.hits.set(key, { windowMs, at: arr });
      throw new ApiError(429, 'rate_limited', 'Too many attempts. Try again shortly.', { retryAfterSeconds: retry }, { 'Retry-After': String(retry) });
    }
    arr.push(t);
    this.hits.set(key, { windowMs, at: arr });
    if (this.hits.size > 10_000 && t - this.lastSweep > 10_000) {
      this.lastSweep = t;
      for (const [k, v] of this.hits) if (!v.at.some((x) => t - x < v.windowMs)) this.hits.delete(k);
    }
  }
  /** Gives back the most recent hit of `key` (an attempt reserved up front that turned out not to count, e.g. a successful sign-in). */
  release(key: string): void {
    const entry = this.hits.get(key);
    if (entry) entry.at.pop();
  }
  /** Throws 429 when `key` is already at its limit, without recording a hit (count failures separately with hit()). */
  peek(key: string, max: number, windowMs: number): void {
    const t = this.now();
    const arr = (this.hits.get(key)?.at ?? []).filter((x) => t - x < windowMs);
    if (arr.length >= max) {
      const retry = Math.max(1, Math.ceil((windowMs - (t - arr[0]!)) / 1000));
      throw new ApiError(429, 'rate_limited', 'Too many attempts. Try again shortly.', { retryAfterSeconds: retry }, { 'Retry-After': String(retry) });
    }
  }
  reset(): void { this.hits.clear(); }
}
