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
 * Convert RGB to hex string
 */
export function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
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
        
        case 'none':
        default:
            return new Uint8Array(input);
    }
}

// Color mode metadata for UI
export const COLOR_MODES = [
    { value: 'none', label: 'None (Original Colors)' },
    { value: 'mono', label: 'Mono (2 Colors)' },
    { value: 'duotone', label: 'Duotone' },
    { value: 'tritone', label: 'Tri-tone' }
];

// Default color presets
export const DEFAULT_COLORS = {
    shadow: '#000000',
    midtone: '#808080',
    highlight: '#ffffff'
};
