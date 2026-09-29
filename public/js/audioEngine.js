/**
 * Web Audio playback engine.
 *
 * Graph:
 *   [music item] -> itemGain ─┐
 *                             ├─> musicBus ─┐
 *   [sfx voice]  -> itemGain ─┘             ├─> masterGain -> destination
 *                             └─> sfxBus ───┘
 *
 * Music items use an HTMLAudioElement (streamed, loopable). SFX items are
 * decoded into AudioBuffers for low-latency, overlapping playback. The two
 * independent buses guarantee that SFX never affect music.
 */

const FADE_DEFAULT = 0.25; // seconds
const SFX_STREAM_THRESHOLD = 10 * 1024 * 1024; // >10 MB -> stream like music

export function createEngine({ crossfadeMs = 1500 } = {}) {
  let ctx = null;
  let masterGain = null;
  let musicBus = null;
  let sfxBus = null;

  // Target volumes so they apply as soon as the context exists.
  let masterVol = 1;
  let musicVol = 1;
  let sfxVol = 1;

  /** @type {Map<string, AudioBuffer>} */
  const buffers = new Map();

  /** @type {Map<string, object>} voiceId -> voice */
  const voices = new Map();
  /** @type {Map<string, Set<string>>} itemId -> Set<voiceId> */
  const itemVoices = new Map();

  /** per-item latest loop/volume so re-plays honor live changes */
  const loopState = new Map();
  const volumeState = new Map();

  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  let voiceCounter = 0;

  function ensureCtx() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    masterGain.gain.value = masterVol;
    musicBus.gain.value = musicVol;
    sfxBus.gain.value = sfxVol;
    musicBus.connect(masterGain);
    sfxBus.connect(masterGain);
    masterGain.connect(ctx.destination);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (set) for (const fn of set) fn(payload);
  }

  function unlock() {
    ensureCtx();
    if (ctx.state === 'suspended') return ctx.resume();
    return Promise.resolve();
  }

  function registerVoice(itemId, voice) {
    voices.set(voice.id, voice);
    let set = itemVoices.get(itemId);
    if (!set) {
      set = new Set();
      itemVoices.set(itemId, set);
    }
    set.add(voice.id);
    emit('voice-started', { itemId, voiceId: voice.id, bus: voice.bus });
  }

  function endVoice(voiceId) {
    const voice = voices.get(voiceId);
    if (!voice) return;
    voices.delete(voiceId);
    const set = itemVoices.get(voice.itemId);
    if (set) {
      set.delete(voiceId);
      if (set.size === 0) itemVoices.delete(voice.itemId);
    }
    emit('voice-ended', { itemId: voice.itemId, voiceId });
  }

  async function getBuffer(item) {
    if (buffers.has(item.id)) return buffers.get(item.id);
    const res = await fetch(item.audioUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    buffers.set(item.id, buf);
    return buf;
  }

  /**
   * Start playback of an item.
   * @param {object} item
   * @param {"music"|"sfx"} tabType
   * @returns {string|null} voiceId
   */
  async function play(item, tabType) {
    ensureCtx();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }

    const busName = tabType === 'music' ? 'music' : 'sfx';
    const bus = busName === 'music' ? musicBus : sfxBus;
    const loop = loopState.get(item.id) ?? item.loop;
    const vol = volumeState.get(item.id) ?? item.volume ?? 1;

    const itemGain = ctx.createGain();
    itemGain.gain.value = vol;
    itemGain.connect(bus);

    const voiceId = `v${++voiceCounter}`;
    let voice;

    // Stream only very large files (>10 MB) to avoid decoding hundreds of MB
    // into RAM. Everything else (including music) is decoded into an
    // AudioBuffer and played with an AudioBufferSourceNode, which is reliable
    // across browsers (including iOS) and gives sample-accurate looping.
    const streamThis = (item.sizeBytes || 0) > SFX_STREAM_THRESHOLD;

    if (streamThis) {
      const audio = new Audio();
      audio.src = item.audioUrl;
      audio.loop = loop;
      audio.preload = 'auto';
      const source = ctx.createMediaElementSource(audio);
      source.connect(itemGain);
      voice = {
        id: voiceId,
        itemId: item.id,
        bus: busName,
        gain: itemGain,
        audio,
        source,
        startedAt: 0,
        duration: 0,
        loop,
        stopped: false,
      };
      audio.addEventListener('loadedmetadata', () => {
        voice.duration = audio.duration || 0;
      });
      audio.addEventListener('ended', () => {
        if (!audio.loop && !voice.stopped) endVoice(voiceId);
      });
      audio.addEventListener('error', () => {
        emit('error', { itemId: item.id });
        if (!voice.stopped) endVoice(voiceId);
      });
      registerVoice(item.id, voice);
      try {
        await audio.play();
      } catch {
        emit('error', { itemId: item.id });
        endVoice(voiceId);
        return null;
      }
      return voiceId;
    }

    // SFX buffer path
    try {
      const buffer = await getBuffer(item);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.connect(itemGain);
      voice = {
        id: voiceId,
        itemId: item.id,
        bus: busName,
        gain: itemGain,
        source,
        startedAt: ctx.currentTime,
        duration: buffer.duration,
        loop,
        stopped: false,
      };
      source.onended = () => {
        if (!source.loop && !voice.stopped) endVoice(voiceId);
      };
      registerVoice(item.id, voice);
      source.start(0);
      return voiceId;
    } catch {
      emit('error', { itemId: item.id });
      endVoice(voiceId);
      return null;
    }
  }

  function ramp(param, value, fadeMs) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const tc = Math.max(0.01, fadeMs / 3);
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, tc);
  }

  function fadeOut(param, fadeMs) {
    ramp(param, 0, fadeMs);
  }

  function stopVoice(voiceId, { fadeMs = FADE_DEFAULT } = {}) {
    const voice = voices.get(voiceId);
    if (!voice) return;
    if (voice.stopped) return;
    voice.stopped = true;
    // Cap the fade so the source is hard-stopped promptly. The gain ramp also
    // drives the signal to ~0 quickly, guaranteeing silence even if the
    // browser's pause()/stop() is unreliable.
    const fade = Math.min(fadeMs, 0.12);
    fadeOut(voice.gain.gain, fade);
    const cleanup = () => {
      try {
        if (voice.audio) voice.audio.pause();
        if (voice.source) {
          try {
            voice.source.stop();
          } catch {
            /* already stopped */
          }
        }
      } catch {
        /* ignore */
      }
      try {
        voice.gain.disconnect();
      } catch {
        /* ignore */
      }
      endVoice(voiceId);
    };
    setTimeout(cleanup, fade * 1000 + 60);
  }

  function stopItem(itemId, opts) {
    const set = itemVoices.get(itemId);
    if (!set) return;
    for (const id of Array.from(set)) stopVoice(id, opts);
  }

  function stopAll(opts) {
    for (const id of Array.from(voices.keys())) stopVoice(id, opts);
  }

  function stopBus(bus, opts) {
    for (const [id, v] of voices) {
      if (v.bus === bus) stopVoice(id, opts);
    }
  }

  function eachVoiceOf(itemId, fn) {
    const set = itemVoices.get(itemId);
    if (!set) return;
    for (const id of set) {
      const v = voices.get(id);
      if (v) fn(v);
    }
  }

  function setLoop(itemId, loop) {
    loopState.set(itemId, loop);
    eachVoiceOf(itemId, (v) => {
      v.loop = loop;
      if (v.audio) v.audio.loop = loop;
      if (v.source) v.source.loop = loop;
    });
  }

  function setItemVolume(itemId, volume) {
    volumeState.set(itemId, volume);
    eachVoiceOf(itemId, (v) => ramp(v.gain.gain, volume, 0.05));
  }

  function setBusVolume(bus, volume) {
    if (bus === 'music') musicVol = volume;
    else sfxVol = volume;
    if (!ctx) return;
    ramp(bus === 'music' ? musicBus.gain : sfxBus.gain, volume, 0.05);
  }

  function setMasterVolume(volume) {
    masterVol = volume;
    if (!ctx) return;
    ramp(masterGain.gain, volume, 0.05);
  }

  function isPlaying(itemId) {
    const set = itemVoices.get(itemId);
    return !!set && set.size > 0;
  }

  function getProgress(itemId) {
    const set = itemVoices.get(itemId);
    if (!set || set.size === 0) return null;
    // newest voice = last registered
    let chosen = null;
    for (const id of set) {
      const v = voices.get(id);
      if (v) chosen = v;
    }
    if (!chosen || !ctx) return null;
    if (chosen.audio) {
      const d = chosen.duration || chosen.audio.duration || 0;
      if (!d) return 0;
      return Math.min(1, Math.max(0, chosen.audio.currentTime / d));
    }
    const d = chosen.duration;
    if (!d) return 0;
    let p = (ctx.currentTime - chosen.startedAt) / d;
    if (chosen.loop) p = p % 1;
    return Math.min(1, Math.max(0, p));
  }

  function on(event, fn) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  return {
    unlock,
    play,
    stop: stopVoice,
    stopItem,
    stopAll,
    stopBus,
    setLoop,
    setItemVolume,
    setBusVolume,
    setMasterVolume,
    isPlaying,
    getProgress,
    on,
  };
}

