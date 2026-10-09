// Password hashing (scrypt) and signed bearer tokens (HMAC-SHA256, 7 days).
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const scrypt = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

/**
 * New and changed passwords are hashed as NFC, so the same typed password works whichever Unicode form the keyboard or OS produced (a decomposed "é" is
 * one letter to a person). Hashes written before round 13 were made from the raw string: verifyPassword tries the raw string first (those keep working,
 * including a raw NFD one), then its NFC form (a raw NFC hash, or a hash made by this version, checked with an NFD login).
 */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize('NFC'), salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, s, k] = stored.split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const expected = Buffer.from(k, 'base64url');
  const salt = Buffer.from(s, 'base64url');
  // Work depends only on the submitted string (one scrypt when it is already NFC, two otherwise), never on whether the account exists or which form its hash used:
  // both candidates are always computed and compared.
  const nfc = pw.normalize('NFC');
  const candidates = nfc === pw ? [pw] : [pw, nfc];
  const keys = await Promise.all(candidates.map((c) => scrypt(c, salt, expected.length)));
  let ok = false;
  for (const got of keys) ok = (got.length === expected.length && timingSafeEqual(got, expected)) || ok;
  return ok;
}

export interface TokenPayload { sub: number; role: 'student' | 'teacher'; exp: number }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function signToken(p: TokenPayload, secret: string): string {
  const body = b64(p);
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifyToken(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): TokenPayload | null {
  // Exactly "<body>.<signature>", both canonical unpadded base64url: one accepted string per token, so nothing keyed on the raw string can be bypassed.
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  if (!body || !sig || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const want = Buffer.from(createHmac('sha256', secret).update(body).digest('base64url'));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    return p.exp > nowSec && typeof p.sub === 'number' ? p : null;
  } catch { return null; }
}
