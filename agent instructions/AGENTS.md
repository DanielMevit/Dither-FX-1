# Agent rules for this repo (Dither FX 1)

## Reading ritual
- At session start, read `agent instructions/SOUL.md`, then `agent instructions/AGENTS.md`, then `README.md` from the repo root, silently and obey them.
- Do not summarize them unless Daniel explicitly asks.

## SOUL handling
- Treat SOUL.md as identity/standards. Update it only when those evolve (not as a task log).

## Workflow
- Don't ask for permission or micromanage. Plan, implement, run, summarize in one go.
- Work in milestone-sized steps: Plan → implement → run → summarize.
- One task should deliver a visible improvement and include verification (build) and a CHANGELOG.md entry.
- Do not modify anything outside this repository.
- Do not rename or rearrange `src/` or `plugin/` without a clear reason and doc updates.

## UXP Core Constraints — Never Break These
1. **Every document mutation must be inside `core.executeAsModal()`**. This includes pixel reads (`getPixels`), pixel writes (`putPixels`), layer creation/duplication, visibility changes, and snapshot creation. Failing to wrap in a modal throws a UXP security error.
2. **Never modify the original source layer's pixels.** The pipeline reads from the original (which gets hidden), caches those pixels in `processingState.originalPixels`, and writes only to the duplicated "(Dithered)" layer.
3. **All pixel processing is pure JavaScript on `Uint8Array` / `Float32Array` buffers.** Do not use Photoshop's built-in filters, adjustments, or actions for image processing. The entire point is real-time, slider-driven control.
4. **`require("photoshop")` and `require("uxp")` are the correct import styles.** UXP does not support ES6 `import` for host APIs. The webpack externals config maps these to `commonjs2`. Do not refactor to ES6 imports.
5. **Spectrum UXP components (`sp-*`) have different event semantics than HTML.** Use `onInput` for `sp-slider` and `sp-textfield`. For `sp-picker` (dropdown), React's synthetic `onChange`/`onInput` do NOT work — you MUST use a `ref` + direct `addEventListener('change', handler)` on the DOM element. For `sp-checkbox`, use `checked={val ? true : undefined}` — setting `checked={false}` still results in a checked state in UXP because it treats any attribute presence as truthy.
6. **Color inputs use native `<input type="color">` with `onChange`** — this is correct because these are standard HTML elements, not Spectrum components. Don't change these to `onInput`.
7. **Do NOT pass `colorProfile` to `imaging.createImageDataFromBuffer()`** — it causes error -26120 "Unknown color profile". Omit it entirely and let Photoshop use the document's default.
8. **UXP Bounds objects may use underscore-prefixed properties** (`_left`, `_top`, `_right`, `_bottom`). Always access with fallback: `bounds.left ?? bounds._left ?? 0`.

## Documentation
- CHANGELOG.md is the timestamped session and release log. Append every meaningful change with a `YYYY-MM-DD HH:mm CET` header. Session summaries go here too.
- README.md is the project overview only. Update feature lists and structure section when new features are added. Do not add progress logs or session notes to README.
- Keep entries concise. No long logs, no file lists.

