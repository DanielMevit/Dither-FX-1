/**
 * Color Mapping Module
 * Mono, Duotone, and Tri-tone color mapping for dithered images
 */

/**
 * Convert hex color string to RGB object
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

/**
 * Linear interpolation between two colors
 */
function lerpColor(color1, color2, t) {
    return {
        r: color1.r + (color2.r - color1.r) * t,
        g: color1.g + (color2.g - color1.g) * t,
        b: color1.b + (color2.b - color1.b) * t
    };
}

/**
 * Get luminance of a pixel (0-255)
 */
function getLuminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Apply mono (two-color) mapping
 * Snaps each pixel to the nearest of the two colors based on luminance midpoint
 */
export function applyMonoMapping(input, width, height, components, shadowColor, highlightColor) {
    const output = new Uint8Array(input.length);
    const shadow = typeof shadowColor === 'string' ? hexToRgb(shadowColor) : shadowColor;
    const highlight = typeof highlightColor === 'string' ? hexToRgb(highlightColor) : highlightColor;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;

            const lum = getLuminance(input[idx], input[idx + 1], input[idx + 2]);

            // Snap to nearest color at midpoint threshold
            const color = lum < 128 ? shadow : highlight;

            output[idx] = Math.round(color.r);
            output[idx + 1] = Math.round(color.g);
            output[idx + 2] = Math.round(color.b);

            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }

    return output;
}

/**
 * Apply duotone mapping
 * Smooth gradient between shadow and highlight colors with S-curve for richer tones
 */
export function applyDuotoneMapping(input, width, height, components, shadowColor, highlightColor) {
    const output = new Uint8Array(input.length);
    const shadow = typeof shadowColor === 'string' ? hexToRgb(shadowColor) : shadowColor;
    const highlight = typeof highlightColor === 'string' ? hexToRgb(highlightColor) : highlightColor;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;

            const lum = getLuminance(input[idx], input[idx + 1], input[idx + 2]);

            // S-curve (smoothstep) for richer midtone contrast vs mono's hard snap
            const t = lum / 255;
            const s = t * t * (3 - 2 * t);
            const color = lerpColor(shadow, highlight, s);

            output[idx] = Math.round(color.r);
            output[idx + 1] = Math.round(color.g);
            output[idx + 2] = Math.round(color.b);

            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }

    return output;
}

/**
 * Apply tri-tone mapping
 * Maps shadows, midtones, and highlights to separate colors
 */
export function applyTritoneMapping(
    input, width, height, components,
    shadowColor, midtoneColor, highlightColor,
    shadowThreshold = 85, highlightThreshold = 170
) {
    const output = new Uint8Array(input.length);
    const shadow = typeof shadowColor === 'string' ? hexToRgb(shadowColor) : shadowColor;
    const midtone = typeof midtoneColor === 'string' ? hexToRgb(midtoneColor) : midtoneColor;
    const highlight = typeof highlightColor === 'string' ? hexToRgb(highlightColor) : highlightColor;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            
            const lum = getLuminance(input[idx], input[idx + 1], input[idx + 2]);
            
            let color;
            if (lum <= shadowThreshold) {
                // Shadow to midtone transition
                const t = lum / shadowThreshold;
                color = lerpColor(shadow, midtone, t);
            } else if (lum >= highlightThreshold) {
                // Midtone to highlight transition
                const t = (lum - highlightThreshold) / (255 - highlightThreshold);
                color = lerpColor(midtone, highlight, t);
            } else {
                // In midtone range — stay at midtone color
                color = midtone;
            }
            
            output[idx] = Math.round(color.r);
            output[idx + 1] = Math.round(color.g);
            output[idx + 2] = Math.round(color.b);
            
            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }
    
    return output;
}

/**
 * Apply color mapping based on mode
 */
export function applyColorMapping(input, width, height, components, options) {
    const {
        mode = 'none',
        shadowColor = '#000000',
        midtoneColor = '#808080',
        highlightColor = '#ffffff',
        shadowThreshold = 85,
        highlightThreshold = 170
    } = options;
    
    switch (mode) {
        case 'mono':
            return applyMonoMapping(input, width, height, components, shadowColor, highlightColor);

        case 'duotone':
            return applyDuotoneMapping(input, width, height, components, shadowColor, highlightColor);

        case 'tritone':
            return applyTritoneMapping(
                input, width, height, components,
                shadowColor, midtoneColor, highlightColor,
                shadowThreshold, highlightThreshold
            );

        case 'palette': {
            // Use custom extracted palette if available, otherwise use preset
            if (options.customPalette && options.palettePreset === 'custom') {
                return applyPaletteMapping(input, width, height, components, options.customPalette);
            }
            const preset = options.palettePreset || 'grayscale-4';
            const paletteData = PALETTE_PRESETS[preset];
            const colors = paletteData ? paletteData.colors : ['#000000', '#ffffff'];
            return applyPaletteMapping(input, width, height, components, colors);
        }

        case 'none':
        default:
            return new Uint8Array(input);
    }
}

