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
5. **Spectrum UXP components (`sp-*`) have different event semantics than HTML.** Use `onInput` (not `onChange`) for `sp-slider`, `sp-picker`, `sp-textfield`. For `sp-checkbox`, use `checked={val ? true : undefined}` — setting `checked={false}` still results in a checked state in UXP because it treats any attribute presence as truthy.
6. **Color inputs use native `<input type="color">` with `onChange`** — this is correct because these are standard HTML elements, not Spectrum components. Don't change these to `onInput`.

## Architecture
```
src/
  index.jsx                 — Entry point. Registers "ditherEffect" panel via entrypoints.setup().
                              Also defines flyout menu with "Reload Plugin" command.
  controllers/
    PanelController.jsx     — Generic panel lifecycle controller (create/show/hide/destroy/invokeMenu).
                              Uses ReactDOM.render() — standard for React 16 in UXP.
    CommandController.jsx   — Generic dialog/command controller (unused by dither, leftover from starter).
  panels/
    DitherEffect.jsx        — Main UI panel. All state management, user event handlers, live mode logic.
    DitherEffect.css        — Full panel styling with CSS variables, dark/light theme support.
    Demos.jsx               — Leftover starter panel (ColorPicker demo). Not registered, not loaded.
    MoreDemos.jsx            — Leftover starter panel. Not registered, not loaded.
  components/
    ColorPicker.jsx         — Leftover starter component. Not used by dither plugin.
    ColorPicker.css         — Leftover.
    Hello.jsx               — Leftover starter component.
    Icons.jsx / Icons.css   — Leftover starter component.
    WC.jsx                  — Leftover web component wrapper for React event bridging. Not used.
  core/
    index.js                — Barrel export for all core modules.
    effectProcessor.js      — Pipeline orchestrator. Manages `processingState` (cached original pixels,
                              dithered layer ID, document ID). Exposes initialApply(), updateEffect(),
                              resetEffect(), processPixels().
    ditherAlgorithms.js     — 9 dither algorithms: none, bayer-2x2/4x4/8x8, floyd-steinberg,
                              atkinson, pattern-a/b, random. Each operates on Uint8Array pixel buffers.
    preprocessing.js        — Image preprocessing: box blur (2-pass separable), unsharp mask sharpen,
                              brightness, contrast, noise, grayscale. Applied in fixed order.
    colorMapping.js         — Post-dither color mapping: mono, duotone, tritone.
                              Uses luminance-based interpolation between user-defined colors.
  ps/
    index.js                — Barrel export for layerManager.
    layerManager.js         — All Photoshop API interactions: getLayerPixels, putLayerPixels,
                              setupDitherStructureInternal (duplicate + hide + snapshot),
                              revertToSnapshot, validateLayer.
  styles.css                — Minimal global styles (tab bar layout from starter template).

plugin/
  manifest.json             — UXP manifest v5. Single panel "ditherEffect". Permissions: fullAccess
                              filesystem, allowCodeGenerationFromStrings (required for eval-based source maps).
  index.html                — Entry HTML. Sets global.screen={} shim and loads index.js.
  icons/                    — Plugin icons (dark/light themes, 1x/2x scale).

dist/                       — Webpack output. Kept in repo for direct UXP loading. Contains compiled
                              index.js + copies of plugin/ assets.
```

## Processing Pipeline (Order Matters)
```
1. getLayerPixels(sourceLayer)     → Uint8Array (RGBA or RGB, chunky)
2. Cache in processingState.originalPixels (copied, not referenced)
3. applyPreprocessing():
   blur → sharpen → brightness → contrast → noise → grayscale
4. applyDitherAlgorithm():
   Dispatches to selected algorithm (bayer, floyd-steinberg, atkinson, etc.)
5. applyColorMapping():    (if mode !== 'none')
   Maps luminance to user-defined shadow/midtone/highlight colors
6. putLayerPixels()        → writes result to the "(Dithered)" layer
```
On subsequent slider changes (live mode), steps 3-6 re-run from the cached original pixels. No re-read from Photoshop is needed.

## Known Issues (Track These — See progresslog.md for Full History)
### Remaining TODO
- **`target` picker not implemented** — UI stores value but `initialApply()` always uses active layer. "Flattened Document" and "Selection Only" need processor logic.
- `sharpenRadius` has no UI slider (hardcoded default of 1)
- `shadowThreshold` / `highlightThreshold` (tritone) have no UI controls (hardcoded 85/170)
- No presets/save/load for settings
- No `executionContext.isCancelled` check during long processing (large images could freeze PS)
- `rgbToHex()` exported from colorMapping.js but never called (may be useful for future preset export)

### Fixed in v1.1.0
- smartObject validation dead branch — FIXED (moved check before array)
- Pixel read from hidden layer — FIXED (read before hide)
- Mono/Duotone identical — FIXED (Mono snaps, Duotone uses S-curve)
- Tritone midtone double-lerp — FIXED (flat midtone)
- PanelController enabled always true — FIXED (nullish coalescing)
- `scale` dead parameter — REMOVED
- All starter template dead code — DELETED (12 files)

## Code Style
- Functional React with hooks only (no class components, except the PanelController which is a class)
- Use `useRef` for mutable values that must not cause re-renders (processing flags, debounce timers, live mode state)
- Debounce live updates at 200ms using `setTimeout` + `clearTimeout`
- Export metadata arrays (`DITHER_ALGORITHMS`, `COLOR_MODES`) from core modules for UI consumption
- Guard concurrent operations with `isProcessingRef.current` ref flag, not state
- Alpha channel (4th component when `components === 4`) is always preserved/passed through unchanged

## Building & Loading
```bash
npm install                # First time only
npm run build              # One-time build → dist/
npm run watch              # Dev mode — rebuilds on file change via nodemon
```
Load via **UXP Developer Tools** → **Add Plugin** → select `dist/manifest.json` → **Load**.

Note: `npm run build` runs webpack in development mode (not production). The webpack config uses `eval-cheap-source-map` devtool which requires `allowCodeGenerationFromStrings: true` in the manifest.

## GitHub & Version Control
- **Repo:** https://github.com/DanielMevit/Dither-FX-1 (private)
- **Push from WSL:** use `powershell.exe -Command "Set-Location 'D:\Vibe Coding\Photoshop Plugins\Dither FX 1'; git push origin main"` — Git credentials live on the Windows side, not in WSL
- **Always push after completing a session's work.** The repo is the online backup and version control source of truth.
- **Commit messages:** short summary line, blank line, bullet points of changes. Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` at end.
- **Never force push to main.**

## When Making Changes
1. Run `npm run build` after editing — verify 0 errors, 0 warnings
2. Reload the plugin in UXP Developer Tools (or use the flyout menu "Reload Plugin" for hot reloads during `watch`)
3. Test with: a normal pixel layer, a smart object (should reject with error), a locked layer (should reject), an empty layer (should reject)
4. After applying: verify the original layer is hidden, the "(Dithered)" copy is visible and correct
5. After resetting: verify the document reverts to the pre-dither snapshot state
6. Test live mode: move a slider after initial apply — should update within ~200ms
7. Update `progresslog.md` with what changed and why (append only, never remove entries)
