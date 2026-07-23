/**
 * Tiny deterministic PNG builder (no external deps).
 * Used as a fallback when image generation is offline / fails.
 */

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = u32(data.length);
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  const crc = u32(crc32(body));
  const out = new Uint8Array(4 + body.length + 4);
  out.set(len, 0);
  out.set(body, 4);
  out.set(crc, 4 + body.length);
  return out;
}

/** 64×64 solid soft-blue PNG with a simple gradient (deterministic). */
export function buildPlaceholderPng(): Uint8Array {
  const w = 64;
  const h = 64;
  // IHDR
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(w), 0);
  ihdr.set(u32(h), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Raw image: filter byte 0 + RGB per row
  const raw = new Uint8Array((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0; // none filter
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      raw[i] = 80 + ((x * 2) & 0x7f);
      raw[i + 1] = 140 + ((y * 2) & 0x3f);
      raw[i + 2] = 220;
    }
  }

  // zlib store (no compression): CMF/FLG + stored blocks + adler32
  const zlib = zlibStore(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", zlib), chunk("IEND", new Uint8Array(0))];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function zlibStore(data: Uint8Array): Uint8Array {
  // Max stored block 65535; our 64x64 raw is small.
  const blocks: Uint8Array[] = [];
  let offset = 0;
  while (offset < data.length) {
    const len = Math.min(65535, data.length - offset);
    const isLast = offset + len >= data.length ? 1 : 0;
    const block = new Uint8Array(5 + len);
    block[0] = isLast; // BFINAL=1 for last, BTYPE=00
    block[1] = len & 0xff;
    block[2] = (len >>> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    block[3] = nlen & 0xff;
    block[4] = (nlen >>> 8) & 0xff;
    block.set(data.subarray(offset, offset + len), 5);
    blocks.push(block);
    offset += len;
  }
  const adler = u32(adler32(data));
  let size = 2 + 4;
  for (const b of blocks) size += b.length;
  const out = new Uint8Array(size);
  out[0] = 0x78; // CMF
  out[1] = 0x01; // FLG (no dict, check bits)
  let o = 2;
  for (const b of blocks) {
    out.set(b, o);
    o += b.length;
  }
  out.set(adler, o);
  return out;
}
