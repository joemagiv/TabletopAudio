import express from 'express';

/**
 * GET /api/events  Server-Sent Events stream.
 * Emits `library-changed` (with version) whenever the library is rescanned.
 *
 * @param {{bus:import('node:events').EventEmitter, getLibrary:()=>object}} deps
 */
export function createEventsRouter({ bus, getLibrary }) {
  const router = express.Router();

  router.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');

    const send = (lib) => {
      const payload = JSON.stringify({ version: lib.version });
      res.write(`event: library-changed\ndata: ${payload}\n\n`);
    };

    // initial state
    const lib = getLibrary();
    if (lib) send(lib);

    const onChanged = (next) => send(next);
    bus.on('library-changed', onChanged);

    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('library-changed', onChanged);
    });
  });

  return router;
}
