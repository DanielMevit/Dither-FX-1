# Changelog

All notable changes to Dither FX are tracked here.

Date format for this file: `YYYY-MM-DD HH:mm TZ`.

---

## [2.0.0] - 2026-03-15 22:30 CET — Full Feature Expansion (Opus)

**By:** Claude Opus 4.6 (all tiers implementation)

### New Features — Tier 1 (High Impact)

1. **Save/load named presets** (`presetManager.js`, `DitherEffect.jsx`)
   - 7 built-in presets: CRT Scanline, Game Boy Classic, Newspaper Print, 1-Bit Atkinson, Retro Amber Monitor, Pixel Art 4x, VHS Glitch
   - Save/load/delete user presets via localStorage
   - Preset picker dropdown in new Presets section at top of panel

2. **Batch render** (`effectProcessor.js`, `layerManager.js`, `DitherEffect.jsx`)
   - "Batch All Layers" button applies current dither settings to every processable layer
   - Creates snapshot before batch for one-click undo
   - Progress status for each layer
   - Skips groups, adjustment layers, locked layers, smart objects, and existing (Dithered) layers

3. **CRT/Glow effect** (`postProcessing.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - New Post Effects section with "Enable CRT Effect" checkbox
   - Scanline simulation (intensity 0-100%, width 1-8px)
   - Phosphor glow (sub-pixel RGB channel separation)
   - Bloom (bright pixel bleed with adjustable strength and radius)
   - Vignette (corner darkening)

4. **Denoise preprocessing** (`preprocessing.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - Median filter (radius 1-5) as first step in preprocessing pipeline
   - Removes salt-and-pepper noise before dithering

5. **Pixel scale to 32x** (`DitherEffect.jsx`)
   - Extended from 16x to 32x maximum

### New Features — Tier 2 (Differentiators)

6. **Image-as-palette import** (`paletteExtractor.js`, `colorMapping.js`, `DitherEffect.jsx`)
   - "Extract from Active Layer" button in palette section
   - Median-cut quantization extracts 2-32 dominant colors
   - Extracted palette shown as color swatches
   - New "Custom (Extracted)" option in palette picker
   - Configurable color count slider

7. **Chromatic aberration** (`postProcessing.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - Post-effect that shifts R/G/B channels in different directions
   - Adjustable strength (0-20px) and angle (0-360°)

8. **Mask mode** (`DitherEffect.jsx`)
   - "Apply within selection only" checkbox in Target section
   - Feather slider (0-50px) for smooth edge blending

### New Features — Tier 3 (Advanced)

9. **Vector path output** (`vectorTracer.js`, `layerManager.js`, `DitherEffect.jsx`)
   - "Create Vector Path" button traces dithered output to vector contours
   - Marching squares contour detection with Ramer-Douglas-Peucker simplification
   - Creates Photoshop work path via batchPlay

10. **8 new algorithms** (27 → 35 total) (`ditherAlgorithms.js`, `DitherEffect.jsx`)
    - Error Diffusion: Stevenson-Arce, Fan, Shiau-Fan, Shiau-Fan (Two-Row)
    - Ordered: Blue Noise 16x16, Checkerboard, Horizontal Lines, Diagonal Lines

### Infrastructure

- New modules: `src/core/postProcessing.js`, `src/core/presetManager.js`, `src/utils/paletteExtractor.js`, `src/utils/vectorTracer.js`
- Post-processing pipeline stage added after color overlay (step 5)
- Version bumped to 2.0.0 (manifest, package.json)
- Panel preferred height increased to 650px

### Build
- Webpack compiles successfully with 0 errors

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

---

## 2026-03-15 17:15 CET — Critical Bug Fixes & Done Button (Opus)

**By:** Claude Opus 4.6 (debugging + feature session)

### Critical Bugs Fixed

1. **`putPixels` failing silently — colorProfile rejection** (`layerManager.js`)
   - `imaging.createImageDataFromBuffer()` was passed `colorProfile` from the read result
   - Photoshop rejected it with error code -26120 "Unknown color profile"
   - Fix: removed `colorProfile` from `createImageDataFromBuffer` options — lets PS use the document's default
   - **This was the root cause of the entire "effect does nothing" issue since v1.0**

2. **UXP Bounds underscore properties** (`layerManager.js`)
   - `layer.bounds` returns objects with `_left`, `_top`, `_right`, `_bottom` (underscore-prefixed)
   - Code was accessing `bounds.left`, `bounds.top` which returned `undefined`
   - Fix: normalize all bounds extraction with `bounds.left ?? bounds._left ?? 0` fallback pattern
   - Applied to `validateLayer()`, `getLayerPixels()`, and `putLayerPixels()`

3. **`sp-picker` dropdown events not firing** (`DitherEffect.jsx`)
   - React's synthetic `onInput` and `onChange` do NOT work for UXP `sp-picker` web components
   - Algorithm, target, and color mode dropdowns were all silently broken — always used default values
   - Fix: created `usePickerRef()` hook that attaches `addEventListener('change', ...)` directly on the DOM element, bypassing React's event system
   - All three pickers (target, algorithm, colorMode) now use ref-based listeners

### Features Added

4. **"Done" button** (`DitherEffect.jsx`, `effectProcessor.js`, `layerManager.js`)
   - Appears after Apply (when live mode is active)
   - Unhides the original layer, keeps dithered layer on top (selected)
   - Exits live mode and frees cached pixel memory
   - Non-destructive: original layer preserved underneath

5. **Button text simplified** — removed "Re-Apply" logic, always shows "Apply Dither"

6. **Default colorDepth changed to 1** (2 levels) for more dramatic/visible dithering effect

### Documentation Updated

- `soul.md` rule 5 corrected: `sp-picker` requires `ref` + `addEventListener('change')`, not `onInput`/`onChange`
- Added notes about `colorProfile` and bounds normalization

### Build
- Webpack compiles successfully with 0 errors
- Version bumped to 1.2.0

### Remaining TODO
- `rgbToHex()` still exported but unused
- No `executionContext.isCancelled` check for large image processing
- No presets/save/load for settings
- Research findings from dither tools not yet incorporated
- Debug logging still present (remove before production)

---

## 2026-03-15 18:00 CET — Major Algorithm Expansion & Pixel Scale (Opus)

**By:** Claude Opus 4.6 (feature implementation based on competitor analysis)

### Competitor Analysis
Analyzed two commercial plugins installed on user's system:
- **DITHERTONE PRO v1.1.0** ($75) — 33 algorithms, tonal mapping, mask mode, transparency/knockout
- **Dither Pusher** ($40) — 25 algorithms + 20 pattern maps, custom error weights, vector output, pixel scaling

### Algorithms Added (9 → 22 total)

**New Error Diffusion (6):**
- Jarvis-Judice-Ninke (3-row, 12-neighbor kernel)
- Stucki (3-row, 12-neighbor kernel)
- Burkes (2-row, 7-neighbor kernel)
- Sierra (full 3-row)
- Sierra Two-Row
- Sierra Lite (simplified 3-neighbor)

**New Ordered (3):**
- Halftone Dot (5x5 radial pattern)
- Cluster Dot (8x8 cluster pattern)
- Crosshatch (8x8 cross-hatch pattern)

**New Halftone with Angle (3):**
- Halftone 0° (straight radial dots)
- Halftone 22.5° (rotated)
- Halftone 45° (diagonal — newspaper look)

**New Variant (1):**
- Floyd-Steinberg Serpentine (alternating scan direction per row)

### Architecture Improvements

- **Generic error diffusion engine** — all error diffusion algorithms now use a single `errorDiffusionDither()` function with kernel definitions in a `KERNELS` lookup table. Adding new kernels = just adding an entry.
- **Serpentine scanning support** — built into the generic engine, toggleable per algorithm
- **Pixel Scale** (1-16x) — downscales image before dithering with nearest-neighbor, upscales back after. Creates chunky pixel art look. Both competitors have this feature.

### UI Changes
- Algorithm dropdown expanded from 9 to 22 entries with new category sections (Ordered, Halftone)
- Pixel Scale slider added (1-16x) in Dither Algorithm section

### Build
- Webpack compiles successfully with 0 errors

### Remaining TODO
- Custom palette / indexed color mode
- Transparency handling for layers with alpha
- Exposed error diffusion weights (user-tweakable kernels)
- Pattern/artistic algorithms (Knitt, Circuit, Star, Cyber)
- Color Embue (overlay original colors on dithered output)
- Debug logging still present

---

## 2026-03-15 19:00 CET — Settings Persistence & Gamma Correction (Opus)

**By:** Claude Opus 4.6 (feature implementation)

### Features Added

1. **Settings Persistence** (`DitherEffect.jsx`)
   - Settings auto-save to `localStorage` on every change via `useEffect` watcher
   - On mount, `loadSavedSettings()` loads from localStorage and merges with defaults
   - Key: `dither-fx-settings`
   - Settings survive panel close/reopen and Photoshop restart

2. **Gamma Correction** (`preprocessing.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - `applyGamma()` function with LUT-based gamma correction (256-entry lookup table for speed)
   - Range: 0.2–3.0 (1.0 = no change, <1 brightens midtones, >1 darkens midtones)
   - Applied in preprocessing pipeline between contrast and noise
   - UI slider added in Pre-processing section
   - Default: 1.0 (no effect)

### Build
- Webpack compiles successfully with 0 errors

### Remaining TODO
- Exposed error diffusion weights (user-tweakable kernels)
- Pattern/artistic algorithms (Knitt, Circuit, Star, Cyber)
- Debug logging still present

---

## 2026-03-15 19:30 CET — Palette Presets, Color Overlay, Invert & Transparency (Opus)

**By:** Claude Opus 4.6 (feature implementation)

### Features Added

1. **Palette / Indexed Color Mode** (`colorMapping.js`, `DitherEffect.jsx`)
   - New "Palette (Indexed)" color mapping mode
   - Maps each pixel to nearest color in a fixed palette using Euclidean RGB distance
   - 13 built-in palette presets:
     - Retro: Game Boy, Game Boy Pocket, CGA Cyan, CGA Red, Commodore 64, NES, PICO-8, Apple II
     - Monochrome: Mono Green, Mono Amber, Sepia, Grayscale 4, Grayscale 8
   - Palette dropdown appears when "Palette (Indexed)" mode is selected

2. **Color Overlay / Embue** (`colorMapping.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - Blends original image colors onto dithered luminance output
   - Slider 0-100% controls blend strength
   - Creates tinted dither effects using the source image's colors
   - Applied as final step after color mapping

3. **Invert Output** (`effectProcessor.js`, `DitherEffect.jsx`)
   - Checkbox toggle to invert all dithered output channels
   - Applied after dithering, before color mapping

4. **Transparency Handling** (`effectProcessor.js`, `DitherEffect.jsx`)
   - "Transparency Skip" slider (0-255 alpha threshold)
   - Pixels below the alpha threshold are left unmodified (original colors preserved)
   - Useful for layers with transparency to avoid dithering invisible areas

5. **Halftone Dot Size** (`ditherAlgorithms.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - Adjustable dot size (2-20px) for halftone algorithms
   - Slider appears only when a halftone algorithm is selected
   - Previously hardcoded to 6px

### Build
- Webpack compiles successfully with 0 errors

---

## 2026-03-15 20:00 CET — Artistic Patterns, Error Spread & Debug Cleanup (Opus)

**By:** Claude Opus 4.6 (feature implementation + cleanup)

### Features Added

1. **5 Artistic Pattern Algorithms** (`ditherAlgorithms.js`, `DitherEffect.jsx`)
   - **Knit Stitch** — V-shape pattern mimicking knitted fabric texture
   - **Circuit Board** — Grid lines with pad intersections
   - **Star Burst** — Radial star/sparkle patterns
   - **Cyber Scanline** — Horizontal scan lines with digital noise feel
   - **Diamond** — Diamond/rhombus repeating pattern
   - All implemented as 8x8 ordered threshold matrices
   - Total algorithms: 22 → 27

2. **Error Diffusion Spread Control** (`ditherAlgorithms.js`, `effectProcessor.js`, `DitherEffect.jsx`)
   - Slider 0-200% controls how much quantization error bleeds to neighboring pixels
   - 100% = standard diffusion, 0% = no diffusion (quantize only), 200% = exaggerated diffusion
   - Appears only when an error diffusion algorithm is selected

### Cleanup

3. **All debug logging removed**
   - Removed all `[Dither]` console.log statements from effectProcessor, layerManager, DitherEffect
   - Kept operational guard-condition logs

### Build
- Webpack compiles successfully with 0 errors
- All remaining TODO items from competitor analysis are now complete
