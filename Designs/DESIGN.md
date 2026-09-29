# Tabletop Soundboard: Design Document

> **Audience:** This document is written to be read by an AI coding agent (Cline in VS Code) and by the human supervising it. It is intentionally explicit about decisions, file layout, API shapes, and acceptance criteria so the agent doesn't have to guess. Where a decision is left open, it is marked **[DECISION]** with a default to use.

---

## 1. Overview

A self-hosted, web-based soundboard for running Dungeons & Dragons sessions. A Dungeon Master runs a small server on a computer that holds all audio files. They open the web UI on a tablet (primary target) or phone/laptop on the same network and tap large buttons to play music, ambience, and sound effects.

### Goals

- **Big, tappable buttons** in a grid, usable one-handed on a tablet in a dim room.
- **Tabs** to organize buttons (Music, Ambience, SFX, etc.), each backed by a folder on the server.
- **Simultaneous playback:** triggering a sound effect must never stop or interrupt music that is already playing. Multiple music cues may also play at once.
- **Per-button looping:** each button can independently loop or play once.
- **Zero-config content management:** drop audio files into folders; buttons appear. Optional cover art per button.
- **Runs on a LAN** with no cloud, accounts, or internet dependency.

### Non-Goals (v1)

- No user accounts or authentication (LAN only).
- No in-app file upload or audio editing.
- No streaming-service integration (Spotify, YouTube).
- No multi-user sync of playback state across devices (see Future Work).

---

## 2. Key Assumptions

| # | Assumption | Notes |
|---|-----------|-------|
| A1 | **Audio plays on the client device** (the tablet), streamed from the server over HTTP. | The tablet's output goes to a Bluetooth/aux speaker. Server-side playback is out of scope. |
| A2 | Server runs on Windows, macOS, or Linux with **Node.js 20+**. | |
| A3 | Client is a modern browser (iPadOS Safari 16+, Android Chrome, desktop Chrome/Firefox). | |
| A4 | Library size is modest: up to a few hundred files, individual files up to ~100 MB. | |
| A5 | Server and clients are on the same trusted LAN. | |

---

## 3. Tech Stack

Chosen to minimize toolchain complexity so an agent can build and run it reliably.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js 20+ (ESM, `"type": "module"`) | |
| Server | **Express** | Simple; `express.static` gives HTTP Range support, which audio seeking/streaming needs. |
| File watching | **chokidar** | Live-updates the library when files change. |
| Metadata | Filesystem + JSON only. **No database.** | |
| Frontend | **Vanilla JS (ES modules) + CSS.** No framework, no bundler, no build step. | Keeps `npm start` as the only command. |
| Audio engine | **Web Audio API** | Gain nodes, buses, low-latency overlapping SFX. |
| Tests | **Vitest** (server/scanner logic) | |
| Lint/format | ESLint + Prettier (defaults) | |

**[DECISION]** Use plain JavaScript with JSDoc type annotations rather than TypeScript, to avoid a compile step. If the human prefers TypeScript, use `tsx` for running the server and keep the frontend as plain JS.

---

## 4. Project Structure

