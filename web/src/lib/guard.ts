/**
 * Strict payload readers shared by every normalizer. They THROW on a missing or
 * mistyped field: the client never substitutes a plausible default for server data.
 */
export type Rec = Record<string, unknown>;

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadError';
  }
}

const fail = (label: string, field: string): never => {
  throw new PayloadError(`Invalid server ${label} payload: ${field}.`);
};

export const rec = (value: unknown, label: string, field = 'object'): Rec => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(label, field);
  return value as Rec;
};

export const str = (value: unknown, label: string, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) return fail(label, field);
  return value;
};

/** A string that may legitimately be empty (for example a unit-less value). */
export const text = (value: unknown, label: string, field: string): string => {
  if (typeof value !== 'string') return fail(label, field);
  return value;
};

export const num = (value: unknown, label: string, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(label, field);
  return value;
};

export const nonNeg = (value: unknown, label: string, field: string): number => {
  const n = num(value, label, field);
  if (n < 0) return fail(label, field);
  return n;
};

/** A count or rank: a whole number the browser can represent exactly (no fractions, no 1e21, no negatives). */
export const count = (value: unknown, label: string, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return fail(label, field);
  return value;
};

/** A whole-number or decimal percentage: finite and inside 0..100 (anything else is a broken payload, not a figure to display). */
export const pct = (value: unknown, label: string, field: string): number => {
  const n = nonNeg(value, label, field);
  if (n > 100) return fail(label, field);
  return n;
};

export const bool = (value: unknown, label: string, field: string): boolean => {
  if (typeof value !== 'boolean') return fail(label, field);
  return value;
};

export const arr = (value: unknown, label: string, field: string): unknown[] => {
  if (!Array.isArray(value)) return fail(label, field);
  return value;
};

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string, field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return fail(label, field);
  return value as T;
}

export const nullable = <T>(value: unknown, read: (v: unknown) => T): T | null => (value === null ? null : read(value));

/** An optional field: absent (undefined) is fine, present-but-wrong still throws. */
export const optional = <T>(value: unknown, read: (v: unknown) => T): T | undefined => (value === undefined ? undefined : read(value));
