# Tabletop Soundboard

A self-hosted, web-based soundboard for running Tabletop Roleplaying sessions. Run a tiny server on the computer that holds your audio,
open the web UI on a tablet or phone on the same Wi-Fi, and tap big buttons to
play music, ambience, and sound effects — all at once.

- **Big, tappable grid of buttons**, designed for tablets (landscape or portrait).
- **Tabs** backed by folders (`Music/`, `Ambience/`, `SFX/`, …).
- **Simultaneous playback:** sound effects never interrupt music; multiple music
  tracks can play together.
- **Per-button looping** you can toggle on the button itself.
- **Optional cover art** per button (same filename as the audio).
- **Live updates:** drop a file in a folder and a new button appears within ~2 s.
- **Runs on your LAN only** — no cloud, no accounts, no internet needed.

---

## Requirements

- **Node.js 20+** (check with `node --version`).
- A modern browser: iPadOS Safari 16+, Android Chrome, or desktop
  Chrome/Firefox.

## Install & run

```bash
npm install
npm start
```

On first run the server prints the URLs to use, for example:

```
Tabletop Soundboard running
  Local:   http://localhost:3000
  Network: http://192.168.0.20:3000
  Library: 3 tab(s), 5 item(s)
```

Open the **Network** URL on your tablet (same Wi-Fi as the server). That's it.

### Generate sample audio

The repo ships with a script that writes short placeholder WAV tones so you can
try the app before adding real audio:

```bash
npm run samples     # writes library/Music, library/Ambience, library/SFX
npm run icons       # (re)generate the PWA app icons
```

### Other scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart on file changes |
| `npm test` | Run unit tests (Vitest) |
| `npm run lint` | Lint with ESLint |
| `npm run samples` | Generate placeholder WAV files |
| `npm run icons` | Generate PWA icons |

---

## Adding your own audio

Each **immediate subfolder** of `library/` is a **tab**. Each **audio file** in a
tab folder is a **button**. Drop files in, no config or code needed.

```
library/
├── Music/          ← tab labelled "Music"
│   ├── Tavern Song.mp3
│   └── Tavern Song.jpg   ← optional cover art (same basename)
├── Ambience/
└── SFX/
```

Supported audio: `.mp3 .ogg .oga .opus .wav .m4a .aac .flac .webm`
(Note: Safari has limited Ogg support — prefer `.mp3`/`.wav`/`.m4a` there.)

Supported art (optional, same basename as the audio, first match wins):
`.jpg .jpeg .png .webp .gif`. With art, the image is the button background with a
dark gradient so the label stays readable. Without art, the button uses the tab's
accent color.

Subfolders and files starting with `_` or `.` are ignored (except `_tab.json`).

---

## Per-tab configuration: `_tab.json`

Drop a `_tab.json` inside a tab folder to override its defaults:

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
| `type` | `"music"` \| `"sfx"` | `music` for folders named `music`/`ambience`/`ambient`/`bgm`, else `sfx` | Which **bus** the buttons route to; also the default loop behavior |
| `color` | hex string | derived from name | Accent color for the tab and art-less buttons |
| `icon` | emoji string | none | Shown in the tab |
| `order` | number | alphabetical | Sort position of the tab |
| `defaults.loop` | boolean | `true` for music, `false` for sfx | Default loop for buttons in the tab |
| `defaults.volume` | 0..1 | `1.0` | Default per-button volume |
| `exclusive` | boolean | `false` | If true, starting a button in this tab fades out other buttons **in the same tab** (a "one background track at a time" mode). Crossfade length is `client.crossfadeMs` in `config.json` (default 1500 ms). |

Even without `_tab.json`, folders named `music`, `ambience`, `ambient`, or `bgm`
are treated as music; everything else is SFX.

### Per-button settings

Tap the **↻ loop chip** on a button to toggle looping for that button only.
**Long-press** a button (500 ms) to open a sheet where you can rename it, change
its volume, toggle loop, or reset to defaults. These overrides are saved on the
server (`data/settings.json`) so they apply on every device.

---

## How playback works

- **Music and sound effects** are decoded into an `AudioBuffer` and played with an
  `AudioBufferSourceNode`. This is reliable across browsers (including iOS), gives
  instant, overlapping, low-latency playback, and **sample-accurate looping**
  (no audible seam).
- Files **larger than 10 MB** are streamed with an `<audio>` element instead, to
  avoid decoding hundreds of MB into RAM.
- The two **independent buses** (music / sfx) are what guarantee that triggering
  an SFX never stops or ducks music.

### Tap behavior

| Gesture | Music tab | SFX tab |
|---------|-----------|---------|
| Tap (idle) | Start | Start |
| Tap (playing) | Stop (short fade) | **Retrigger** another overlapping instance |
| Long-press | Open settings | Open settings |
| Tap loop chip | Toggle loop | Toggle loop |

> **SFX loop caveat:** a *looping* SFX that is playing will **stop** when tapped
> again (toggle). Non-looping SFX always layer.

> **Music is a single stream:** within the Music tab, starting a song stops any
> other playing song first, so there is never more than one song at once.
> Tapping a playing music button, or **Stop All**, force-stops everything.

---

## Add to Home Screen (full-screen app)

1. Open the Network URL in Safari (iPad/iPhone) or Chrome (Android).
2. **Safari:** tap Share → *Add to Home Screen*. **Chrome:** tap ⋮ → *Add to
   Home screen*.
3. Launch from the home screen icon for a standalone, full-screen experience with
   the screen kept awake during play.

---

## Configuration (`config.json`)

Created automatically on first run with these defaults:

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "libraryPath": "./library",
  "watch": true,
  "client": { "crossfadeMs": 1500 }
}
```

- `port` / `host`: where the server listens. `host: "0.0.0.0"` is needed to be
  reachable from other devices on the LAN.
- `libraryPath`: where your audio lives (absolute or relative to the project).
- `watch`: live-reload the library when files change.
- `client.crossfadeMs`: exclusive-tab crossfade length.

## Security note — LAN only

This server has **no authentication** and is meant to run on a **trusted local
network** only. Do **not** expose it to the public internet (no port forwarding,
no public tunnel) — anyone who can reach the port can browse and play your files.
If your OS shows a firewall prompt when starting, allow it for the private
network only.

---

## Troubleshooting

- **No audio on iPad/iPhone:** iOS blocks audio until a user gesture. Tap the
  "Tap to Start" overlay (or any button) once. Also, the physical **ring/mute
  switch** silences Web Audio — make sure the device is not muted.
- **Firewall prompt on start:** allow the app on the *private* network so tablets
  can connect.
- **New files don't appear:** ensure `watch` is `true` in `config.json`; you can
  also tap the ⟳ (rescan) button in the UI, or restart the server.
- **Audio gaps when looping:** some formats have a tiny seam when looping via
  `<audio>`. Use `.wav`, `.ogg`, or `.opus` for seamless music loops.
- **"A sound could not be played" warning:** the file may be a format the browser
  can't decode (common with Ogg on Safari). Try a different format.

---

## Project structure

```
server/        Express app: scanning, API, SSE, file watching
public/        Vanilla JS + CSS client (no build step)
library/       YOUR audio — folders become tabs, files become buttons
data/          Server-side per-item settings (auto-created)
scripts/       Sample-audio and icon generators
tests/         Vitest unit tests (scanner, ids, safePath, audio engine)
```

## License

Use it for your games. Have fun.

