# Progress Log — Dither Effect Plugin

All changes are logged chronologically. Entries are never removed, only added.

---

## 2026-03-15 15:31 CET — Initial Audit & Documentation Setup (Sonnet)

**By:** Claude Sonnet 4.6 (first pass audit)

### What Was Found (Existing State)
Full working dithering pipeline already implemented:
- 9 algorithms: None, Bayer 2x2/4x4/8x8, Floyd-Steinberg, Atkinson, Pattern A/B, Random
- Preprocessing: blur, sharpen, brightness, contrast, noise, grayscale
- Color mapping: Mono, Duotone, Tritone
- Non-destructive workflow: dithered layer copy + "Before Dither" snapshot for Reset
- Live mode with 200ms debounce after initial Apply
- Spectrum UXP components throughout the UI
- Clean module separation: `ditherAlgorithms`, `preprocessing`, `colorMapping`, `effectProcessor`, `layerManager`

### Bugs Identified (Not Yet Fixed)

1. **`smartObject` validation silent failure** (`src/ps/layerManager.js:32`)
   - `"smartObject"` is not in the `unsupportedTypes` array, so the specific error message "Smart Object must be rasterized first" can never be reached
   - Fix: add `"smartObject"` to the array OR move the smartObject check outside the array check

2. **`target` setting not implemented** (`src/panels/DitherEffect.jsx` + `src/core/effectProcessor.js`)
   - UI shows Active Layer / Flattened Document / Selection Only picker, stores value in settings
   - `initialApply()` receives `layer` (always the active layer) and ignores `settings.target`
   - Fix: add target logic in `initialApply` — flatten document for "flattened", use selection bounds for "selection"

3. **`scale` parameter dead code** (`src/core/effectProcessor.js:69`, `src/core/ditherAlgorithms.js`)
   - `scale: 1` in defaults, passed to `applyDitherAlgorithm`, passed to `noDither` — but no algorithm body uses it
   - Either implement it (pixel scaling before dither) or remove it

4. **Mono and Duotone are functionally identical** (`src/core/colorMapping.js:50-108`)
   - Both do `lerpColor(shadow, highlight, lum/255)` — same formula, same result
   - `applyDuotoneMapping` accepts `highlightThreshold` but ignores it
   - Fix: differentiate — Mono should snap to nearest color, Duotone should use a gamma curve or threshold

### Missing UI Controls
5. **`sharpenRadius`** — in `getDefaultSettings()` but no slider in panel; hardcoded to 1
6. **`shadowThreshold` / `highlightThreshold`** — tritone thresholds not exposed; hardcoded to 85/170

### Files Created This Session
- `soul.md` — Claude guidelines: architecture, UXP rules, known issues, code style
- `README.md` — Replaced boilerplate Adobe starter README with plugin-specific docs + agent role definition
- `progresslog.md` — This file (initial entry)

---

## 2026-03-15 15:37 CET — Deep Audit & Documentation Rewrite (Opus)

**By:** Claude Opus 4.6 (comprehensive re-audit)

### Full Codebase Review
Read every file in the project (all source files, configs, starter leftovers, webpack config, manifest, HTML entry point, CSS). This entry supersedes and expands the Sonnet audit above.

### Additional Bugs Found (Beyond Sonnet Audit)

7. **Pixel read from hidden layer** (`src/core/effectProcessor.js:157`)
   - `setupDitherStructureInternal()` hides the original source layer at line 180-183 of `layerManager.js`
   - Then `getLayerPixels(layer)` is called on that same (now hidden) layer at line 157 of `effectProcessor.js`
   - In some Photoshop versions, `imaging.getPixels()` on a hidden layer may return empty/zero pixel data
   - Fix: read pixels BEFORE hiding the source layer, or temporarily unhide for the read

8. **Tritone midtone zone double-lerp** (`src/core/colorMapping.js:139-142`)
   - The `else` branch (midtone zone, between shadowThreshold and highlightThreshold) computes:
     `lerpColor(midtone, lerpColor(midtone, highlight, t * 0.5), t)`
   - This creates a non-linear shift toward highlight even within the midtone zone
   - Expected behavior: the midtone zone should stay at or near `midtoneColor`, transitioning smoothly to the shadow/highlight zones at boundaries
   - Fix: use `color = midtone` for a flat midtone zone, or use a smooth 3-point interpolation

