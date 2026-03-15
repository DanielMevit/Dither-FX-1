# Soul — Claude Guidelines for Dither Effect Plugin

## What This Project Is
A Photoshop UXP plugin that applies real-time dithering effects to image layers. Built with React 16 + Adobe Spectrum UXP Web Components. The plugin is non-destructive: it duplicates the source layer, hides the original, creates a history snapshot, and processes pixels entirely in JavaScript on typed arrays (not via Photoshop filters).

## Tech Stack
- **Runtime:** Adobe UXP (Unified Extensibility Platform), manifest v5, Photoshop 24+
- **UI:** React 16.8 + Adobe Spectrum Web Components (`sp-*` elements)
- **Build:** Webpack 5 + Babel 7 (JSX transform, object rest spread, class properties)
- **Photoshop APIs:** `photoshop.imaging` (pixel I/O), `photoshop.core.executeAsModal` (all write ops), `photoshop.action.batchPlay` (layer/history ops)
- **Dev tooling:** nodemon for watch mode, UXP Developer Tools (UDT) for loading/debugging

## Core Constraints — Never Break These
1. **Every document mutation must be inside `core.executeAsModal()`**. This includes pixel reads (`getPixels`), pixel writes (`putPixels`), layer creation/duplication, visibility changes, and snapshot creation. Failing to wrap in a modal throws a UXP security error.
2. **Never modify the original source layer's pixels.** The pipeline reads from the original (which gets hidden), caches those pixels in `processingState.originalPixels`, and writes only to the duplicated "(Dithered)" layer.
3. **All pixel processing is pure JavaScript on `Uint8Array` / `Float32Array` buffers.** Do not use Photoshop's built-in filters, adjustments, or actions for image processing. The entire point is real-time, slider-driven control.
4. **`require("photoshop")` and `require("uxp")` are the correct import styles.** UXP does not support ES6 `import` for host APIs. The webpack externals config maps these to `commonjs2`. Do not refactor to ES6 imports.
5. **Spectrum UXP components (`sp-*`) have different event semantics than HTML.** Use `onInput` for `sp-slider` and `sp-textfield`. For `sp-picker` (dropdown), React's synthetic `onChange`/`onInput` do NOT work — you MUST use a `ref` + direct `addEventListener('change', handler)` on the DOM element. For `sp-checkbox`, use `checked={val ? true : undefined}` — setting `checked={false}` still results in a checked state in UXP because it treats any attribute presence as truthy.
6. **Color inputs use native `<input type="color">` with `onChange`** — this is correct because these are standard HTML elements, not Spectrum components. Don't change these to `onInput`.
7. **Do NOT pass `colorProfile` to `imaging.createImageDataFromBuffer()`** — it causes error -26120 "Unknown color profile". Omit it entirely and let Photoshop use the document's default.
8. **UXP Bounds objects may use underscore-prefixed properties** (`_left`, `_top`, `_right`, `_bottom`). Always access with fallback: `bounds.left ?? bounds._left ?? 0`.

## Architecture
```
src/
  index.jsx                 — Entry point. Registers "ditherEffect" panel via entrypoints.setup().
  controllers/
    PanelController.jsx     — Generic panel lifecycle controller (create/show/hide/destroy/invokeMenu).
  panels/
    DitherEffect.jsx        — Main UI panel. All state management, event handlers, live mode logic.
                              Settings persist to localStorage. usePickerRef() hook for sp-picker events.
    DitherEffect.css        — Full panel styling with CSS variables, dark/light theme support.
  core/
    effectProcessor.js      — Pipeline orchestrator. Manages processingState (cached original pixels,
                              dithered layer ID, document ID). Exposes initialApply(), updateEffect(),
                              commitEffect(), resetEffect(), processPixels().
    ditherAlgorithms.js     — 27 dither algorithms: generic error diffusion engine with kernel lookup,
                              ordered dithering with 13 matrices, halftone with angle rotation,
                              pixel scaling (downscale → dither → upscale), random noise.
    preprocessing.js        — Image preprocessing: box blur, unsharp mask, brightness, contrast,
                              gamma correction (LUT-based), noise, grayscale. Applied in fixed order.
    colorMapping.js         — Post-dither color mapping: mono, duotone, tritone, indexed palette (13 presets).
                              Color overlay blends original colors onto dithered luminance.
  ps/
    layerManager.js         — All Photoshop API interactions: getLayerPixels, putLayerPixels,
                              getFlattenedPixels, getSelectionPixels, setupDitherStructureInternal,
                              revertToSnapshot, finalizeDither, validateLayer.

plugin/
  manifest.json             — UXP manifest v5. Single panel "ditherEffect".
  index.html                — Entry HTML. Sets global.screen={} shim and loads index.js.
  icons/                    — Plugin icons (dark/light themes, 1x/2x scale).

dist/                       — Webpack output. Kept in repo for direct UXP loading.
```

## Processing Pipeline (Order Matters)
```
1. getLayerPixels(sourceLayer)     → Uint8Array (RGBA or RGB, chunky)
2. Cache in processingState.originalPixels (copied, not referenced)
3. applyPreprocessing():
   blur → sharpen → brightness → contrast → gamma → noise → grayscale
4. applyDitherAlgorithm():
   Dispatches to selected algorithm. Handles pixel scaling (down → dither → up).
5. Invert (if enabled)
6. Transparency skip (preserves original pixels below alpha threshold)
7. applyColorMapping():    (if mode !== 'none')
   Maps luminance to user-defined colors or indexed palette
8. applyColorOverlay():    (if colorOverlay > 0)
   Blends original image colors onto dithered luminance
9. putLayerPixels()        → writes result to the "(Dithered)" layer
```
On subsequent slider changes (live mode), steps 3-9 re-run from the cached original pixels.

## Known Issues
- No `executionContext.isCancelled` check during long processing (large images could freeze PS)
- Changing target mode (active layer / flattened / selection) during live mode has no effect — requires re-apply

## Code Style
- Functional React with hooks only (no class components, except PanelController which is a class)
- Use `useRef` for mutable values that must not cause re-renders (processing flags, debounce timers)
- Debounce live updates at 200ms using `setTimeout` + `clearTimeout`
- Guard concurrent operations with `isProcessingRef.current` ref flag, not state
- Alpha channel (4th component when `components === 4`) is always preserved/passed through unchanged
- Hex color textfield input validated with regex before updating state

## Building & Loading
```bash
npm install                # First time only
npm run build              # One-time build → dist/
npm run watch              # Dev mode — rebuilds on file change via nodemon
```
Load via **UXP Developer Tools** → **Add Plugin** → select `dist/manifest.json` → **Load**.

## GitHub & Version Control
- **Repo:** https://github.com/DanielMevit/Dither-FX-1 (private)
- **Push from WSL:** use `powershell.exe -Command "Set-Location 'D:\Vibe Coding\Photoshop Plugins\Dither FX 1'; git push origin main"` — Git credentials live on the Windows side, not in WSL
- **Commit messages:** short summary line, blank line, bullet points of changes. Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` at end.
- **Never force push to main.**

## When Making Changes
1. Run `npm run build` after editing — verify 0 errors, 0 warnings
2. Reload the plugin in UXP Developer Tools
3. Test with: a normal pixel layer, a smart object (should reject), a locked layer (should reject), an empty layer (should reject)
4. After applying: verify the original layer is hidden, the "(Dithered)" copy is visible and correct
5. After resetting: verify the document reverts to the pre-dither snapshot state
6. Test live mode: move a slider after initial apply — should update within ~200ms
7. Update `progresslog.md` with what changed and why (append only, never remove entries)
