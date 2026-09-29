import { describe, it, expect } from 'vitest';
import { itemId } from '../server/util/ids.js';
import { createHash } from 'node:crypto';

describe('itemId', () => {
  it('is deterministic for the same path', () => {
    const a = itemId('Music/Boss Fight.ogg');
    const b = itemId('Music/Boss Fight.ogg');
    expect(a).toBe(b);
  });

  it('matches sha1(...).slice(0,12)', () => {
    const p = 'SFX/Sword Hit.wav';
    const expected = createHash('sha1').update(p).digest('hex').slice(0, 12);
    expect(itemId(p)).toBe(expected);
  });

  it('normalizes path separators', () => {
    // Windows backslash vs forward slash should produce the same id.
    const a = itemId('Music\\Track One.wav');
    const b = itemId('Music/Track One.wav');
    expect(a).toBe(b);
  });

  it('produces different ids for different paths', () => {
    expect(itemId('Music/A.wav')).not.toBe(itemId('Music/B.wav'));
  });

  it('returns a 12-char hex string', () => {
    const id = itemId('x/y.wav');
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });
});
