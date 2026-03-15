/**
 * Dither Algorithms Module
 * Contains all dithering implementations optimized for typed arrays
 */

// ============================================================
// THRESHOLD MATRICES
// ============================================================

const BAYER_2x2 = [
    0, 2,
    3, 1
].map(v => (v / 4) - 0.5);

const BAYER_4x4 = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
].map(v => (v / 16) - 0.5);

const BAYER_8x8 = [
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
].map(v => (v / 64) - 0.5);

// 5x5 Halftone-style radial pattern
const HALFTONE_5x5 = [
    20, 16, 12, 17, 21,
    15, 5, 1, 6, 18,
    11, 0, 24, 2, 13,
    14, 4, 3, 7, 19,
    10, 9, 8, 23, 22
].map(v => (v / 25) - 0.5);

// 8x8 Cluster dot pattern
const CLUSTER_8x8 = [
    24, 10, 12, 26, 35, 47, 49, 37,
    8, 0, 2, 14, 45, 59, 61, 51,
    22, 6, 4, 16, 43, 57, 63, 53,
    30, 20, 18, 28, 33, 41, 55, 39,
    34, 46, 48, 36, 25, 11, 13, 27,
    44, 58, 60, 50, 9, 1, 3, 15,
    42, 56, 62, 52, 23, 7, 5, 17,
    32, 40, 54, 38, 31, 21, 19, 29
].map(v => (v / 64) - 0.5);

// Pattern matrices
const PATTERN_A = [
    0, 4, 2, 6, 0, 4, 2, 6,
    6, 2, 4, 0, 6, 2, 4, 0,
    1, 5, 3, 7, 1, 5, 3, 7,
    7, 3, 5, 1, 7, 3, 5, 1,
    0, 4, 2, 6, 0, 4, 2, 6,
    6, 2, 4, 0, 6, 2, 4, 0,
    1, 5, 3, 7, 1, 5, 3, 7,
    7, 3, 5, 1, 7, 3, 5, 1
].map(v => (v / 8) - 0.5);

const PATTERN_B = [
    7, 5, 6, 4, 7, 5, 6, 4,
    3, 1, 2, 0, 3, 1, 2, 0,
    6, 4, 7, 5, 6, 4, 7, 5,
    2, 0, 3, 1, 2, 0, 3, 1,
    7, 5, 6, 4, 7, 5, 6, 4,
    3, 1, 2, 0, 3, 1, 2, 0,
    6, 4, 7, 5, 6, 4, 7, 5,
    2, 0, 3, 1, 2, 0, 3, 1
].map(v => (v / 8) - 0.5);

// Cross-hatch pattern
const CROSSHATCH_8x8 = [
    0, 12, 8, 4, 0, 12, 8, 4,
    14, 2, 10, 6, 14, 2, 10, 6,
    8, 10, 0, 12, 8, 10, 0, 12,
    4, 6, 14, 2, 4, 6, 14, 2,
    0, 12, 8, 4, 0, 12, 8, 4,
    14, 2, 10, 6, 14, 2, 10, 6,
    8, 10, 0, 12, 8, 10, 0, 12,
    4, 6, 14, 2, 4, 6, 14, 2
].map(v => (v / 15) - 0.5);

// ============================================================
// ERROR DIFFUSION KERNELS
// ============================================================

// Each kernel defines: [dx, dy, weight] offsets from current pixel
// divisor is the sum of all weights

