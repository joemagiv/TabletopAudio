import express from 'express';
import { upsertItem, deleteItem } from '../settingsStore.js';

/**
 * Find an item (and its relative key) by id across all tabs.
 * @param {object} library
 * @param {string} id
 */
function findItem(library, id) {
  for (const tab of library.tabs) {
    for (const item of tab.items) {
      if (item.id === id) {
        const relKey = decodeURIComponent(item.audioUrl.replace(/^\/media\//, ''));
        return { item, relKey };
      }
    }
  }
  return null;
}

/**
 * PUT /api/items/:id/settings  body: { loop?, volume?, label? }
 * DELETE /api/items/:id/settings
 *
 * @param {{settingsPath:string, getLibrary:()=>object, rescan:()=>Promise<object>}} deps
 */
export function createSettingsRouter({ settingsPath, getLibrary, rescan }) {
  const router = express.Router();

  router.put('/items/:id/settings', async (req, res) => {
    const library = getLibrary();
    if (!library) return res.status(503).json({ error: 'Library not ready' });
    const found = findItem(library, req.params.id);
    if (!found) return res.status(404).json({ error: 'Item not found' });

    const patch = {};
    const body = req.body || {};
    if ('loop' in body) {
      if (typeof body.loop !== 'boolean') return res.status(400).json({ error: 'loop must be boolean' });
      patch.loop = body.loop;
    }
    if ('volume' in body) {
      const v = Number(body.volume);
      if (Number.isNaN(v)) return res.status(400).json({ error: 'volume must be number' });
      patch.volume = v;
    }
    if ('label' in body) {
      if (typeof body.label !== 'string') return res.status(400).json({ error: 'label must be string' });
      patch.label = body.label;
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    try {
      await upsertItem(settingsPath, found.relKey, patch);
      const lib = await rescan();
      const updated = findItem(lib, req.params.id);
      res.json(updated ? updated.item : found.item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/items/:id/settings', async (req, res) => {
    const library = getLibrary();
    if (!library) return res.status(503).json({ error: 'Library not ready' });
    const found = findItem(library, req.params.id);
    if (!found) return res.status(404).json({ error: 'Item not found' });
    try {
      await deleteItem(settingsPath, found.relKey);
      await rescan();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