9. **PanelController menuItem `enabled` always true** (`src/controllers/PanelController.jsx:24`)
   - `enabled: menuItem.enabled || true` — JavaScript `||` with `true` on the right always evaluates to truthy
   - If a menuItem has `enabled: false`, the result is still `true` (because `false || true === true`)
   - Fix: use `menuItem.enabled ?? true` (nullish coalescing) or `menuItem.enabled !== undefined ? menuItem.enabled : true`

10. **`DITHER_ALGORITHMS` array imported but unused** (`src/panels/DitherEffect.jsx:3`)
    - The import `import { DITHER_ALGORITHMS } from "../core/ditherAlgorithms.js"` is present
    - But the algorithm dropdown at lines 250-273 is fully hardcoded with `<sp-menu-item>` elements
    - The `DITHER_ALGORITHMS` array is never mapped/iterated — it should be used to generate the dropdown, or the import should be removed

11. **`COLOR_MODES` and `DEFAULT_COLORS` imported but unused** (`src/panels/DitherEffect.jsx:4`)
    - `import { COLOR_MODES, DEFAULT_COLORS } from "../core/colorMapping.js"` — neither is referenced in the component body

12. **Unused exports across codebase:**
    - `rgbToHex()` in `colorMapping.js` — exported, never called
    - `getProcessingInfo()` in `effectProcessor.js` — exported, never called
    - `DITHER_GROUP_NAME` and `ORIGINAL_LAYER_SUFFIX` in `layerManager.js` — exported, never imported

### Dead Code / Starter Template Leftovers
The following files are leftover from the Adobe React starter template and are not imported or registered by the active plugin:
- `src/components/ColorPicker.jsx` + `ColorPicker.css`
- `src/components/Hello.jsx`
- `src/components/Icons.jsx` + `Icons.css`
- `src/components/WC.jsx`
- `src/panels/Demos.jsx`
- `src/panels/MoreDemos.jsx`
- `src/controllers/CommandController.jsx`
- `src/styles.css` (contains `.tabbar` / `.tabsection` styles from starter — not used by dither panel)

These add no functionality and increase bundle size. They can be safely deleted.

### Architectural Observations

**Strengths:**
- Clean separation of concerns: PS API calls isolated in `ps/`, pixel math in `core/`, UI in `panels/`
- Proper use of `useRef` to avoid stale closures in async callbacks
- Correct `executeAsModal` wrapping for all document mutations
- Smart pixel caching — original pixels read once, live updates re-process from cache
- Proper alpha channel preservation throughout all processing functions
- Good error boundary pattern — errors in live mode auto-disable live mode when document changes

**Weaknesses / Risks:**
- Module-level mutable state (`processingState` in effectProcessor.js) — works for single-panel plugin but would break if multiple instances existed
- No `executionContext.isCancelled` check during long processing — large images could freeze Photoshop with no way to cancel
- `applyBlur()` uses O(n * kernelSize) box blur — at radius 20 (max slider), each pass iterates 41 pixels per pixel. For a 4K image (3840x2160 = 8.3M pixels), that's ~340M iterations per pass, two passes = ~680M. This could take several seconds and block the UI
- No error handling for `imaging.createImageDataFromBuffer()` — if it fails (e.g., memory), the modal throws and leaves the document in a partially modified state

### Files Rewritten This Session
- `soul.md` — Complete rewrite with full architecture map, all dead code cataloged, all known issues, expanded build/test instructions
- `README.md` — Complete rewrite with accurate feature list, agent role definition including all UXP rules, comprehensive TODO/bug list
- `progresslog.md` — Added this detailed Opus audit entry (previous Sonnet entry preserved above)

---

## 2026-03-15 15:45 CET — Bug Fixes, Dead Code Cleanup & GitHub Setup (Opus)

**By:** Claude Opus 4.6 (implementation session)

### Project Renamed
- Folder renamed from `Test-a50im4` to `Dither FX 1`
- `manifest.json` id changed from `Test-a50im4` to `dither-fx-1`, name to `Dither FX`, version bumped to `1.1.0`
- `package.json` name changed from `com.adobe.uxp.starter.react` to `dither-fx`, version to `1.1.0`

### Bugs Fixed

1. **smartObject validation** (`layerManager.js`) — FIXED
   - Moved smartObject check before the `unsupportedTypes.includes()` block so it triggers independently
   - Now correctly returns "Smart Object must be rasterized first"

