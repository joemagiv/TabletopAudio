// Tiny observable store. No external dependency.

const LS_KEY = 'soundboard.state.v1';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

const persisted = loadPersisted();

// ---- favorites (client-only, persisted in localStorage) ----
function loadFavorites() {
  try {
    const f = persisted.favorites;
    if (Array.isArray(f)) return new Set(f.filter((x) => typeof x === 'string'));
  } catch {
    /* ignore */
  }
  return new Set();
}

// Phones get a slightly smaller default so more buttons fit per row.
function defaultButtonScale() {
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth <= 600) {
    return 0.82;
  }
  return 1;
}

const state = {
  library: null,
  activeTabId: persisted.activeTabId || null,
  playing: new Map(), // itemId -> Set<voiceId>
  volumes: {
    master: typeof persisted?.volumes?.master === 'number' ? persisted.volumes.master : 1,
    music: typeof persisted?.volumes?.music === 'number' ? persisted.volumes.music : 1,
    sfx: typeof persisted?.volumes?.sfx === 'number' ? persisted.volumes.sfx : 1,
  },
  buttonScale: typeof persisted?.buttonScale === 'number' ? persisted.buttonScale : defaultButtonScale(),
  ui: { settingsItemId: null, unlocked: false },
  crossfadeMs: 1500,
  favorites: loadFavorites(),
};

const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        activeTabId: state.activeTabId,
        volumes: state.volumes,
        buttonScale: state.buttonScale,
        favorites: [...state.favorites],
      })
    );
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLibrary(lib) {
  state.library = lib;
  emit();
}

export function setActiveTab(id) {
  state.activeTabId = id;
  persist();
  emit();
}

export function setVolumes(v) {
  Object.assign(state.volumes, v);
  persist();
  emit();
}

export function setButtonScale(v) {
  state.buttonScale = v;
  persist();
  emit();
}

export function setCrossfade(ms) {
  state.crossfadeMs = ms;
}

export function setUnlocked(v) {
  state.ui.unlocked = v;
  emit();
}

export function openSettings(itemId) {
  state.ui.settingsItemId = itemId;
  emit();
}

export function closeSettings() {
  state.ui.settingsItemId = null;
  emit();
}

// ---- playing bookkeeping (kept in sync from engine events) ----
export function markVoiceStarted(itemId, voiceId) {
  let set = state.playing.get(itemId);
  if (!set) {
    set = new Set();
    state.playing.set(itemId, set);
  }
  set.add(voiceId);
}

export function markVoiceEnded(itemId, voiceId) {
  const set = state.playing.get(itemId);
  if (set) {
    set.delete(voiceId);
    if (set.size === 0) state.playing.delete(itemId);
  }
}

export function isPlayingState(itemId) {
  const set = state.playing.get(itemId);
  return !!set && set.size > 0;
}

// ---- favorites ----
export function isFavorite(id) {
  return state.favorites.has(id);
}

export function getFavorites() {
  return [...state.favorites];
}

/** Toggle favorite state for an item id. Returns the new (post-toggle) state. */
export function toggleFavorite(id) {
  const nowFav = !state.favorites.has(id);
  if (nowFav) state.favorites.add(id);
  else state.favorites.delete(id);
  persist();
  emit();
  return nowFav;
}

/** Remove favorites that no longer correspond to a library item. */
export function pruneFavorites(lib) {
  if (!lib) return;
  const present = new Set();
  for (const t of lib.tabs) {
    for (const it of t.items) present.add(it.id);
  }
  let changed = false;
  for (const id of state.favorites) {
    if (!present.has(id)) {
      state.favorites.delete(id);
      changed = true;
    }
  }
  if (changed) persist();
}
