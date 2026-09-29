import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanLibrary } from '../server/scanner.js';
import { itemId } from '../server/util/ids.js';

let tmp;
let libraryDir;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'soundboard-test-'));
  libraryDir = path.join(tmp, 'library');

  const musicDir = path.join(libraryDir, 'Music');
  const sfxDir = path.join(libraryDir, 'SFX');
  await fs.mkdir(musicDir, { recursive: true });
  await fs.mkdir(sfxDir, { recursive: true });

  // Music tab with a _tab.json (type music, loop default true)
  await fs.writeFile(
    path.join(musicDir, '_tab.json'),
    JSON.stringify({ label: 'Music', type: 'music', defaults: { loop: true } })
  );
  await fs.writeFile(path.join(musicDir, 'Track 2.wav'), Buffer.alloc(100));
  await fs.writeFile(path.join(musicDir, 'Track 10.wav'), Buffer.alloc(100));
  await fs.writeFile(path.join(musicDir, 'Tavern.jpg'), Buffer.alloc(10)); // art
  await fs.writeFile(path.join(musicDir, 'Tavern.wav'), Buffer.alloc(100)); // matches art

  // SFX tab (no config -> type sfx, loop default false)
  await fs.writeFile(path.join(sfxDir, 'Beep.wav'), Buffer.alloc(50));
  // a hidden/underscore file should be ignored
  await fs.writeFile(path.join(sfxDir, '.hidden.wav'), Buffer.alloc(10));
  await fs.writeFile(path.join(sfxDir, '_notes.txt'), Buffer.alloc(10));
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('scanLibrary', () => {
  it('discovers tabs and sorts them by label', async () => {
    const lib = await scanLibrary(libraryDir, {});
    expect(lib.tabs.map((t) => t.label)).toEqual(['Music', 'SFX']);
  });

  it('sorts items with numeric awareness', async () => {
    const lib = await scanLibrary(libraryDir, {});
    const music = lib.tabs.find((t) => t.label === 'Music');
    expect(music.items.map((i) => i.label)).toEqual(['Tavern', 'Track 2', 'Track 10']);
  });

  it('assigns correct default loop by tab type', async () => {
    const lib = await scanLibrary(libraryDir, {});
    const music = lib.tabs.find((t) => t.label === 'Music');
    const sfx = lib.tabs.find((t) => t.label === 'SFX');
    expect(music.items.every((i) => i.loop === true)).toBe(true);
    expect(sfx.items.every((i) => i.loop === false)).toBe(true);
  });

  it('detects sibling art', async () => {
    const lib = await scanLibrary(libraryDir, {});
    const music = lib.tabs.find((t) => t.label === 'Music');
    const tavern = music.items.find((i) => i.label === 'Tavern');
    expect(tavern.artUrl).toBe('/media/Music/Tavern.jpg');
  });

  it('ignores hidden and underscore files', async () => {
    const lib = await scanLibrary(libraryDir, {});
    const sfx = lib.tabs.find((t) => t.label === 'SFX');
    const names = sfx.items.map((i) => i.label);
    expect(names).toEqual(['Beep']);
  });

  it('respects per-item settings overrides', async () => {
    const settings = { 'Music/Track 2.wav': { loop: false, volume: 0.3, label: 'Quiet' } };
    const lib = await scanLibrary(libraryDir, settings);
    const music = lib.tabs.find((t) => t.label === 'Music');
    const t2 = music.items.find((i) => i.id === itemId('Music/Track 2.wav'));
    expect(t2.loop).toBe(false);
    expect(t2.volume).toBe(0.3);
    expect(t2.label).toBe('Quiet');
  });

  it('produces stable ids and a version string', async () => {
    const lib = await scanLibrary(libraryDir, {});
    const music = lib.tabs.find((t) => t.label === 'Music');
    expect(music.id).toBe(itemId('Music'));
    expect(typeof lib.version).toBe('string');
    expect(lib.version.length).toBeGreaterThan(0);
  });

  it('returns an empty library for a missing path', async () => {
    const lib = await scanLibrary(path.join(tmp, 'does-not-exist'), {});
    expect(lib.tabs).toEqual([]);
  });
});