```
soundboard/
├── package.json
├── README.md
├── DESIGN.md                  # this file
├── config.json                # server config (created with defaults on first run)
├── library/                   # USER'S AUDIO LIBRARY (gitignored, sample provided)
│   ├── Music/
│   │   ├── _tab.json          # optional tab config
│   │   ├── Tavern Song.mp3
│   │   ├── Tavern Song.jpg    # optional art (same basename)
│   │   └── Boss Fight.ogg
│   ├── Ambience/
│   └── SFX/
├── data/
│   └── settings.json          # per-item overrides persisted by the UI (auto-created)
├── server/
│   ├── index.js               # entry: load config, start server, start watcher
│   ├── config.js              # load/validate/merge config.json
│   ├── scanner.js             # walk library, build model (pure, unit-tested)
│   ├── watcher.js             # chokidar -> rescan -> notify SSE clients
│   ├── routes/
│   │   ├── library.js         # GET /api/library, POST /api/rescan
│   │   ├── settings.js        # PUT/DELETE /api/items/:id/settings
│   │   └── events.js          # GET /api/events (Server-Sent Events)
│   ├── settingsStore.js       # atomic read/write of data/settings.json
│   └── util/
│       ├── ids.js             # stable item id generation
│       └── safePath.js        # path traversal protection
├── public/                    # served statically at /
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── icons/                 # PWA icons
│   ├── css/
│   │   └── app.css
│   └── js/
│       ├── main.js            # bootstrap
│       ├── api.js             # fetch wrappers, SSE subscription
│       ├── state.js           # small observable store
│       ├── audioEngine.js     # Web Audio graph + playback control
│       ├── ui/
│       │   ├── tabs.js
│       │   ├── grid.js
│       │   ├── button.js      # single sound button component
│       │   ├── masterBar.js   # volume sliders, stop-all
│       │   └── settingsSheet.js
│       └── util/
│           ├── longPress.js
│           └── wakeLock.js
└── tests/
    ├── scanner.test.js
    ├── ids.test.js
    └── safePath.test.js
```

---

## 5. Library & Content Model

### 5.1 Folder convention

- Each **immediate subfolder** of `library/` is a **tab**. The folder name is the tab label.
- Each **audio file** in a tab folder is a **button**. The filename (without extension) is the button label.
- Subfolders inside a tab folder are **ignored in v1**. (Future: section headers.)
- Files and folders beginning with `_` or `.` are ignored, except `_tab.json`.

### 5.2 Supported audio formats

`.mp3 .ogg .oga .opus .wav .m4a .aac .flac .webm`

Note: browser support varies (e.g. Safari has limited Ogg support). The scanner includes all recognized extensions; the client should show a small warning badge on a button if `decodeAudioData` or playback fails, rather than crashing.

### 5.3 Art

Art is optional. For `Boss Fight.ogg`, the scanner looks for a sibling image with the same basename and one of: `.jpg .jpeg .png .webp .gif` (case-insensitive, first match wins in that order).

If art exists, it renders as the button background with a dark gradient overlay so the label remains readable. If not, the button uses a solid color derived from the tab color (see 5.4) with the label centered.

### 5.4 Tab config: `_tab.json` (optional)

```json
{
  "label": "Music",
  "type": "music",
  "color": "#7c3aed",
  "icon": "🎵",
  "order": 1,
  "defaults": { "loop": true, "volume": 0.8 },
  "exclusive": false
}
```

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `label` | string | folder name | Tab display name |
| `type` | `"music"` \| `"sfx"` | `"sfx"` | Determines which audio **bus** buttons route to, and default loop behavior |
| `color` | hex string | derived from folder name hash | Accent color for tab and art-less buttons |
| `icon` | string (emoji) | none | Shown in the tab |
| `order` | number | alphabetical | Sort position of the tab |
| `defaults.loop` | boolean | `true` for music, `false` for sfx | Default loop for buttons in tab |
| `defaults.volume` | 0..1 | `1.0` | Default per-button volume |
| `exclusive` | boolean | `false` | If true, starting a button in this tab stops other buttons in the **same tab** (crossfade optional, see 7.4). Useful for "one background track at a time" |

**Behavior when `_tab.json` is missing:** folders named (case-insensitive) `music`, `ambience`, `ambient`, or `bgm` are treated as `type: "music"`; everything else is `type: "sfx"`.

### 5.5 Per-item overrides

Users adjust loop/volume in the UI. These persist server-side (so all devices share them) in `data/settings.json`:

```json
{
  "Music/Boss Fight.ogg": { "loop": true, "volume": 0.6, "label": "Dragon Battle" }
}
```

Keys are the path relative to `library/`, using forward slashes. Precedence for any setting: **item override → tab defaults → global defaults**.

### 5.6 Data model (API shape)

