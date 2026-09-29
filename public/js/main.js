import { createEngine } from './audioEngine.js';
import * as state from './state.js';
import * as api from './api.js';
import { createTabs } from './ui/tabs.js';
import { createGrid } from './ui/grid.js';
import { createMasterBar } from './ui/masterBar.js';
import { createSettingsSheet } from './ui/settingsSheet.js';
import { requestWakeLock, initWakeLockOnVisibility } from './util/wakeLock.js';

const engine = createEngine();

const dom = {
  tabs: document.getElementById('tabs'),
  grid: document.getElementById('grid'),
  master: document.getElementById('masterbar'),
  sheet: document.getElementById('settings-sheet'),
  backdrop: document.getElementById('sheet-backdrop'),
  overlay: document.getElementById('unlock-overlay'),
  unlockBtn: document.getElementById('unlock-btn'),
  rescanBtn: document.getElementById('rescan-btn'),
  aboutBtn: document.getElementById('settings-global-btn'),
  toast: document.getElementById('toast'),
};

let settingsItemId = null;
let toastTimer = null;

function showToast(msg, ms = 2500) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.hidden = true;
  }, ms);
}

function findItem(id) {
  const lib = state.getState().library;
  if (!lib) return null;
  for (const t of lib.tabs) {
    for (const it of t.items) if (it.id === id) return it;
  }
  return null;
}

function getActiveTab() {
  const lib = state.getState().library;
  if (!lib || !lib.tabs.length) return null;
  return lib.tabs.find((t) => t.id === state.getState().activeTabId) || lib.tabs[0];
}

function renderActive() {
  const tab = getActiveTab();
  const lib = state.getState().library;
  if (!tab) {
    grid.render(null, []);
    return;
  }
  tabs.render(lib.tabs, tab.id);
  grid.render(tab, tab.items);
}

// ---------- UI modules ----------
const tabs = createTabs({ tabsEl: dom.tabs, onSelect: selectTab });
const grid = createGrid({
  gridEl: dom.grid,
  engine,
  handlers: { onToggleLoop, onOpenSettings, onTap: handleTap },
});
const master = createMasterBar({
  el: dom.master,
  engine,
  volumes: state.getState().volumes,
  buttonScale: state.getState().buttonScale,
  onVolumeChange,
  onButtonScale,
  onStopAll,
});
const sheet = createSettingsSheet({
  sheetEl: dom.sheet,
  backdropEl: dom.backdrop,
  onSave,
  onReset,
});

// ---------- handlers ----------
function selectTab(id) {
  state.setActiveTab(id);
  renderActive();
}

function onToggleLoop(item) {
  const newLoop = !item.loop;
  onSave({ loop: newLoop }, item.id);
}

function onOpenSettings(item) {
  settingsItemId = item.id;
  state.openSettings(item.id);
  sheet.open(item);
}

function handleTap(item, tab) {
  engine.unlock();
  const playing = engine.isPlaying(item.id);
  if (tab.type === 'sfx' && playing && !item.loop) {
    // Non-looping SFX: layer another instance (retrigger).
    startWithExclusive(item, tab);
    return;
  }
  if (playing) {
    engine.stopItem(item.id, { fadeMs: 250 });
    return;
  }
  startWithExclusive(item, tab);
}

/**
 * Within the Music tab, force a single stream: starting a song stops any other
 * currently-playing song in that same tab. (Ambience keeps its own coexistence.)
 */
function stopOtherMusicVoices(tab, itemId) {
  for (const it of tab.items) {
    if (it.id !== itemId && engine.isPlaying(it.id)) {
      engine.stopItem(it.id, { fadeMs: 0.2 });
    }
  }
}

function startWithExclusive(item, tab) {
  if (tab.type === 'music') {
    stopOtherMusicVoices(tab, item.id);
  }
  if (tab.exclusive) {
    for (const other of tab.items) {
      if (other.id !== item.id && engine.isPlaying(other.id)) {
        engine.stopItem(other.id, { fadeMs: state.getState().crossfadeMs });
      }
    }
  }
  engine.play(item, tab.type);
}

function onVolumeChange(key, value) {
  state.setVolumes({ [key]: value });
  if (key === 'master') engine.setMasterVolume(value);
  else engine.setBusVolume(key, value);
}

