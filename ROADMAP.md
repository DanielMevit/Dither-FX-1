# Roadmap — Dither FX v2.0

## Competitive Landscape

### Dither Pusher 2 — $40
- 45 algorithms (28 error diffusion + 6 ordered + 50 pattern presets)
- Spectrum Glow module — physically accurate glow with per-channel chromatic control
- CRT dithering presets
- Indexed color with 3 render modes — layered composites by swatches, alpha channels, or blend modes
- Batch render — apply effect across all layers/frames (video, GIF, image sequences)
- Pattern browser with 20 signature patterns + 30 new pattern dithers
- Image-as-palette import — use any image to extract color palettes
- 32x pixel scale + source DPI support
- Vector path output — 2-color vector for Illustrator

### DITHERTONE PRO v2.0 — $75
- 33 algorithms
- Smart Resampling — pixel-perfect crisp edges or rounded feels
- DPI-based scaling — 300 graduated options
- Transparency/Test mode + Mask mode
- Save/load settings presets
- Tri-tone mapping with live preview
- Denoise preprocessing

### Dither Boy v3.0 (Standalone) — ~$30
- 63 algorithms
- Stackable effects pipeline
- Epsilon Glow, JPEG Glitch, Chromatic Aberration
- Auto palette extraction from images
- Vector export (SVG)
- Video/animation batch dithering
- Community palette sharing

## Feature Gap Analysis

| Feature                   | Dither Pusher | DITHERTONE    | Dither Boy | Dither FX |
|---------------------------|---------------|---------------|------------|-----------|
| Algorithms                | 45            | 33            | 63         | 27        |
| Glow/CRT effects          | Yes           | No            | Yes        | No        |
| Batch render (all layers) | Yes           | No            | Yes        | No        |
| Save/load named presets   | No            | Yes           | N/A        | No        |
| Image-as-palette import   | Yes           | No            | Yes        | No        |
| Vector output             | Yes           | No            | Yes        | No        |
| DPI-based scaling         | Yes (32x)     | Yes (300 steps)| N/A       | 16x only  |
| Mask mode                 | No            | Yes           | No         | No        |
| Denoise                   | No            | Yes           | No         | No        |
| CRT presets               | Yes           | No            | Yes        | No        |
| Chromatic aberration       | No            | No            | Yes        | No        |

## Implementation Plan

### Tier 1 — High Impact, Achievable Now
1. **Save/load named presets** — DITHERTONE has this, users expect it
2. **Batch render** — apply to all layers in document (huge for animation workflows)
3. **CRT/Glow effect** — both competitors have this, very trendy retro aesthetic
4. **Denoise preprocessing** — simple median filter, DITHERTONE has it
5. **Pixel scale to 32x** — Dither Pusher goes to 32x, we cap at 16x

### Tier 2 — Differentiators
6. **Image-as-palette import** — extract palette from any image
7. **Chromatic aberration** post-effect
8. **Mask mode** — apply dither only within a mask/selection with feathering

### Tier 3 — Advanced
9. **Vector path output** (complex, requires path tracing)
10. **More algorithms** to close the gap (we're at 27, competitors at 33–63)

## Sources
- https://aescripts.com/dither-pusher-photoshop-plugin/
- https://www.doronsupply.com/product/dithertone-pro
- https://studioaaa.com/product/dither-boy/
- https://studioaaa.com/dither-boy-v3-0/
