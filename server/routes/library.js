import express from 'express';

/**
 * GET /api/library  -> Library (settings resolved)
 * POST /api/rescan  -> force rescan, returns Library
 * GET /api/config   -> client config (e.g. crossfadeMs)
 *
 * @param {{getLibrary:()=>object, rescan:()=>Promise<object>, crossfadeMs:number}} deps
 */
export function createLibraryRouter({ getLibrary, rescan, crossfadeMs }) {
  const router = express.Router();

  router.get('/library', (req, res) => {
    const lib = getLibrary();
    if (!lib) return res.status(503).json({ error: 'Library not ready' });
    res.json(lib);
  });

  router.post('/rescan', async (req, res) => {
    try {
      const lib = await rescan();
      res.json(lib);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/config', (req, res) => {
    res.json({ crossfadeMs });
  });

  return router;
}
