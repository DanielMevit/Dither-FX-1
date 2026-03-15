# Dither FX — Photoshop UXP Plugin

A real-time, non-destructive dithering plugin for Adobe Photoshop (24.0+). All pixel processing runs in JavaScript on typed arrays, giving slider-driven control over every parameter without relying on Photoshop's built-in filters.

## Features

### v1.3 (current)
- **27 dithering algorithms:** Error diffusion (Floyd-Steinberg, Atkinson, Jarvis, Stucki, Burkes, Sierra family, serpentine variants), ordered (Bayer 2x2/4x4/8x8), halftone (dot, cluster, crosshatch, angled 0°/22.5°/45°), artistic patterns (knit, circuit, star, cyber scanline, diamond), random noise
- **Preprocessing pipeline:** Blur, Sharpen (with radius), Brightness, Contrast, Gamma correction, Noise, Grayscale
- **Color mapping:** Mono (hard threshold), Duotone (smoothstep), Tritone (with adjustable thresholds), Palette/Indexed (13 retro presets including Game Boy, CGA, C64, NES, PICO-8)
- **Color overlay** — blend original image colors onto dithered luminance (0–100%)
- **Pixel scale** (1–16x) — chunky pixel art downscale → dither → upscale
- **Error spread control** (0–200%) for error diffusion algorithms
- **Halftone dot size** (2–20px)
- **Invert output** toggle
- **Transparency skip** — preserve pixels below alpha threshold
- **Non-destructive workflow:** Duplicates source layer, hides original, history snapshot for one-click revert
- **Live mode:** Slider changes auto-update with 200ms debounce
- **Done button:** Finalize effect, unhide original, exit live mode
- **Settings persistence** via localStorage
- **Target modes:** Active layer, flattened document, selection only

### v2.0 (planned)
See `ROADMAP.md` for competitive analysis and feature plan.

## Tech

- **Runtime:** Adobe UXP (Unified Extensibility Platform), manifest v5, Photoshop 24+
- **UI:** React 16.8 + Adobe Spectrum Web Components (`sp-*` elements)
- **Build:** Webpack 5 + Babel 7
- **Photoshop APIs:** `photoshop.imaging` (pixel I/O), `photoshop.core.executeAsModal` (all write ops), `photoshop.action.batchPlay` (layer/history ops)

## Setup

```bash
npm install
npm run build      # Build once → dist/
npm run watch      # Dev mode — rebuilds on save via nodemon
```

Load in Photoshop via **UXP Developer Tools** → **Add Plugin** → select `dist/manifest.json` → **Load**.

**Requirements:** Photoshop 24.0+ / UXP 5.6+ / Node.js (for build tooling only)

## Structure

```
Dither FX 1/
  SOUL.md            ← agent identity & standards
  AGENTS.md          ← workflow rules for this repo
  README.md          ← this file
  CHANGELOG.md       ← timestamped session & release notes
  ROADMAP.md         ← competitive analysis & v2.0 feature plan
  src/
    index.jsx                 ← entry point, panel registration
    controllers/
      PanelController.jsx     ← panel lifecycle controller
    panels/
      DitherEffect.jsx        ← main UI panel, all state & event handlers
      DitherEffect.css        ← panel styling, dark/light themes
    core/
      effectProcessor.js      ← pipeline orchestrator, pixel cache
      ditherAlgorithms.js     ← 27 dither algorithms
      preprocessing.js        ← blur, sharpen, brightness, contrast, gamma, noise, grayscale
      colorMapping.js         ← mono, duotone, tritone, indexed palette, color overlay
    ps/
      layerManager.js         ← all Photoshop API interactions
  plugin/
    manifest.json             ← UXP manifest v5
    index.html                ← entry HTML
    icons/                    ← plugin icons (dark/light, 1x/2x)
  dist/                       ← webpack output (kept in repo for direct UXP loading)
```

## Changelog

For timestamped release notes and session summaries, see `CHANGELOG.md`.
