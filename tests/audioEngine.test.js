import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createEngine } from '../public/js/audioEngine.js';

// ---- Minimal browser stubs ----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const gains = [];
class FakeParam {
  constructor(v = 1) {
    this.value = v;
  }
  setValueAtTime() {}
  cancelScheduledValues() {}
  setTargetAtTime() {}
}
class FakeNode {
  constructor() {
    this.gain = new FakeParam();
    this.connectedTo = null;
  }
  connect(target) {
    this.connectedTo = target;
  }
  disconnect() {}
}
const createdAudios = [];
class FakeAudio {
  constructor() {
    this.loop = false;
    this.currentTime = 0;
    this.duration = 2;
    this.src = '';
    createdAudios.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
  addEventListener() {}
}

beforeAll(() => {
  const Ctx = class {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = new FakeNode();
    }
    createGain() {
      const g = new FakeNode();
      gains.push(g);
      return g;
    }
    createMediaElementSource() {
      return new FakeNode();
    }
    createBufferSource() {
      return {
        connect() {},
        start() {},
        stop() {},
        onended: null,
        buffer: null,
        loop: false,
      };
    }
    decodeAudioData() {
      return Promise.resolve({ duration: 2 });
    }
    resume() {
      return Promise.resolve();
    }
  };
  globalThis.window = { AudioContext: Ctx };
  globalThis.AudioContext = Ctx;
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
});

afterAll(() => {
  delete globalThis.window;
  delete globalThis.AudioContext;
  delete globalThis.Audio;
  delete globalThis.fetch;
});

const musicItem = { id: 'm1', label: 'M', audioUrl: '/m.mp3', loop: true, volume: 1, sizeBytes: 1000 };
const sfxItem = { id: 's1', label: 'S', audioUrl: '/s.wav', loop: false, volume: 1, sizeBytes: 1000 };

describe('audioEngine', () => {
  it('plays music and sfx on independent buses', async () => {
    const engine = createEngine();
    await engine.play(musicItem, 'music');
    await engine.play(sfxItem, 'sfx');
    // The two item gains must connect to *different* bus nodes, both of which
    // feed the same master/destination.
    const itemGains = gains.slice(-2);
    expect(itemGains[0].connectedTo).not.toBe(itemGains[1].connectedTo);
    expect(itemGains[0].connectedTo.connectedTo).toBe(itemGains[1].connectedTo.connectedTo);
    expect(engine.isPlaying('m1')).toBe(true);
    expect(engine.isPlaying('s1')).toBe(true);
  });

  it('stopping one item does not affect others', async () => {
    const engine = createEngine();
    await engine.play(musicItem, 'music');
    await engine.play(sfxItem, 'sfx');
    engine.stopItem('m1', { fadeMs: 0.01 });
    await wait(150);
    expect(engine.isPlaying('m1')).toBe(false);
    expect(engine.isPlaying('s1')).toBe(true);
  });

  it('stopAll silences everything', async () => {
    const engine = createEngine();
    await engine.play(musicItem, 'music');
    await engine.play(sfxItem, 'sfx');
    engine.stopAll({ fadeMs: 0.01 });
    await wait(150);
    expect(engine.isPlaying('m1')).toBe(false);
    expect(engine.isPlaying('s1')).toBe(false);
  });

  it('retriggering non-looping SFX layers multiple voices', async () => {
    const engine = createEngine();
    await engine.play(sfxItem, 'sfx');
    await engine.play(sfxItem, 'sfx');
    expect(engine.isPlaying('s1')).toBe(true);
    engine.stopItem('s1', { fadeMs: 0.01 });
    await wait(150);
    expect(engine.isPlaying('s1')).toBe(false);
  });

  it('setLoop takes effect immediately on a playing (streamed) music item', async () => {
    const engine = createEngine();
    createdAudios.length = 0;
    const bigMusic = { id: 'm2', label: 'Big', audioUrl: '/big.mp3', loop: true, volume: 1, sizeBytes: 20 * 1024 * 1024 };
    await engine.play(bigMusic, 'music');
    expect(createdAudios[0].loop).toBe(true);
    engine.setLoop('m2', false);
    expect(createdAudios[0].loop).toBe(false);
  });

  it('setBusVolume / setMasterVolume accept values without error', () => {
    const engine = createEngine();
    expect(() => {
      engine.setMasterVolume(0.5);
      engine.setBusVolume('music', 0.4);
      engine.setBusVolume('sfx', 0.3);
    }).not.toThrow();
  });
});