const KERNELS = {
    'floyd-steinberg': {
        offsets: [[1,0,7], [-1,1,3], [0,1,5], [1,1,1]],
        divisor: 16
    },
    'jarvis': {
        offsets: [
            [1,0,7], [2,0,5],
            [-2,1,3], [-1,1,5], [0,1,7], [1,1,5], [2,1,3],
            [-2,2,1], [-1,2,3], [0,2,5], [1,2,3], [2,2,1]
        ],
        divisor: 48
    },
    'stucki': {
        offsets: [
            [1,0,8], [2,0,4],
            [-2,1,2], [-1,1,4], [0,1,8], [1,1,4], [2,1,2],
            [-2,2,1], [-1,2,2], [0,2,4], [1,2,2], [2,2,1]
        ],
        divisor: 42
    },
    'burkes': {
        offsets: [
            [1,0,8], [2,0,4],
            [-2,1,2], [-1,1,4], [0,1,8], [1,1,4], [2,1,2]
        ],
        divisor: 32
    },
    'sierra': {
        offsets: [
            [1,0,5], [2,0,3],
            [-2,1,2], [-1,1,4], [0,1,5], [1,1,4], [2,1,2],
            [-1,2,2], [0,2,3], [1,2,2]
        ],
        divisor: 32
    },
    'sierra-two-row': {
        offsets: [
            [1,0,4], [2,0,3],
            [-2,1,1], [-1,1,2], [0,1,3], [1,1,2], [2,1,1]
        ],
        divisor: 16
    },
    'sierra-lite': {
        offsets: [[1,0,2], [-1,1,1], [0,1,1]],
        divisor: 4
    },
    'atkinson': {
        offsets: [[1,0,1], [2,0,1], [-1,1,1], [0,1,1], [1,1,1], [0,2,1]],
        divisor: 8 // Only diffuses 6/8 of error (intentional)
    }
};

// ============================================================
// CORE ALGORITHMS
// ============================================================

/**
 * No dithering - just quantizes to color levels
 */
export function noDither(input, width, height, components, colorDepth) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);

    for (let i = 0; i < input.length; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            output[i] = Math.max(0, Math.min(255, Math.round(input[i] / step) * step));
        }
    }

    return output;
}

/**
 * Generic error diffusion dithering engine
 * Supports all kernel-based algorithms + optional serpentine scanning
 */
export function errorDiffusionDither(input, width, height, components, colorDepth, intensity, kernelName, serpentine = false) {
    const kernel = KERNELS[kernelName];
    if (!kernel) return noDither(input, width, height, components, colorDepth);

    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const len = input.length;
    const rowSize = width * components;

    const buffer = new Float32Array(len);
    for (let i = 0; i < len; i++) buffer[i] = input[i];

    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        const leftToRight = !serpentine || (y % 2 === 0);

        const xStart = leftToRight ? 0 : width - 1;
        const xEnd = leftToRight ? width : -1;
        const xStep = leftToRight ? 1 : -1;

        for (let x = xStart; x !== xEnd; x += xStep) {
            const idx = rowStart + x * components;

            for (let c = 0; c < 3; c++) {
                const i = idx + c;
                const oldVal = buffer[i];
                const newVal = Math.round(oldVal / step) * step;
                const error = (oldVal - newVal) * intensity / kernel.divisor;

                buffer[i] = newVal;

                for (const [dx, dy, weight] of kernel.offsets) {
                    const nx = x + (leftToRight ? dx : -dx);
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny < height) {
                        buffer[ny * rowSize + nx * components + c] += error * weight;
                    }
                }
            }
        }
    }

    const output = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            output[i] = Math.max(0, Math.min(255, Math.round(buffer[i])));
        }
    }

    return output;
}

/**
 * Ordered dithering with selectable matrix
 */
export function orderedDither(input, width, height, components, colorDepth, intensity, matrixName = 'bayer-8x8') {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);

    let matrix, size;
    switch (matrixName) {
        case 'bayer-2x2': matrix = BAYER_2x2; size = 2; break;
        case 'bayer-4x4': matrix = BAYER_4x4; size = 4; break;
        case 'bayer-8x8': matrix = BAYER_8x8; size = 8; break;
        case 'halftone': matrix = HALFTONE_5x5; size = 5; break;
        case 'cluster': matrix = CLUSTER_8x8; size = 8; break;
        case 'crosshatch': matrix = CROSSHATCH_8x8; size = 8; break;
        case 'pattern-a': matrix = PATTERN_A; size = 8; break;
        case 'pattern-b': matrix = PATTERN_B; size = 8; break;
        default: matrix = BAYER_8x8; size = 8; break;
    }

    const rowSize = width * components;

    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        const matrixRowOffset = (y % size) * size;

        for (let x = 0; x < width; x++) {
            const idx = rowStart + x * components;
            const threshold = matrix[matrixRowOffset + (x % size)] * intensity * step;

            for (let c = 0; c < 3; c++) {
                const oldVal = input[idx + c] + threshold;
                const newVal = Math.round(oldVal / step) * step;
                output[idx + c] = Math.max(0, Math.min(255, newVal));
            }

            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }

    return output;
}

