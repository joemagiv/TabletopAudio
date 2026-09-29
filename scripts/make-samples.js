/**
 * Generate tiny placeholder WAV files so the app can be tested end-to-end
 * without real audio. Run with: `npm run samples`.
 *
 * - Music: a few-second looping sine tone (loopable).
 * - Ambience: a low drone.
 * - SFX: a short beep.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY = path.resolve(__dirname, '..', 'library');

const SAMPLE_RATE = 44100;

/** Write a mono 16-bit PCM WAV buffer. samples is Float32 in [-1, 1]. */
function encodeWav(samples) {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // channels
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

/** Generate a tone with optional gentle fade-in/out at the edges. */
function tone(freq, durationSec, { type = 'sine', fade = 0.01, gain = 0.5 } = {}) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  const fadeSamples = Math.floor(SAMPLE_RATE * fade);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v;
    if (type === 'sine') v = Math.sin(2 * Math.PI * freq * t);
    else if (type === 'square') v = Math.sign(Math.sin(2 * Math.PI * freq * t));
    else v = Math.sin(2 * Math.PI * freq * t);
    // edge fade to avoid clicks (and loops cleanly for music)
    let env = gain;
    if (i < fadeSamples) env *= i / fadeSamples;
    else if (i > n - fadeSamples) env *= (n - i) / fadeSamples;
    out[i] = v * env;
  }
  return out;
}

/** A small descending "beep" for SFX. */
function beep(freqStart, freqEnd, durationSec, gain = 0.6) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  const fadeSamples = Math.floor(SAMPLE_RATE * 0.005);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const frac = i / n;
    const freq = freqStart + (freqEnd - freqStart) * frac;
    let env = gain * (1 - frac * 0.4);
    if (i < fadeSamples) env *= i / fadeSamples;
    else if (i > n - fadeSamples) env *= (n - i) / fadeSamples;
    out[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }
  return out;
}

async function writeFileSafe(abs, buf) {
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  console.log(`  wrote ${path.relative(LIBRARY, abs)}`);
}

async function main() {
  console.log('Generating sample audio into library/ ...');

  // Music tab (loopable tones)
  await writeFileSafe(
    path.join(LIBRARY, 'Music', 'Tavern Song.wav'),
    encodeWav(tone(440, 4, { fade: 0.02 }))
  );
  await writeFileSafe(
    path.join(LIBRARY, 'Music', 'Boss Fight.wav'),
    encodeWav(tone(110, 4, { type: 'square', fade: 0.02, gain: 0.4 }))
  );

  // Ambience tab (low drone)
  await writeFileSafe(
    path.join(LIBRARY, 'Ambience', 'Forest Night.wav'),
    encodeWav(tone(82, 6, { fade: 0.05, gain: 0.35 }))
  );

  // SFX tab (short beeps)
  await writeFileSafe(
    path.join(LIBRARY, 'SFX', 'Sword Hit.wav'),
    encodeWav(beep(900, 300, 0.3))
  );
  await writeFileSafe(
    path.join(LIBRARY, 'SFX', 'Door Creak.wav'),
    encodeWav(beep(200, 120, 0.4, 0.5))
  );

  console.log('Done. (Re-run any time; existing files are overwritten.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
