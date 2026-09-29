import fs from 'node:fs/promises';
import path from 'node:path';

let writeQueue = Promise.resolve();

function clamp01(n) {
  if (Number.isNaN(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

/** Read settings.json, returning {} if missing/invalid. */
export async function readSettings(settingsPath) {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

async function atomicWrite(p, data) {
  const tmp = `${p}.tmp`;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, p);
}

// Serialize all writes so concurrent settings PUTs never clobber each other.
function serialize(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => {},
    () => {}
  );
  return run;
}

/** Merge a patch into one item's overrides and persist atomically. */
export async function upsertItem(settingsPath, key, patch) {
  return serialize(async () => {
    const data = await readSettings(settingsPath);
    const current = data[key] || {};
    const next = { ...current };
    if ('loop' in patch) next.loop = !!patch.loop;
    if ('volume' in patch) next.volume = clamp01(Number(patch.volume));
    if ('label' in patch && typeof patch.label === 'string') {
      next.label = patch.label.slice(0, 100);
    }
    data[key] = next;
    await atomicWrite(settingsPath, data);
    return next;
  });
}

/** Remove all overrides for an item. */
export async function deleteItem(settingsPath, key) {
  return serialize(async () => {
    const data = await readSettings(settingsPath);
    if (key in data) {
      delete data[key];
      await atomicWrite(settingsPath, data);
    }
    return data;
  });
}