/**
 * Apply indexed palette mapping
 * Maps each pixel to the nearest color in a fixed palette
 */
export function applyPaletteMapping(input, width, height, components, palette) {
    const output = new Uint8Array(input.length);
    const colors = palette.map(c => typeof c === 'string' ? hexToRgb(c) : c);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            const r = input[idx], g = input[idx + 1], b = input[idx + 2];

            // Find nearest palette color (Euclidean distance in RGB)
            let bestDist = Infinity;
            let bestColor = colors[0];
            for (let i = 0; i < colors.length; i++) {
                const dr = r - colors[i].r;
                const dg = g - colors[i].g;
                const db = b - colors[i].b;
                const dist = dr * dr + dg * dg + db * db;
                if (dist < bestDist) {
                    bestDist = dist;
                    bestColor = colors[i];
                }
            }

            output[idx] = bestColor.r;
            output[idx + 1] = bestColor.g;
            output[idx + 2] = bestColor.b;

            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }

    return output;
}

/**
 * Apply color overlay (embue)
 * Blends original image colors onto the dithered luminance
 * @param {Uint8Array} dithered - Dithered pixel data
 * @param {Uint8Array} original - Original pixel data
 * @param {number} strength - Overlay strength 0-100
 */
export function applyColorOverlay(dithered, original, width, height, components, strength) {
    if (strength <= 0) return new Uint8Array(dithered);

    const output = new Uint8Array(dithered.length);
    const factor = strength / 100;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;

            // Get dithered luminance
            const ditherLum = getLuminance(dithered[idx], dithered[idx + 1], dithered[idx + 2]);

            // Get original color, normalized
            const origR = original[idx];
            const origG = original[idx + 1];
            const origB = original[idx + 2];
            const origLum = getLuminance(origR, origG, origB) || 1;

            // Scale original color to match dithered luminance
            const scale = ditherLum / origLum;
            const tintR = Math.min(255, origR * scale);
            const tintG = Math.min(255, origG * scale);
            const tintB = Math.min(255, origB * scale);

            // Blend between dithered and tinted version
            output[idx] = Math.round(dithered[idx] + (tintR - dithered[idx]) * factor);
            output[idx + 1] = Math.round(dithered[idx + 1] + (tintG - dithered[idx + 1]) * factor);
            output[idx + 2] = Math.round(dithered[idx + 2] + (tintB - dithered[idx + 2]) * factor);

            if (components === 4) {
                output[idx + 3] = dithered[idx + 3];
            }
        }
    }

    return output;
}

// Built-in palette presets
export const PALETTE_PRESETS = {
    'gameboy': {
        name: 'Game Boy',
        colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
    },
    'gameboy-pocket': {
        name: 'Game Boy Pocket',
        colors: ['#000000', '#545454', '#a9a9a9', '#ffffff']
    },
    'cga-0': {
        name: 'CGA Mode 4 (Cyan)',
        colors: ['#000000', '#00aaaa', '#aa00aa', '#aaaaaa']
    },
    'cga-1': {
        name: 'CGA Mode 4 (Red)',
        colors: ['#000000', '#aa0000', '#00aa00', '#aa5500']
    },
    'commodore-64': {
        name: 'Commodore 64',
        colors: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb']
    },
    'nes': {
        name: 'NES',
        colors: ['#000000', '#fcfcfc', '#f83800', '#f87858', '#0058f8', '#6888fc', '#00a800', '#b8f818', '#f8b800', '#fca044', '#d800cc', '#f878f8', '#007800', '#00b800', '#787878', '#bcbcbc']
    },
    'pico-8': {
        name: 'PICO-8',
        colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa']
    },
    'apple-ii': {
        name: 'Apple II',
        colors: ['#000000', '#6c2940', '#403578', '#d93cf0', '#135740', '#808080', '#2697f0', '#bfb4f8', '#404b07', '#d9680f', '#808080', '#eca8bf', '#26c30f', '#bfca87', '#93d6bf', '#ffffff']
    },
    'mono-green': {
        name: 'Mono Green',
        colors: ['#001100', '#003300', '#005500', '#009900', '#00cc00', '#00ff00']
    },
    'mono-amber': {
        name: 'Mono Amber',
        colors: ['#110800', '#331a00', '#553300', '#995500', '#cc7700', '#ffaa00']
    },
    'sepia': {
        name: 'Sepia',
        colors: ['#1a0f00', '#3d2b1f', '#704214', '#a0522d', '#c68e17', '#deb887', '#f5deb3', '#fff8dc']
    },
    'grayscale-4': {
        name: 'Grayscale 4',
        colors: ['#000000', '#555555', '#aaaaaa', '#ffffff']
    },
    'grayscale-8': {
        name: 'Grayscale 8',
        colors: ['#000000', '#242424', '#494949', '#6d6d6d', '#929292', '#b6b6b6', '#dbdbdb', '#ffffff']
    }
};