## Architecture
```
src/
  index.jsx                 — Entry point. Registers "ditherEffect" panel via entrypoints.setup().
  controllers/
    PanelController.jsx     — Generic panel lifecycle controller (create/show/hide/destroy/invokeMenu).
  panels/
    DitherEffect.jsx        — Main UI panel. All state management, event handlers, live mode logic.
                              Settings persist to localStorage. usePickerRef() hook for sp-picker events.
                              Cancel button + abort mechanism for long operations.
    DitherEffect.css        — Compact panel styling with CSS variables, dark/light theme support.
                              Inline section headers (.section-header-inline) for title+picker rows.
  core/
    effectProcessor.js      — Pipeline orchestrator. Manages processingState (cached original pixels,
                              dithered layer ID, document ID). Exposes initialApply(), updateEffect(),
                              commitEffect(), resetEffect(), processPixels(), batchApply().
    ditherAlgorithms.js     — 35 dither algorithms: generic error diffusion engine with kernel lookup,
                              ordered dithering with 13 matrices, halftone with angle rotation,
                              pixel scaling (downscale → dither → upscale), random noise.
    preprocessing.js        — Image preprocessing: median denoise, box blur, unsharp mask, brightness,
                              contrast, gamma correction (LUT-based), noise, grayscale.
    colorMapping.js         — Post-dither color mapping: mono, duotone, tritone, indexed palette (13 presets).
                              Color overlay blends original colors onto dithered luminance.
    postProcessing.js       — CRT effect (scanlines, phosphor glow, bloom, vignette), chromatic aberration.
    presetManager.js        — 7 built-in presets + user preset CRUD via localStorage.
  utils/
    vectorTracer.js         — Marching squares contour detection + Ramer-Douglas-Peucker simplification.
                              Abort signal support, 200 contour cap, iterative RDP.
    paletteExtractor.js     — Median-cut color quantization (2-32 colors from pixel data).
  ps/
    layerManager.js         — All Photoshop API interactions: getLayerPixels, putLayerPixels,
                              getFlattenedPixels, getSelectionPixels, setupDitherStructureInternal,
                              revertToSnapshot, finalizeDither, validateLayer, createVectorPath.

plugin/
  manifest.json             — UXP manifest v5, version 2.0.0. Single panel "ditherEffect".
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
9. applyCRTEffect():       (if crtEnabled)
   Scanlines, phosphor glow, bloom, vignette
10. applyChromaticAberration(): (if chromaticAberration > 0)
    RGB channel separation
11. putLayerPixels()        → writes result to the "(Dithered)" layer
```
On subsequent slider changes (live mode), steps 3–9 re-run from the cached original pixels.

## Code Style
- Functional React with hooks only (no class components, except PanelController which is a class)
- Use `useRef` for mutable values that must not cause re-renders (processing flags, debounce timers)
- Debounce live updates at 200ms using `setTimeout` + `clearTimeout`
- Guard concurrent operations with `isProcessingRef.current` ref flag, not state
- Alpha channel (4th component when `components === 4`) is always preserved/passed through unchanged
- Hex color textfield input validated with regex before updating state

## Known Issues
- No `executionContext.isCancelled` check during long processing (large images could freeze PS)
- Changing target mode (active layer / flattened / selection) during live mode has no effect — requires re-apply

## Building & Loading
```bash
npm install                # First time only
npm run build              # One-time build → dist/
npm run watch              # Dev mode — rebuilds on file change via nodemon
```
Load via **UXP Developer Tools** → **Add Plugin** → select `dist/manifest.json` → **Load**.
Always run `npm run build` after changes. Must compile with 0 errors before commit.

## Testing checklist
1. Test with: a normal pixel layer, a smart object (should reject), a locked layer (should reject), an empty layer (should reject)
2. After applying: verify the original layer is hidden, the "(Dithered)" copy is visible and correct
3. After resetting: verify the document reverts to the pre-dither snapshot state
4. Test live mode: move a slider after initial apply — should update within ~200ms

## Version roadmap
- **v1.0** (done): Core dithering pipeline — 9 algorithms, preprocessing, mono/duotone/tritone color mapping, non-destructive workflow, live mode
- **v1.1** (done): Project rename, bug fixes (smartObject validation, pixel read ordering, mono/duotone differentiation, tritone midtone, PanelController enabled), dead code cleanup, GitHub setup
- **v1.2** (done): Target picker wired (active/flattened/selection), sharpen radius UI, tritone threshold sliders, colorProfile fix, UXP bounds normalization, sp-picker ref fix, Done button
- **v1.3** (done): Algorithm expansion (9→27), pixel scale, settings persistence, gamma correction, palette presets (13), color overlay, invert, transparency handling, halftone dot size, artistic patterns (5), error spread control
- **v2.0** (done): Presets (7 built-in + user), batch render, CRT/glow post-effect, denoise, 32x pixel scale, image-as-palette extraction, chromatic aberration, mask mode, vector path output, 8 new algorithms (35 total)
- **v2.1** (next): See `ROADMAP.md` for planned enhancements

## Commit & push
- Commit message format: short summary line, blank line, bullet points of changes.
- **Never force push to main.**
