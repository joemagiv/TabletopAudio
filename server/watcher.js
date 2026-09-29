import chokidar from 'chokidar';

/**
 * Watch the library directory and call `onChange` (debounced) when it changes.
 * Watches _tab.json and audio/art files; ignores dotfiles.
 *
 * @param {string} libraryPath
 * @param {{onChange:()=>void, debounceMs?:number}} opts
 * @returns {import('chokidar').FSWatcher}
 */
export function startWatcher(libraryPath, { onChange, debounceMs = 300 }) {
  let timer = null;

  const watcher = chokidar.watch(libraryPath, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\./, // ignore dotfiles/dirs
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    persistent: true,
  });

  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(), debounceMs);
  };

  watcher
    .on('add', trigger)
    .on('unlink', trigger)
    .on('change', trigger)
    .on('addDir', trigger)
    .on('unlinkDir', trigger);

  return watcher;
}