/**
 * Halftone dithering with angle rotation
 * Creates circular dot patterns at specified angle
 */
export function halftoneDither(input, width, height, components, colorDepth, intensity, angle = 0, dotSize = 6) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);
    const rowSize = width * components;

    const rad = angle * Math.PI / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cellSize = Math.max(2, dotSize);

    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;

        for (let x = 0; x < width; x++) {
            const idx = rowStart + x * components;

            // Rotate coordinates
            const rx = x * cosA - y * sinA;
            const ry = x * sinA + y * cosA;

            // Position within halftone cell (0..1)
            const cx = ((rx % cellSize) + cellSize) % cellSize / cellSize;
            const cy = ((ry % cellSize) + cellSize) % cellSize / cellSize;

            // Radial distance from cell center (0 = center, 1 = corner)
            const dx = cx - 0.5;
            const dy = cy - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy) * Math.SQRT2;

            // Threshold based on distance (center = low threshold = more ink)
            const threshold = (dist - 0.5) * intensity * step;

            for (let c = 0; c < 3; c++) {
                const oldVal = input[idx + c] + threshold;
                const newVal = Math.round(oldVal / step) * step;
                output[idx + c] = Math.max(0, Math.min(255, newVal));
            }

            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }

    return output;
}

/**
 * Random/noise dithering
 */
export function randomDither(input, width, height, components, colorDepth, intensity) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);
    const noiseRange = step * intensity * 0.5;
    const rowSize = width * components;

    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        for (let x = 0; x < width; x++) {
            const idx = rowStart + x * components;
            for (let c = 0; c < 3; c++) {
                const noise = (Math.random() - 0.5) * 2 * noiseRange;
                const oldVal = input[idx + c] + noise;
                const newVal = Math.round(oldVal / step) * step;
                output[idx + c] = Math.max(0, Math.min(255, newVal));
            }
            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }

    return output;
}

// ============================================================
// PIXEL SCALING
// ============================================================

/**
 * Downscale image by factor using nearest-neighbor sampling
 */
export function downscalePixels(input, width, height, components, scale) {
    if (scale <= 1) return { pixels: input, width, height };

    const newW = Math.max(1, Math.floor(width / scale));
    const newH = Math.max(1, Math.floor(height / scale));
    const output = new Uint8Array(newW * newH * components);

    for (let y = 0; y < newH; y++) {
        const srcY = Math.floor(y * scale);
        for (let x = 0; x < newW; x++) {
            const srcX = Math.floor(x * scale);
            const srcIdx = (srcY * width + srcX) * components;
            const dstIdx = (y * newW + x) * components;
            for (let c = 0; c < components; c++) {
                output[dstIdx + c] = input[srcIdx + c];
            }
        }
    }

    return { pixels: output, width: newW, height: newH };
}

/**
 * Upscale image by factor using nearest-neighbor (crisp pixel art look)
 */
export function upscalePixels(input, width, height, components, scale, targetWidth, targetHeight) {
    if (scale <= 1) return input;

    const output = new Uint8Array(targetWidth * targetHeight * components);

    for (let y = 0; y < targetHeight; y++) {
        const srcY = Math.min(Math.floor(y / scale), height - 1);
        for (let x = 0; x < targetWidth; x++) {
            const srcX = Math.min(Math.floor(x / scale), width - 1);
            const srcIdx = (srcY * width + srcX) * components;
            const dstIdx = (y * targetWidth + x) * components;
            for (let c = 0; c < components; c++) {
                output[dstIdx + c] = input[srcIdx + c];
            }
        }
    }

    return output;
}

// ============================================================
// MAIN DISPATCHER
// ============================================================

/**
 * Main dither function - dispatches to appropriate algorithm
 */
