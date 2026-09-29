import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { itemId } from './util/ids.js';
import { encodePathSegments } from './util/safePath.js';

const AUDIO_EXT = new Set([
  '.mp3', '.ogg', '.oga', '.opus', '.wav', '.m4a', '.aac', '.flac', '.webm',
]);
const ART_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MUSIC_FOLDER_NAMES = new Set([
  'music', 'ambience', 'ambient', 'bgm',
]);

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} label
 * @property {string} audioUrl
 * @property {string|null} artUrl
 * @property {boolean} loop
 * @property {number} volume
 * @property {number} sizeBytes
 */

/**
 * @typedef {Object} Tab
 * @property {string} id
 * @property {string} label
 * @property {"music"|"sfx"} type
 * @property {string} color
 * @property {string|null} icon
 * @property {boolean} exclusive
 * @property {Item[]} items
 */

/**
 * @typedef {Object} Library
 * @property {Tab[]} tabs
 * @property {string} version
 */

function isHidden(name) {
  return name.startsWith('_') || name.startsWith('.');
}

function ext(name) {
  return path.extname(name).toLowerCase();
}

/** Derive a stable, pleasant hex color from a string. */
function deriveColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const sat = 60;
  const light = 55;
  const s = sat / 100;
  const l = light / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function clamp01(n) {
  if (Number.isNaN(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

/**
 * Scan a tab folder's _tab.json (if present) merged with defaults.
 * @param {string} folderName
 * @param {string} tabDir
 * @returns {Object}
 */
function resolveTabConfig(folderName, tabDir) {
  const lower = folderName.toLowerCase();
  const defaultType = MUSIC_FOLDER_NAMES.has(lower) ? 'music' : 'sfx';
  const base = {
    label: folderName,
    type: defaultType,
    color: deriveColor(folderName),
    icon: null,
    order: 0,
    defaults: { loop: defaultType === 'music', volume: 1.0 },
    exclusive: false,
  };
  const tabJsonPath = path.join(tabDir, '_tab.json');
  try {
    const raw = fsSync.readFileSync(tabJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      label: parsed.label ?? base.label,
      type: parsed.type === 'music' || parsed.type === 'sfx' ? parsed.type : base.type,
      color: typeof parsed.color === 'string' ? parsed.color : base.color,
      icon: typeof parsed.icon === 'string' ? parsed.icon : base.icon,
      order: typeof parsed.order === 'number' ? parsed.order : base.order,
      defaults: {
        loop:
          typeof parsed?.defaults?.loop === 'boolean'
            ? parsed.defaults.loop
            : base.defaults.loop,
        volume:
          typeof parsed?.defaults?.volume === 'number'
            ? clamp01(parsed.defaults.volume)
            : base.defaults.volume,
      },
      exclusive:
        typeof parsed.exclusive === 'boolean' ? parsed.exclusive : base.exclusive,
    };
  } catch {
    return base;
  }
}

/**
 * Find a sibling image with the same basename. Returns the media URL or null.
 * @param {string} audioFile absolute audio path
 * @param {string} libraryPath absolute library root
 * @returns {Promise<string|null>}
 */
async function findArt(audioFile, libraryPath) {
  const base = audioFile.slice(0, audioFile.length - path.extname(audioFile).length);
  for (const e of ART_EXT) {
    const candidate = base + e;
    try {
      await fs.access(candidate);
      const rel = path.relative(libraryPath, candidate).split(path.sep).join('/');
      return `/media/${encodePathSegments(rel)}`;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Build the version string (stable per content). */
function computeVersion(tabs) {
  const shape = tabs.map((t) => ({
    id: t.id,
    label: t.label,
    type: t.type,
    exclusive: t.exclusive,
    items: t.items.map((i) => ({
      id: i.id,
      label: i.label,
      loop: i.loop,
      volume: i.volume,
      size: i.sizeBytes,
    })),
  }));
  return createHash('sha1').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}

/**
 * Pure library scan. No Express dependency.
 *
 * @param {string} libraryPath absolute path to the library root
 * @param {Record<string, {loop?:boolean, volume?:number, label?:string}>} settings
 *   per-item overrides keyed by forward-slash relative path
 * @returns {Promise<Library>}
 */
export async function scanLibrary(libraryPath, settings = {}) {
  let entries;
  try {
    entries = await fs.readdir(libraryPath, { withFileTypes: true });
  } catch (err) {
    console.warn(`[scanner] cannot read library dir ${libraryPath}: ${err.message}`);
    return { tabs: [], version: computeVersion([]) };
  }

  const tabEntries = entries.filter(
    (e) => e.isDirectory() && !isHidden(e.name)
  );

  const tabs = [];
  for (const tabEntry of tabEntries) {
    const tabDir = path.join(libraryPath, tabEntry.name);
    const cfg = resolveTabConfig(tabEntry.name, tabDir);

    let fileEntries;
    try {
      fileEntries = await fs.readdir(tabDir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[scanner] cannot read tab dir ${tabDir}: ${err.message}`);
      fileEntries = [];
    }

    const items = [];
    for (const f of fileEntries) {
      if (!f.isFile() || isHidden(f.name)) continue;
      if (!AUDIO_EXT.has(ext(f.name))) continue;

      const absFile = path.join(tabDir, f.name);
      const relKey = `${tabEntry.name}/${f.name}`.split(path.sep).join('/');
      const baseName = path.basename(f.name, path.extname(f.name));
      const override = settings[relKey] || {};

      let sizeBytes = 0;
      try {
        const st = await fs.stat(absFile);
        sizeBytes = st.size;
      } catch (err) {
        console.warn(`[scanner] cannot stat ${absFile}: ${err.message}`);
        continue;
      }

      const artUrl = await findArt(absFile, libraryPath);

      items.push({
        id: itemId(relKey),
        label: typeof override.label === 'string' ? override.label.slice(0, 100) : baseName,
        audioUrl: `/media/${encodePathSegments(relKey)}`,
        artUrl,
        loop: typeof override.loop === 'boolean' ? override.loop : cfg.defaults.loop,
        volume:
          typeof override.volume === 'number' ? clamp01(override.volume) : cfg.defaults.volume,
        sizeBytes,
      });
    }

    items.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
    );

    tabs.push({
      id: itemId(tabEntry.name),
      label: cfg.label,
      type: cfg.type,
      color: cfg.color,
      icon: cfg.icon,
      exclusive: cfg.exclusive,
      items,
    });
  }

  tabs.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  });

  return { tabs, version: computeVersion(tabs) };
}

