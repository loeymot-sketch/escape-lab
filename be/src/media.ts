// Teacher image uploads: the bytes are trusted only after their own header says what they are. The declared type is ignored,
// the dimensions are read from the file, and only raster formats a browser draws without running anything are accepted (no SVG).
import { bad } from './http.ts';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
export interface ImageInfo { mime: ImageMime; width: number; height: number }

/** Largest accepted upload, in bytes (decoded). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Largest accepted side, in pixels: a bigger image is no clearer on a screen and only costs memory in the browser. */
export const MAX_IMAGE_SIDE = 8000;

const u16be = (b: Buffer, o: number) => b.readUInt16BE(o);
const u16le = (b: Buffer, o: number) => b.readUInt16LE(o);
const u24le = (b: Buffer, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

function jpegSize(b: Buffer): { width: number; height: number } | null {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) { o += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
    const len = u16be(b, o + 2);
    if (len < 2) return null;
    // Start-of-frame markers (baseline, progressive, lossless...), not DHT (C4), JPG (C8) or DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    }
    o += 2 + len;
  }
  return null;
}

/** Reads the real type and size of an image from its bytes; null when it is not a supported raster image. */
export function sniffImage(b: Buffer): ImageInfo | null {
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.subarray(12, 16).toString('latin1') === 'IHDR') {
    return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length >= 10 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const size = jpegSize(b);
    return size ? { mime: 'image/jpeg', ...size } : null;
  }
  if (b.length >= 10 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a')) {
    return { mime: 'image/gif', width: u16le(b, 6), height: u16le(b, 8) };
  }
  if (b.length >= 30 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    const chunk = b.subarray(12, 16).toString('latin1');
    if (chunk === 'VP8X') return { mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { mime: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const v = b.readUInt32LE(21);
      return { mime: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/** Decodes a base64 (or data: URL) upload and checks it; the error messages are written for the teacher who chose the file. */
export function decodeImage(data: string): { bytes: Buffer; info: ImageInfo } {
  const payload = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) throw bad('The image data is not valid base64.');
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) throw bad('The image is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw bad(`The image is too large (at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`);
  const info = sniffImage(bytes);
  if (!info) throw bad('Unsupported image: use a PNG, JPEG, WebP or GIF file.');
  if (info.width < 1 || info.height < 1 || info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) throw bad(`The image must be between 1 and ${MAX_IMAGE_SIDE} pixels on each side.`);
  return { bytes, info };
}