```js
/** @typedef {Object} Item
 *  @property {string} id            // stable, url-safe, derived from relative path
 *  @property {string} label         // display name
 *  @property {string} audioUrl      // e.g. "/media/Music/Boss%20Fight.ogg"
 *  @property {string|null} artUrl   // e.g. "/media/Music/Boss%20Fight.jpg" or null
 *  @property {boolean} loop         // effective (resolved) value
 *  @property {number} volume        // effective (resolved) value 0..1
 *  @property {number} sizeBytes
 */

/** @typedef {Object} Tab
 *  @property {string} id
 *  @property {string} label
 *  @property {"music"|"sfx"} type
 *  @property {string} color
 *  @property {string|null} icon
 *  @property {boolean} exclusive
 *  @property {Item[]} items
 */

/** @typedef {Object} Library
 *  @property {Tab[]} tabs
 *  @property {string} version   // changes whenever the library changes; used for cache busting
 */
```

`id` generation: `sha1(relativePath).slice(0, 12)`. Must be deterministic across restarts. (Implemented in `server/util/ids.js`, unit tested.)

---

## 6. Server Design

### 6.1 Config (`config.json`)

Created with these defaults if missing:

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "libraryPath": "./library",
  "watch": true
}
```

The server prints all reachable LAN URLs on startup (e.g. `http://192.168.1.20:3000`) so the DM can type one into the tablet. Use `os.networkInterfaces()` and filter to IPv4 non-internal addresses.

### 6.2 HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/library` | Returns `Library` (with settings resolved) |
| POST | `/api/rescan` | Forces a rescan; returns new `Library` |
| PUT | `/api/items/:id/settings` | Body: `{ loop?, volume?, label? }`. Merges into `data/settings.json`. Returns updated `Item` |
| DELETE | `/api/items/:id/settings` | Removes all overrides for an item |
| GET | `/api/events` | Server-Sent Events stream. Emits `library-changed` when the watcher or a settings change occurs |
| GET | `/media/*` | Static, read-only serving of `libraryPath` with HTTP Range support |
| GET | `/*` | Static files from `public/` |

Errors return JSON `{ "error": "message" }` with an appropriate status code.

### 6.3 Scanner (`server/scanner.js`)

- Pure function: `scanLibrary(libraryPath, settings) -> Library`. No Express dependency, so it is easy to unit test using a temp directory fixture.
- Uses `fs.promises.readdir` with `withFileTypes`.
- Sorting: tabs by `order` then label; items alphabetically using `localeCompare` with `{ numeric: true, sensitivity: "base" }` so "Track 2" sorts before "Track 10".
- Tolerates: empty library, tab folders with no audio, unreadable files (skip and log a warning), invalid `_tab.json` (log warning, fall back to defaults).

### 6.4 Watcher

