/**
 * Generate simple PNG app icons for the PWA (no external deps).
 * Run with: `node scripts/make-icons.js`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'icons');

// CRC32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Build a 512x512 PNG: purple->cyan gradient with a white sound-ring. */
function makeIcon(size) {
  const top = [124, 58, 237]; // #7c3aed
  const bottom = [14, 165, 233]; // #0ea5e9
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.26;
  let pos = 0;
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0; // filter: none
    const t = y / (size - 1);
    for (let x = 0; x < size; x++) {
      let r = lerp(top[0], bottom[0], t);
      let g = lerp(top[1], bottom[1], t);
      let b = lerp(top[2], bottom[2], t);
      const d = Math.hypot(x - cx, y - cy);
      // white ring
      const ring = Math.max(0, 1 - Math.abs(d - ringR) / (size * 0.03));
      r = lerp(r, 255, ring * 0.9);
      g = lerp(g, 255, ring * 0.9);
      b = lerp(b, 255, ring * 0.9);
      raw[pos++] = r;
      raw[pos++] = g;
      raw[pos++] = b;
      raw[pos++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const sizes = [192, 512];
  for (const s of sizes) {
    const png = makeIcon(s);
    await fs.writeFile(path.join(OUT, `icon-${s}.png`), png);
    await fs.writeFile(path.join(OUT, `icon-maskable-${s}.png`), png);
    console.log(`  wrote icon-${s}.png (${png.length} bytes)`);
  }
  // apple-touch-icon (180)
  const apple = makeIcon(180);
  await fs.writeFile(path.join(OUT, 'apple-touch-icon.png'), apple);
  console.log('  wrote apple-touch-icon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
