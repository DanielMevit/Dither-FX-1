# Dither FX — Photoshop UXP Plugin

A real-time, non-destructive dithering plugin for Adobe Photoshop (24.0+). All pixel processing runs in JavaScript on typed arrays, giving slider-driven control over every parameter without relying on Photoshop's built-in filters.

## Features

### v2.0 (current)
- **35 dithering algorithms:** Error diffusion (Floyd-Steinberg, Atkinson, Jarvis, Stucki, Burkes, Sierra family, Stevenson-Arce, Fan, Shiau-Fan, serpentine variants), ordered (Bayer 2x2/4x4/8x8, blue noise, checkerboard, h-lines, diagonal), halftone (dot, cluster, crosshatch, angled 0°/22.5°/45°), artistic patterns (knit, circuit, star, cyber scanline, diamond), random noise
- **Preprocessing pipeline:** Denoise (median filter), Blur, Sharpen (with radius), Brightness, Contrast, Gamma correction, Noise, Grayscale
- **Color mapping:** Mono, Duotone, Tritone (adjustable thresholds), Palette/Indexed (13 retro presets + custom palette extraction from image)
- **Post effects:** CRT simulation (scanlines, phosphor glow, bloom, vignette), Chromatic aberration
- **Presets:** 7 built-in (CRT Scanline, Game Boy Classic, Newspaper Print, 1-Bit Atkinson, Retro Amber, Pixel Art 4x, VHS Glitch) + save/load user presets
- **Batch render** — apply current settings to all processable layers
- **Vector path output** — trace dithered result to Photoshop work path via marching squares
- **Color overlay** — blend original image colors onto dithered luminance (0–100%)
- **Pixel scale** (1–32x) — chunky pixel art downscale → dither → upscale
- **Error spread control** (0–200%) for error diffusion algorithms
- **Mask mode** — apply within selection only, with feather
- **Invert output** toggle, **Transparency skip**
- **Non-destructive workflow:** Duplicates source layer, hides original, history snapshot for one-click revert
- **Live mode:** Slider changes auto-update with 200ms debounce
- **Cancel button** — abort long-running operations (batch, vector trace)
- **Compact UI** — inline section headers, tight spacing
- **Settings persistence** via localStorage
- **Target modes:** Active layer, flattened document, selection only

### v2.1 (planned)
See `ROADMAP.md` for competitive analysis and remaining feature gaps.

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
      ditherAlgorithms.js     ← 35 dither algorithms
      preprocessing.js        ← denoise, blur, sharpen, brightness, contrast, gamma, noise, grayscale
      colorMapping.js         ← mono, duotone, tritone, indexed palette, color overlay
      postProcessing.js       ← CRT effect, chromatic aberration
      presetManager.js        ← built-in + user preset management
    utils/
      vectorTracer.js         ← marching squares contour detection + path simplification
      paletteExtractor.js     ← median-cut color quantization from image
    ps/
      layerManager.js         ← all Photoshop API interactions, vector path creation
  plugin/
    manifest.json             ← UXP manifest v5
    index.html                ← entry HTML
    icons/                    ← plugin icons (dark/light, 1x/2x)
  dist/                       ← webpack output (kept in repo for direct UXP loading)
```

## Changelog

For timestamped release notes and session summaries, see `CHANGELOG.md`.