- chokidar watches `libraryPath` (ignore dotfiles, `awaitWriteFinish` enabled so half-copied files aren't picked up).
- On change, debounce ~300 ms, rescan, bump `version`, and emit an SSE `library-changed` event.
- Client reacts by refetching `/api/library` and re-rendering **without** interrupting any playing audio (see 7.7).

### 6.5 Security

- **Path traversal:** any path derived from user input must go through `safePath.js`, which resolves against `libraryPath` and rejects anything escaping it. Unit test with `../`, absolute paths, encoded traversal (`%2e%2e%2f`), and null bytes.
- `/media` is read-only and serves only the library directory.
- No auth in v1. README must state clearly: *run on trusted LAN only; don't expose to the internet.*
- Settings PUT validates types and ranges (`volume` clamped 0..1, `label` max 100 chars, unknown keys rejected).
- `settingsStore.js` writes atomically (write temp file, then rename) and serializes concurrent writes.

---

## 7. Client Design

### 7.1 Layout (tablet-first, landscape and portrait)

```
┌──────────────────────────────────────────────────────────────┐
│  [🎵 Music] [🌲 Ambience] [⚔ SFX] [🗣 Voices] ...   ⟳  ⚙    │  ← Tab bar (scrolls horizontally)
├──────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                  │
│ │  art   │ │  art   │ │        │ │  art   │                  │
│ │ Tavern │ │ Boss   │ │ Forest │ │ Dungeon│                  │  ← Grid of large buttons
│ │ Song  ↻│ │ Fight ↻│ │ Night  │ │ Drip   │                  │
│ └────────┘ └────────┘ └────────┘ └────────┘                  │
│ ┌────────┐ ...                                               │
├──────────────────────────────────────────────────────────────┤
│ 🔊 Music ━━━●━━  🔊 SFX ━━━━●━  🔊 Master ━━●━━   [■ Stop All]│  ← Master bar (sticky)
└──────────────────────────────────────────────────────────────┘
```

- **Grid:** CSS Grid, `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`, gap 12px. Buttons are square (`aspect-ratio: 1`). On a 10" tablet in landscape this yields roughly 5-6 columns.
- **Minimum touch target:** the whole button is at least 140x140 CSS px. Secondary controls (loop chip) are at least 44x44 px.
- **Tab bar:** top, sticky, horizontally scrollable, tabs at least 48 px tall.
- **Master bar:** bottom, sticky, always visible.
- Grid area scrolls vertically; the tab bar and master bar do not.
- **Dark theme only in v1** (dim-room use). High contrast text.

### 7.2 Button component

**Anatomy**
- Background: art (cover-fit) with a bottom-weighted dark gradient, or tab-color fill when no art.
- Label: bottom-left or centered, bold, 2-line clamp with ellipsis, min 16 px font, text-shadow for legibility over art.
- **Loop chip:** small toggle icon (↻) in the top-right corner. Tapping it toggles loop for that item only (`stopPropagation`, does not trigger playback). Visibly filled/highlighted when loop is on.
- **Playing indicator:** animated border glow + a thin progress bar along the bottom edge (progress = `currentTime / duration`; for looping items, show a repeating progress).
- **Error state:** dimmed with a ⚠ badge if the file failed to load or decode.

**Interaction**

| Gesture | Music-type tab | SFX-type tab |
|---------|----------------|--------------|
| Tap (idle) | Start playing | Start playing |
| Tap (playing) | **Stop** (with short fade-out) | **Retrigger:** start another overlapping instance (SFX are one-shots that layer) |
| Long-press (500 ms) | Open item settings sheet | Open item settings sheet |
| Tap loop chip | Toggle loop | Toggle loop |

**[DECISION]** In SFX tabs, if an item is set to `loop: true` and is playing, tapping it **stops** it (toggle behavior) instead of layering. Non-looping SFX always retrigger.

**Item settings sheet** (bottom sheet): rename label, volume slider, loop toggle, "Reset to defaults". Changes are `PUT` to the server immediately (debounced ~250 ms for the slider).

### 7.3 Audio engine (`public/js/audioEngine.js`)

#### Graph

```
[Music item source] → itemGain ─┐
[Music item source] → itemGain ─┼→ musicBus (GainNode) ─┐
                                                        ├→ masterGain → ctx.destination
[SFX voice]         → voiceGain ─┐                      │
[SFX voice]         → voiceGain ─┼→ sfxBus (GainNode) ──┘
```

- One shared `AudioContext`.
- **Three gain levels:** per-item, per-bus (music / sfx), and master. Buses are independent, which is what guarantees SFX never affect music.
- **Music-type items:** use an `HTMLAudioElement` (`preload="none"`, `crossOrigin="anonymous"`) wrapped in `MediaElementAudioSourceNode`. This **streams** large files instead of decoding hundreds of MB into RAM. Looping uses `audio.loop = true`.
  - Known limitation: `HTMLAudioElement` looping can have a tiny gap on some formats. Prefer `.ogg`/`.opus` or `.wav` for seamless loops. Document this in the README.
- **SFX-type items:** fetch and decode into an `AudioBuffer` on first use (cache in a `Map<itemId, AudioBuffer>`), play with `AudioBufferSourceNode` per trigger for low-latency, overlapping playback. Optionally preload all SFX buffers for the active tab after first user gesture.
  - **[DECISION]** If an SFX-type item's file is larger than 10 MB, fall back to the streaming `HTMLAudioElement` path so the SFX tab can safely hold long ambience loops.

#### Rules that MUST hold (acceptance-critical)

1. Playing or stopping any SFX **never** pauses, stops, restarts, or ducks any music item.
2. Multiple music items can play at the same time unless the tab has `exclusive: true`, in which case only same-tab items are affected.
3. Toggling loop on a playing item takes effect immediately without restarting it (`audio.loop = x` or `source.loop = x`).
4. Changing an item's volume while playing ramps smoothly (`gain.setTargetAtTime`) to avoid clicks.
5. Stop always uses a short fade (default 250 ms) to avoid pops. "Stop All" fades all voices.
6. Non-looping music that ends naturally returns its button to idle state.

#### Public API (sketch)

```js
export function createEngine() {
  return {
    unlock(),                       // resume AudioContext; call on first user gesture
    play(item, tabType, opts),      // returns a voiceId
    stop(voiceId, { fadeMs }),
    stopItem(itemId, { fadeMs }),
    stopAll({ fadeMs }),
    stopBus(bus, { fadeMs }),       // "music" | "sfx"
    setLoop(itemId, loop),
    setItemVolume(itemId, volume),
    setBusVolume(bus, volume),      // "music" | "sfx"
    setMasterVolume(volume),
    isPlaying(itemId),              // true if any voice of the item is active
    getProgress(itemId),            // 0..1 for the newest active voice, or null
    on(event, handler),             // "voice-started" | "voice-ended" | "error"
  };
}
```

The engine is UI-agnostic and emits events; the UI subscribes and updates buttons. This separation makes it testable and keeps rendering logic simple.

### 7.4 Exclusive tabs and crossfade

When `exclusive: true` and the user starts item B while item A (same tab) is playing: fade A out and fade B in over a configurable crossfade (default 1500 ms, in `config.json` under `client.crossfadeMs`, exposed via `/api/library` or a `/api/config` endpoint). This is a nice-to-have; implement after the core loop works (Phase 5).

### 7.5 Mobile/tablet specifics

- **Autoplay unlock:** browsers block audio until a user gesture. Call `engine.unlock()` from the first `pointerdown`. Show a full-screen "Tap to start" overlay on load if `AudioContext.state !== "running"`.
- **iOS Safari:** the `AudioContext` can be suspended after backgrounding; listen for `visibilitychange` and `statechange` and resume when returning. Silent-mode switch may mute Web Audio; mention in README that the hardware mute switch/ring mode affects playback.
- **No accidental zoom/selection:**
  ```css
  html, body { touch-action: manipulation; overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  ```
  Viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`. Respect safe-area insets with `env(safe-area-inset-*)`.
- **Use `pointerdown`** (not `click`) for the main play trigger to eliminate the ~300 ms perceived latency; still handle keyboard activation (Enter/Space) for accessibility.
- **Screen Wake Lock API:** request a wake lock so the tablet doesn't sleep mid-session; re-acquire on `visibilitychange`. Fail silently where unsupported.
- **PWA:** provide `manifest.webmanifest` with `display: "standalone"`, `orientation: "any"`, icons, dark theme color, so "Add to Home Screen" gives a fullscreen app. A service worker is **not** required in v1 (audio must come from the live server anyway).
- **Media Session API (optional):** do not register lockscreen controls in v1 since multi-voice playback doesn't map cleanly.

### 7.6 State management (`state.js`)

A tiny observable store, no library:

```js
{
  library: Library | null,
  activeTabId: string,
  playing: Map<itemId, { voiceIds: string[], startedAt: number }>,
  volumes: { master: number, music: number, sfx: number },   // persisted in localStorage per device
  ui: { settingsItemId: string | null, unlocked: boolean }
}
```

- Bus/master volumes and last active tab persist in `localStorage` (per device). Wrap `localStorage` access in try/catch.
- Item loop/volume/label persist on the **server** via the settings API.

### 7.7 Live library updates without interrupting audio

When `library-changed` arrives (via SSE, with auto-reconnect and an exponential backoff), refetch the library and **diff by item id**:

- Existing items: update labels/art/loop/volume in place; do not touch playing voices.
- Removed items that are currently playing: keep playing until they end or the user stops them (the audio is already loaded); show the button in a "missing" state if it's still visible.
- Re-render the DOM by keyed reconciliation (key = item id) so buttons aren't recreated unnecessarily. Keep the active tab selected if it still exists.

### 7.8 Accessibility

- Buttons are real `<button>` elements with `aria-pressed` reflecting playing state and an `aria-label` including the state ("Boss Fight, playing, looping").
- Visible focus rings for keyboard users.
- Don't rely on color alone: playing state also uses the progress bar and a glyph (▶/■) badge.
- Respect `prefers-reduced-motion` by disabling glow/pulse animations.

---

## 8. Visual Design Tokens

Put in `:root` of `app.css`:

```css
:root {
  --bg: #0f1115;
  --surface: #1a1d24;
  --surface-2: #232733;
  --text: #f2f4f8;
  --text-dim: #9aa3b2;
  --accent: #7c3aed;       /* overridden per tab via inline style */
  --danger: #ef4444;
  --radius: 16px;
  --gap: 12px;
  --tab-h: 56px;
  --master-h: 72px;
  --btn-min: 160px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

Playing state: 3 px inner border in `--accent`, soft glow (`box-shadow: 0 0 18px var(--accent)`), animated bottom progress bar. Pressed state: `transform: scale(0.97)` with 80 ms transition.

---

## 9. Implementation Plan for the Agent

Work through phases **in order**. Do not start a phase until the previous phase's acceptance checks pass. Commit after each phase.

### Phase 0: Scaffolding
- `npm init`, set `"type": "module"`, add scripts: `start`, `dev` (`node --watch server/index.js`), `test` (`vitest run`), `lint`.
- Install: `express`, `chokidar`; dev: `vitest`, `eslint`, `prettier`.
- Create the folder structure from Section 4 with stub files.
- Create a `library/` with sample tabs. Since real audio is not available, **generate tiny placeholder WAV files** via a script (`scripts/make-samples.js`) that writes short sine-wave tones (e.g. a 4 s tone for music, 0.3 s beeps for SFX) so the app can be tested end to end. Add `library/` (except a `.gitkeep`) to `.gitignore`.
- **Accept:** `npm start` serves a "Hello" page at `http://localhost:3000`.

### Phase 1: Library scanning and API
- Implement `ids.js`, `safePath.js`, `scanner.js`, `settingsStore.js`, `config.js`.
- Routes: `/api/library`, `/api/rescan`, `/media/*`.
- Unit tests for scanner (temp dir fixtures), ids, safePath (including traversal attacks).
- **Accept:** tests pass; `curl localhost:3000/api/library` returns the sample tabs and items; `curl -r 0-99 localhost:3000/media/Music/<file>` returns `206 Partial Content`.

### Phase 2: Static UI (no audio yet)
- Build `index.html`, CSS, tab bar, grid, button component, master bar layout, populated from `/api/library`.
- **Accept:** tabs switch; grid reflows across widths (verify at 768, 1024, 1366 px wide, and 390 px phone); art and art-less buttons both render; label clamping works; no horizontal page scroll.

### Phase 3: Audio engine + core playback
- Implement `audioEngine.js` per Section 7.3 and wire to buttons.
- Implement unlock overlay, music/SFX behaviors, per-item loop chip, progress bars, playing state, Stop All, bus/master sliders.
- **Accept (manual checklist):**
  - [ ] Start a music item; then tap SFX items repeatedly; music continues uninterrupted.
  - [ ] Rapid-tap one non-looping SFX 5 times; you hear overlapping instances.
  - [ ] Two music items can play at once.
  - [ ] Toggling loop on a playing music item changes behavior at the end of the track without restarting it.
  - [ ] Music bus slider affects only music; SFX bus slider affects only SFX; master affects both.
  - [ ] Tapping a playing music button fades out and stops it.
  - [ ] Stop All silences everything with a short fade.
  - [ ] A broken/undecodable file shows the ⚠ state and doesn't break other buttons.

### Phase 4: Persistence, settings sheet, live updates
- Settings API + sheet UI (label, volume, loop, reset).
- Watcher + SSE + client diffing (Section 7.7).
- localStorage for bus/master volumes and active tab.
- **Accept:** change loop/volume on one device, reload another; values match. Drop a new file into `library/SFX/` while a music track plays: the new button appears within ~2 s and the music is uninterrupted.

### Phase 5: Tablet polish
- Wake lock, PWA manifest and icons, safe-area handling, zoom/selection prevention, reduced-motion, `pointerdown` triggering, iOS resume-after-background handling.
- Exclusive tabs with crossfade.
- **Accept:** works when added to the iPad home screen; no double-tap zoom; screen stays awake; Lighthouse PWA/accessibility checks reasonable.

### Phase 6: Documentation
- `README.md`: install, folder conventions, `_tab.json` reference, how to find the LAN URL, Add to Home Screen instructions, loop-gap caveat, LAN-only security note, troubleshooting (audio silent on iOS, firewall prompts).

---

## 10. Testing Strategy

| Area | Approach |
|------|----------|
| Scanner, ids, safePath, settingsStore | Vitest unit tests using temp directories |
| API routes | Vitest + `supertest` (optional dev dep) hitting an in-memory app instance |
| Audio engine | Logic-level tests using a mocked `AudioContext` (verify graph wiring: music and SFX use separate buses; stop calls only affect targeted voices) |
| UI / audio behavior | Manual checklist in Phase 3/4/5, run on an actual tablet |

Since agents can't listen to audio, **do not claim audio behavior is verified from code alone**. Mark all manual-checklist items as "needs human verification" in the final summary.

---

## 11. Coding Conventions for the Agent

- ES modules everywhere; no CommonJS.
- Small, single-purpose modules; keep files under ~300 lines.
- No frontend frameworks or build tools without asking the human first.
- Add JSDoc types for exported functions and the typedefs in 5.6.
- Never trust filenames or query params: escape all text inserted into the DOM (use `textContent`, not `innerHTML`, for labels), and URL-encode every path segment in `audioUrl`/`artUrl`.
- Handle every `fetch` and `decodeAudioData` failure explicitly; the UI should degrade per-button.
- Don't add dependencies beyond those listed without justification in the commit message.
- Keep log output concise: startup URLs, scan summary (`N tabs, M items`), warnings.

---

## 12. Definition of Done (v1)

1. `npm install && npm start` runs the server and prints LAN URLs.
2. Dropping audio (and optional same-name art) into `library/<Tab>/` produces buttons with no code or config changes.
3. On an iPad-size viewport, buttons are large, readable, and tappable; tabs work; master bar is always visible.
4. SFX never interrupt music; multiple music items may play simultaneously; loop is toggleable per item and persists.
5. All unit tests pass; the manual checklists in Phases 3-5 are completed and reported honestly.
6. README covers setup and usage for a non-developer DM.

---

## 13. Future Work (Out of Scope for v1)

- **Scenes/presets:** one tap starts a saved combination (e.g. tavern music + crowd murmur at set volumes).
- **Synchronized "GM remote" mode:** control playback on a dedicated player device (e.g. a laptop connected to the table speakers) from a separate control tablet, via WebSocket.
- **Server-side audio output** option.
- **Folder sections** within a tab; drag-to-reorder buttons; favorites/recent.
- **Upload from the browser**, and drag-and-drop art.
- **Ducking:** automatically lower music volume while a designated "voice" SFX plays.
- **Waveform trimming**, start/end points, fade-in/out per item.
- **Optional shared PIN** for basic access control.
- **Light theme** and configurable grid size.

---

## 14. Open Questions (defaults noted)

| Question | Default if unanswered |
|----------|----------------------|
| Should audio play on the tablet or on the server's speakers? | Tablet (A1) |
| Crossfade length for exclusive tabs? | 1500 ms |
| Should looping SFX stop on tap or layer? | Stop (toggle) |
| TypeScript or plain JS? | Plain JS + JSDoc |
