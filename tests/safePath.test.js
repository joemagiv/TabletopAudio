import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { safeResolve } from '../server/util/safePath.js';

describe('safeResolve', () => {
  const base = '/srv/library';

  it('resolves a safe nested path inside base', () => {
    const out = safeResolve(base, 'Music', 'Boss Fight.ogg');
    expect(out).toBe(path.resolve(base, 'Music/Boss Fight.ogg'));
  });

  it('rejects parent traversal with ..', () => {
    expect(() => safeResolve(base, 'Music', '..', '..', 'etc', 'passwd')).toThrow();
  });

  it('rejects absolute path segments that escape', () => {
    expect(() => safeResolve(base, '/etc/passwd')).toThrow();
  });

  it('rejects url-encoded traversal', () => {
    expect(() => safeResolve(base, '%2e%2e', '%2f%2e%2e', 'secret')).toThrow();
  });

  it('rejects null bytes', () => {
    expect(() => safeResolve(base, 'foo\0bar')).toThrow();
  });

  it('returns base itself when given no segments', () => {
    expect(safeResolve(base)).toBe(path.resolve(base));
  });
});
