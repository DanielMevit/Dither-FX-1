# Dither Effect — Photoshop UXP Plugin

A real-time, non-destructive dithering plugin for Adobe Photoshop (24.0+). All pixel processing runs in JavaScript on typed arrays, giving slider-driven control over every parameter without relying on Photoshop's built-in filters.

## Features

- **9 dithering algorithms:** None (quantize only), Bayer 2x2 / 4x4 / 8x8 (ordered), Floyd-Steinberg, Atkinson (error diffusion), Pattern A / B, Random Noise
- **Preprocessing pipeline:** Blur, Sharpen, Brightness, Contrast, Noise, Grayscale — applied in fixed order before dithering
- **Color mapping:** None, Mono (2-color), Duotone, Tri-tone — maps post-dither luminance to custom colors
- **Non-destructive workflow:** Duplicates the source layer, hides the original, creates a history snapshot for one-click revert
- **Live mode:** After the first Apply, slider changes auto-update the dithered layer with 200ms debounce

## Setup

```bash
npm install
npm run build      # Build once → dist/
npm run watch      # Dev mode — rebuilds on save via nodemon
```

Load in Photoshop via **UXP Developer Tools** → **Add Plugin** → select `dist/manifest.json` → **Load**.

**Requirements:** Photoshop 24.0+ / UXP 5.6+ / Node.js (for build tooling only)

---

## Agent Role: UXP Photoshop Plugin Developer

This section defines the knowledge and constraints an AI agent needs to work on this codebase.

### Domain Knowledge Required
- Adobe UXP (Unified Extensibility Platform) — the plugin runtime replacing CEP
- UXP manifest v5 — permissions model, entrypoints, panel configuration
- Photoshop DOM API — documents, layers, history states
- Photoshop Imaging API — `getPixels`, `putPixels`, `createImageDataFromBuffer`
- Photoshop Action API — `batchPlay` descriptors for layer operations, snapshots
- Adobe Spectrum Web Components — `sp-button`, `sp-slider`, `sp-picker`, `sp-checkbox`, `sp-textfield`, etc.
- React 16 with hooks in a constrained browser-like environment (no full DOM, no fetch, limited CSS)
- Typed array pixel processing — `Uint8Array`, `Float32Array`, RGBA layout, clamping

### UXP Execution Rules
1. **`core.executeAsModal()` wraps every document mutation.** Pixel reads, pixel writes, layer operations, snapshot creation — all must be inside a modal callback. Outside a modal, Photoshop will reject the call.
2. **`require("photoshop")` and `require("uxp")` are correct.** Webpack externals map these to `commonjs2`. ES6 import syntax will not work for host APIs.
3. **No standard browser APIs.** No `fetch`, no `XMLHttpRequest`, no `localStorage`, no `window.open`. UXP provides its own file system, network, and storage APIs where needed.
4. **Spectrum components use `onInput`, not `onChange`.** Exception: native HTML `<input type="color">` uses `onChange` as normal.
5. **Spectrum checkbox truthy-attribute quirk:** `checked={false}` still checks the box because UXP treats attribute presence as truthy. Use `checked={val ? true : undefined}` instead.
6. **Source maps:** The webpack config uses `eval-cheap-source-map`, which requires `allowCodeGenerationFromStrings: true` in manifest.json.

### Key Files

| File | Responsibility |
|------|----------------|
| `src/index.jsx` | Entry point — registers the `ditherEffect` panel via `entrypoints.setup()` |
| `src/panels/DitherEffect.jsx` | All UI controls, React state, live mode logic, Apply/Reset handlers |
| `src/panels/DitherEffect.css` | Full panel styling — CSS variables, dark/light themes, responsive |
| `src/core/effectProcessor.js` | Pipeline orchestrator — `initialApply()`, `updateEffect()`, `processPixels()`, pixel cache |
| `src/core/ditherAlgorithms.js` | All 9 dither algorithm implementations |
| `src/core/preprocessing.js` | Blur, sharpen, brightness, contrast, noise, grayscale |
| `src/core/colorMapping.js` | Mono, duotone, tritone color remapping |
| `src/ps/layerManager.js` | All Photoshop API calls — pixel I/O, layer setup, snapshots, validation |
| `plugin/manifest.json` | UXP manifest — permissions, panel definition, icon config |
| `webpack.config.js` | Webpack 5 config — Babel, CSS loaders, CopyPlugin for plugin/ assets |

### Processing Pipeline
```
Original layer pixels (cached after first Apply)
  → applyPreprocessing()    [blur → sharpen → brightness → contrast → noise → grayscale]
  → applyDitherAlgorithm()  [selected algorithm from 9 options]
  → applyColorMapping()     [if mode !== 'none': mono/duotone/tritone]
  → putLayerPixels()        [write to the "(Dithered)" copy layer]
```

Live updates skip the pixel read — they re-process from the cached `Uint8Array` and write back.

### Known Issues / TODO

**Bugs:**
- [ ] `smartObject` not in `unsupportedTypes` array — specific error message for smart objects is unreachable dead code (`layerManager.js:32-37`)
- [ ] `target` picker (Flattened Document / Selection Only) stores value in settings but `initialApply()` ignores it — always processes active layer
- [ ] Mono and Duotone color modes are functionally identical — both do `lerpColor(shadow, highlight, lum/255)`. Duotone accepts `highlightThreshold` but never uses it
- [ ] Tritone midtone zone uses a confusing double-lerp `lerpColor(midtone, lerpColor(midtone, highlight, t*0.5), t)` that shifts toward highlight instead of staying flat at midtone
- [ ] `scale` parameter in defaults — passed through the pipeline but no algorithm body references it
- [ ] Pixel read from hidden layer — `getLayerPixels(layer)` is called after `setupDitherStructureInternal()` hides the source layer; may return empty data in some PS versions
- [ ] `PanelController` menuItem `enabled` always evaluates to `true` due to `||` short-circuit on truthy default (`enabled: menuItem.enabled || true` — should be `?? true`)

**Dead code to clean up:**
- [ ] `src/components/` — ColorPicker, Hello, Icons, WC (all starter template leftovers, nothing imports them)
- [ ] `src/panels/Demos.jsx`, `src/panels/MoreDemos.jsx` — not registered, not loaded
- [ ] `src/controllers/CommandController.jsx` — dialog controller, not used
- [ ] `DITHER_ALGORITHMS` imported in DitherEffect.jsx but dropdown is hardcoded — either use the array or remove the import
- [ ] `COLOR_MODES`, `DEFAULT_COLORS` imported but never referenced in DitherEffect.jsx
- [ ] `rgbToHex()`, `getProcessingInfo()` exported but never called anywhere
- [ ] `DITHER_GROUP_NAME`, `ORIGINAL_LAYER_SUFFIX` exported from layerManager but never imported

**Missing UI controls:**
- [ ] `sharpenRadius` — setting exists (default 1) but no slider in the panel
- [ ] `shadowThreshold` / `highlightThreshold` — tritone thresholds not exposed (hardcoded 85/170)

**Feature gaps:**
- [ ] `flattened` and `selection` target modes not implemented
- [ ] No preset save/load system
- [ ] No progress indicator for large images (beyond status text)
- [ ] Single undo snapshot — re-applying creates a new snapshot but doesn't clean up old dithered layers