2. **Pixel read from hidden layer** (`effectProcessor.js`) — FIXED
   - Reordered `initialApply()`: now reads pixels BEFORE calling `setupDitherStructureInternal()` which hides the layer
   - Prevents potential empty pixel data on some PS versions

3. **Mono vs Duotone identical** (`colorMapping.js`) — FIXED
   - **Mono** now snaps to nearest color (hard threshold at luminance 128) — true 2-color output
   - **Duotone** now uses smoothstep S-curve `t*t*(3-2*t)` for richer midtone contrast
   - These now produce visibly different results

4. **Tritone midtone double-lerp** (`colorMapping.js`) — FIXED
   - Midtone zone now returns flat `midtone` color instead of confusing `lerpColor(midtone, lerpColor(midtone, highlight, t*0.5), t)`

5. **PanelController `enabled` always true** (`PanelController.jsx`) — FIXED
   - Changed `menuItem.enabled || true` to `menuItem.enabled ?? true` (nullish coalescing)
   - Same fix for `checked`: `|| false` → `?? false`

6. **`scale` parameter dead code** — REMOVED
   - Removed from `getDefaultSettings()`, `processPixels()`, `applyDitherAlgorithm()`, `noDither()` signature

### Dead Code Removed

Deleted 12 files that were unused Adobe React starter template leftovers:
- `src/components/ColorPicker.jsx` + `ColorPicker.css`
- `src/components/Hello.jsx`
- `src/components/Icons.jsx` + `Icons.css`
- `src/components/WC.jsx`
- `src/components/About.jsx` + `About.css`
- `src/panels/Demos.jsx`
- `src/panels/MoreDemos.jsx`
- `src/controllers/CommandController.jsx`
- `src/styles.css`
- `cursor text/` directory

Removed from imports:
- `DITHER_ALGORITHMS`, `COLOR_MODES`, `DEFAULT_COLORS` imports from `DitherEffect.jsx`
- `styles.css` import from `index.jsx`

Removed unused exports:
- `getProcessingInfo()` from `effectProcessor.js`
- `DITHER_GROUP_NAME`, `ORIGINAL_LAYER_SUFFIX` constants from `layerManager.js`

### Infrastructure
- Added `.gitignore` (node_modules/, dist/, .DS_Store, *.log)
- Build verified: webpack compiles successfully with 0 errors
- Initialized git repo and pushed to GitHub as `Dither-FX-1`

### Remaining TODO (Not Done This Session)
- `target` picker (Flattened / Selection) still UI-only — needs processor implementation
- `sharpenRadius` still has no UI slider
- `shadowThreshold` / `highlightThreshold` still have no UI controls
- `rgbToHex()` still exported but unused (may be useful for future preset export)
- No `executionContext.isCancelled` check for large image processing

---

## 2026-03-15 16:10 CET — Feature Implementation & API Simplification (Opus)

**By:** Claude Opus 4.6 (implementation session)

### Features Implemented

1. **Target picker fully wired** (`effectProcessor.js`, `layerManager.js`)
   - `initialApply()` now dispatches on `settings.target`: `'active-layer'`, `'flattened'`, `'selection'`
   - Added `getFlattenedPixels()` — reads document composite pixels
   - Added `getSelectionPixels()` — reads pixels within active selection bounds, falls back to full layer if no selection

2. **Sharpen Radius UI slider** (`DitherEffect.jsx`)
   - Conditionally shown when `sharpenStrength > 0`
   - Range: 1–10px, updates live via `onInput`

3. **Tritone threshold sliders** (`DitherEffect.jsx`)
   - Shadow Threshold (10–120) and Highlight Threshold (130–245) sliders
   - Conditionally shown when `colorMode === 'tritone'`
   - Updates live via `onInput`

### API Simplification

4. **`getFlattenedPixels()` simplified** (`layerManager.js`)
   - Replaced stamp-visible + read + delete-temp-layer approach with UXP composite mode
   - `imaging.getPixels()` without `layerID` (using `documentID` only) returns merged composite of all visible layers
   - Eliminates layer creation/deletion side effects, cleaner and faster

### Build
- Webpack compiles successfully with 0 errors

### Remaining TODO
- `rgbToHex()` still exported but unused (may be useful for future preset export)
- No `executionContext.isCancelled` check for large image processing
- No presets/save/load for settings
- Research findings from dither tools (Dithermark, Ditter Studio, etc.) not yet incorporated
