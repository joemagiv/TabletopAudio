import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import express from 'express';

import { loadConfig } from './config.js';
import { scanLibrary } from './scanner.js';
import { readSettings } from './settingsStore.js';
import { createLibraryRouter } from './routes/library.js';
import { createSettingsRouter } from './routes/settings.js';
import { createEventsRouter } from './routes/events.js';
import { startWatcher } from './watcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');

function lanAddresses(port) {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        out.push(`http://${info.address}:${port}`);
      }
    }
  }
  return out;
}

async function main() {
  const config = await loadConfig(CONFIG_PATH);

  const bus = createEventBus();
  let current = null;

  async function rescan() {
    const settings = await readSettings(SETTINGS_PATH);
    current = await scanLibrary(config.libraryPath, settings);
    bus.emit('library-changed', current);
    return current;
  }

  function getLibrary() {
    return current;
  }

  // Initial scan before serving.
  await rescan();

  const app = express();
  app.use(express.json());

  app.use(
    '/api',
    createLibraryRouter({
      getLibrary,
      rescan,
      crossfadeMs: config.client.crossfadeMs,
    })
  );
  app.use(
    '/api',
    createSettingsRouter({ settingsPath: SETTINGS_PATH, getLibrary, rescan })
  );
  app.use('/api', createEventsRouter({ bus, getLibrary }));

  // Read-only media serving with HTTP Range support.
  app.use(
    '/media',
    express.static(config.libraryPath, { acceptRanges: true, index: false, fallthrough: false })
  );

  // Static client. No-cache so the tablet always fetches fresh JS/CSS/HTML
  // after a reload (avoids stale client code silently running an old engine).
  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  const server = app.listen(config.port, config.host, () => {
    const local = `http://localhost:${config.port}`;
    const lan = lanAddresses(config.port);
    console.log('Tabletop Soundboard running');
    console.log(`  Local:   ${local}`);
    if (lan.length) {
      console.log(`  Network: ${lan.join('\n           ')}`);
    }
    const tabCount = current ? current.tabs.length : 0;
    const itemCount = current
      ? current.tabs.reduce((n, t) => n + t.items.length, 0)
      : 0;
    console.log(`  Library: ${tabCount} tab(s), ${itemCount} item(s)`);
    console.log('  Open the Network URL on your tablet (same Wi-Fi).');
  });

  if (config.watch) {
    startWatcher(config.libraryPath, {
      onChange: async () => {
        try {
          await rescan();
        } catch (err) {
          console.warn(`[watcher] rescan failed: ${err.message}`);
        }
      },
    });
  }

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
  });
}

/** Tiny event emitter wrapper. */
function createEventBus() {
  return new EventEmitter();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
