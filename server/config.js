import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULTS = {
  port: 3000,
  host: '0.0.0.0',
  libraryPath: './library',
  watch: true,
  client: { crossfadeMs: 1500 },
};

/**
 * Load config.json, merging with defaults and writing defaults if missing.
 * libraryPath is resolved to an absolute path.
 *
 * @param {string} configPath absolute path to config.json
 * @returns {Promise<Object>}
 */
export async function loadConfig(configPath) {
  let user = {};
  let existed = true;
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    user = JSON.parse(raw);
  } catch {
    existed = false;
  }

  const merged = {
    ...DEFAULTS,
    ...user,
    client: { ...DEFAULTS.client, ...(user.client || {}) },
  };

  if (!existed) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf8');
  }

  merged.libraryPath = path.resolve(process.cwd(), merged.libraryPath);
  return merged;
}