function applyButtonScale(scale) {
  document.documentElement.style.setProperty('--btn-scale', String(scale));
}

function onButtonScale(value) {
  applyButtonScale(value);
  state.setButtonScale(value);
}

function onStopAll() {
  engine.stopAll({ fadeMs: 250 });
  showToast('Stopped all audio');
}

async function onSave(patch, explicitId) {
  const id = explicitId || settingsItemId;
  if (!id) return;
  try {
    const updated = await api.putItemSettings(id, patch);
    const it = findItem(id);
    if (it) Object.assign(it, { label: updated.label, loop: updated.loop, volume: updated.volume });
    if ('loop' in patch) engine.setLoop(id, updated.loop);
    if ('volume' in patch) engine.setItemVolume(id, updated.volume);
    renderActive();
  } catch {
    showToast('Could not save settings');
  }
}

async function onReset() {
  if (!settingsItemId) return;
  try {
    await api.deleteItemSettings(settingsItemId);
    await loadLibrary();
  } catch {
    showToast('Reset failed');
  }
}

// ---------- engine events ----------
function updateButtonPlaying(itemId) {
  const b = grid.getButton(itemId);
  if (b) b.setPlaying(engine.isPlaying(itemId));
}

engine.on('voice-started', ({ itemId, voiceId }) => {
  state.markVoiceStarted(itemId, voiceId);
  updateButtonPlaying(itemId);
});
engine.on('voice-ended', ({ itemId, voiceId }) => {
  state.markVoiceEnded(itemId, voiceId);
  updateButtonPlaying(itemId);
});
engine.on('error', ({ itemId }) => {
  const b = grid.getButton(itemId);
  if (b) b.setError();
  showToast('A sound could not be played');
});

// ---------- library loading ----------
async function loadLibrary() {
  try {
    const lib = await api.fetchLibrary();
    state.setLibrary(lib);
    if (!lib.tabs.find((t) => t.id === state.getState().activeTabId) && lib.tabs.length) {
      state.setActiveTab(lib.tabs[0].id);
    }
    renderActive();
  } catch {
    showToast('Could not load library');
  }
}

// ---------- unlock / wake lock ----------
function doUnlock() {
  engine
    .unlock()
    .then(() => {
      state.setUnlocked(true);
      dom.overlay.classList.add('hidden');
      requestWakeLock();
    })
    .catch(() => {});
}

dom.unlockBtn.addEventListener('click', doUnlock);
document.addEventListener('pointerdown', doUnlock, { once: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.getState().ui.unlocked) {
    engine.unlock();
  }
});
initWakeLockOnVisibility();

dom.rescanBtn.addEventListener('click', async () => {
  showToast('Rescanning…');
  try {
    await api.rescan();
    await loadLibrary();
    showToast('Library updated');
  } catch {
    showToast('Rescan failed');
  }
});

dom.aboutBtn.addEventListener('click', () => {
  showToast('Drop audio files into the library folder on the server to add sounds.', 4000);
});

// ---------- live updates via SSE ----------
api.subscribeEvents(() => {
  // Refetch and re-render without interrupting playback.
  loadLibrary();
});

// ---------- progress / playing animation loop ----------
function tick() {
  const lib = state.getState().library;
  if (lib) {
    for (const t of lib.tabs) {
      for (const it of t.items) {
        const b = grid.getButton(it.id);
        if (!b) continue;
        const playing = engine.isPlaying(it.id);
        if (b._playing !== playing) {
          b.setPlaying(playing);
          b._playing = playing;
        }
        const p = engine.getProgress(it.id);
        if (p != null) b.setProgress(p);
      }
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- boot ----------
async function boot() {
  const cfg = await api.fetchConfig();
  state.setCrossfade(cfg.crossfadeMs || 1500);

  // Apply persisted volumes (stored as targets until context exists).
  const v = state.getState().volumes;
  engine.setMasterVolume(v.master);
  engine.setBusVolume('music', v.music);
  engine.setBusVolume('sfx', v.sfx);

  // Apply persisted button scale (phone gets a smaller default).
  applyButtonScale(state.getState().buttonScale);

  await loadLibrary();
}

boot();