export function applyDitherAlgorithm(pixelData, width, height, components, options) {
    const {
        algorithm = 'floyd-steinberg',
        colorDepth = 1,
        intensity = 1.0,
        pixelScale = 1,
        halftoneSize = 6
    } = options;

    let workPixels = pixelData;
    let workWidth = width;
    let workHeight = height;

    // Downscale if pixel scale > 1
    if (pixelScale > 1) {
        const scaled = downscalePixels(pixelData, width, height, components, pixelScale);
        workPixels = scaled.pixels;
        workWidth = scaled.width;
        workHeight = scaled.height;
    }

    // Apply dithering algorithm
    let result;
    switch (algorithm) {
        case 'none':
            result = noDither(workPixels, workWidth, workHeight, components, colorDepth);
            break;

        // Ordered dithering
        case 'bayer-2x2':
        case 'bayer-4x4':
        case 'bayer-8x8':
        case 'halftone-dot':
        case 'cluster':
        case 'crosshatch':
        case 'pattern-a':
        case 'pattern-b':
            const matrixMap = {
                'bayer-2x2': 'bayer-2x2', 'bayer-4x4': 'bayer-4x4', 'bayer-8x8': 'bayer-8x8',
                'halftone-dot': 'halftone', 'cluster': 'cluster', 'crosshatch': 'crosshatch',
                'pattern-a': 'pattern-a', 'pattern-b': 'pattern-b'
            };
            result = orderedDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, matrixMap[algorithm]);
            break;

        // Error diffusion
        case 'floyd-steinberg':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'floyd-steinberg');
            break;
        case 'floyd-steinberg-serpentine':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'floyd-steinberg', true);
            break;
        case 'jarvis':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'jarvis');
            break;
        case 'stucki':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'stucki');
            break;
        case 'burkes':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'burkes');
            break;
        case 'sierra':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'sierra');
            break;
        case 'sierra-two-row':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'sierra-two-row');
            break;
        case 'sierra-lite':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'sierra-lite');
            break;
        case 'atkinson':
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'atkinson');
            break;

        // Halftone
        case 'halftone-0':
            result = halftoneDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 0, halftoneSize);
            break;
        case 'halftone-22':
            result = halftoneDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 22.5, halftoneSize);
            break;
        case 'halftone-45':
            result = halftoneDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 45, halftoneSize);
            break;

        // Random
        case 'random':
            result = randomDither(workPixels, workWidth, workHeight, components, colorDepth, intensity);
            break;

        default:
            result = errorDiffusionDither(workPixels, workWidth, workHeight, components, colorDepth, intensity, 'floyd-steinberg');
            break;
    }

    // Upscale back to original dimensions if we downscaled
    if (pixelScale > 1) {
        result = upscalePixels(result, workWidth, workHeight, components, pixelScale, width, height);
    }

    return result;
}

// Algorithm metadata for UI
export const DITHER_ALGORITHMS = [
    { value: 'none', label: 'None (Quantize Only)', category: 'Basic' },

    { value: 'bayer-2x2', label: 'Bayer 2x2', category: 'Ordered' },
    { value: 'bayer-4x4', label: 'Bayer 4x4', category: 'Ordered' },
    { value: 'bayer-8x8', label: 'Bayer 8x8', category: 'Ordered' },
    { value: 'halftone-dot', label: 'Halftone Dot', category: 'Ordered' },
    { value: 'cluster', label: 'Cluster Dot', category: 'Ordered' },
    { value: 'crosshatch', label: 'Crosshatch', category: 'Ordered' },

    { value: 'floyd-steinberg', label: 'Floyd-Steinberg', category: 'Error Diffusion' },
    { value: 'floyd-steinberg-serpentine', label: 'Floyd-Steinberg (Serpentine)', category: 'Error Diffusion' },
    { value: 'jarvis', label: 'Jarvis-Judice-Ninke', category: 'Error Diffusion' },
    { value: 'stucki', label: 'Stucki', category: 'Error Diffusion' },
    { value: 'burkes', label: 'Burkes', category: 'Error Diffusion' },
    { value: 'atkinson', label: 'Atkinson', category: 'Error Diffusion' },
    { value: 'sierra', label: 'Sierra', category: 'Error Diffusion' },
    { value: 'sierra-two-row', label: 'Sierra Two-Row', category: 'Error Diffusion' },
    { value: 'sierra-lite', label: 'Sierra Lite', category: 'Error Diffusion' },

    { value: 'halftone-0', label: 'Halftone 0°', category: 'Halftone' },
    { value: 'halftone-22', label: 'Halftone 22.5°', category: 'Halftone' },
    { value: 'halftone-45', label: 'Halftone 45°', category: 'Halftone' },

    { value: 'pattern-a', label: 'Pattern A', category: 'Pattern' },
    { value: 'pattern-b', label: 'Pattern B', category: 'Pattern' },

    { value: 'random', label: 'Random Noise', category: 'Other' }
];
