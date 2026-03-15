/**
 * Palette Extractor Module
 * Extracts dominant colors from pixel data using median-cut quantization
 */

/**
 * Extract a palette of dominant colors from pixel data
 * @param {Uint8Array} pixels - RGBA/RGB pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components (3 or 4)
 * @param {number} colorCount - Number of colors to extract (2-32)
 * @returns {string[]} Array of hex color strings
 */
export function extractPaletteFromPixels(pixels, width, height, components, colorCount = 8) {
    // Sample pixels (skip every Nth for speed on large images)
    const totalPixels = width * height;
    const sampleRate = Math.max(1, Math.floor(totalPixels / 10000));
    const colors = [];

    for (let i = 0; i < pixels.length; i += components * sampleRate) {
        // Skip transparent pixels
        if (components === 4 && pixels[i + 3] < 128) continue;
        colors.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }

    if (colors.length === 0) {
        return ['#000000', '#ffffff'];
    }

    // Run median-cut quantization
    const quantized = medianCut(colors, Math.max(2, Math.min(32, colorCount)));

    // Sort by luminance (dark to light)
    quantized.sort((a, b) => {
        const lumA = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        const lumB = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
        return lumA - lumB;
    });

    return quantized.map(c =>
        '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
    );
}

/**
 * Median-cut quantization
 * Recursively splits color space along the axis with greatest range
 */
function medianCut(colors, targetCount) {
    if (colors.length === 0) return [];
    if (targetCount <= 1 || colors.length <= 1) {
        return [averageColor(colors)];
    }

    // Find the channel with the greatest range
    let maxRange = -1;
    let splitChannel = 0;
    for (let c = 0; c < 3; c++) {
        let min = 255, max = 0;
        for (const color of colors) {
            if (color[c] < min) min = color[c];
            if (color[c] > max) max = color[c];
        }
        const range = max - min;
        if (range > maxRange) {
            maxRange = range;
            splitChannel = c;
        }
    }

    // Sort by the channel with greatest range
    colors.sort((a, b) => a[splitChannel] - b[splitChannel]);

    // Split at the median
    const mid = Math.floor(colors.length / 2);
    const left = colors.slice(0, mid);
    const right = colors.slice(mid);

    const leftCount = Math.floor(targetCount / 2);
    const rightCount = targetCount - leftCount;

    return [
        ...medianCut(left, leftCount),
        ...medianCut(right, rightCount)
    ];
}

/**
 * Compute average color of a set of RGB triples
 */
function averageColor(colors) {
    if (colors.length === 0) return [0, 0, 0];
    let r = 0, g = 0, b = 0;
    for (const c of colors) {
        r += c[0];
        g += c[1];
        b += c[2];
    }
    const n = colors.length;
    return [r / n, g / n, b / n];
}
