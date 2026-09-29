import { attachLongPress } from '../util/longPress.js';

/**
 * A single sound button. Real <button> with art/scrim, label, loop chip,
 * playing indicator, progress bar, and error state.
 *
 * @param {object} opts
 * @param {object} opts.item
 * @param {object} opts.tab
 * @param {object} opts.engine
 * @param {(item:object)=>void} opts.onToggleLoop
 * @param {(item:object)=>void} opts.onOpenSettings
 * @param {(item:object, tab:object)=>void} opts.onTap
 */
export function createButton({ item, tab, engine, onToggleLoop, onOpenSettings, onTap }) {
  const el = document.createElement('button');
  el.className = 'btn';
  el.type = 'button';
  el.dataset.id = item.id;
  el.style.setProperty('--accent', tab.color);

  const scrim = document.createElement('div');
  scrim.className = 'scrim';

  const badge = document.createElement('div');
  badge.className = 'state-badge';
  badge.textContent = '▶';

  const loop = document.createElement('span');
  loop.className = 'loop';
  loop.role = 'button';
  loop.tabIndex = 0;
  loop.textContent = '↻';
  loop.title = 'Toggle loop';
  loop.setAttribute('aria-label', `Toggle loop for ${item.label}`);

  const label = document.createElement('span');
  label.className = 'label';

  const progress = document.createElement('div');
  progress.className = 'progress';

  const warn = document.createElement('div');
  warn.className = 'warn';
  warn.textContent = '⚠';

  el.append(scrim, badge, loop, label, progress, warn);

  function applyArt(it) {
    if (it.artUrl) {
      el.style.backgroundImage = `url("${it.artUrl}")`;
      el.classList.remove('no-art');
    } else {
      el.style.backgroundImage = '';
      el.classList.add('no-art');
    }
  }

  function updateAria() {
    const playing = engine.isPlaying(item.id);
    el.setAttribute('aria-pressed', String(playing));
    el.setAttribute(
      'aria-label',
      `${item.label}, ${playing ? 'playing' : 'stopped'}, ${item.loop ? 'looping' : 'plays once'}`
    );
  }

  applyArt(item);
  label.textContent = item.label;
  loop.setAttribute('aria-pressed', String(!!item.loop));
  updateAria();

  // Loop chip: stop propagation so it never triggers playback.
  loop.addEventListener('pointerdown', (e) => e.stopPropagation());
  loop.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggleLoop(item);
  });
  loop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onToggleLoop(item);
    }
  });

  attachLongPress(el, {
    onTap: () => onTap(item, tab),
    onLongPress: () => onOpenSettings(item),
  });

  function update(it) {
    item = it;
    label.textContent = it.label;
    applyArt(it);
    loop.setAttribute('aria-pressed', String(!!it.loop));
  }

  function setPlaying(playing) {
    el.classList.toggle('playing', playing);
    badge.textContent = playing ? '■' : '▶';
    updateAria();
  }

  function setProgress(p) {
    progress.style.width = `${Math.round(p * 100)}%`;
  }

  function setError() {
    el.classList.add('error');
  }

  function setMissing(missing) {
    el.classList.toggle('missing', missing);
  }

  return { el, update, setPlaying, setProgress, setError, setMissing, itemId: item.id };
}
