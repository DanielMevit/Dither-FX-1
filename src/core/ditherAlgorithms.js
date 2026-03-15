/**
 * Dither Algorithms Module
 * Contains all dithering implementations optimized for typed arrays
 */

// Bayer matrices for ordered dithering
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

// Pattern matrices for pattern-based dithering
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

/**
 * No dithering - just quantizes to color levels
 */
export function noDither(input, width, height, components, colorDepth) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);
    
    for (let i = 0; i < input.length; i++) {
        // Preserve alpha channel
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            const quantized = Math.round(input[i] / step) * step;
            output[i] = Math.max(0, Math.min(255, quantized));
        }
    }
    
    return output;
}

/**
 * Ordered (Bayer) dithering with selectable matrix size
 */
export function orderedDither(input, width, height, components, colorDepth, intensity, matrixSize = 8) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);
    
    let matrix, size;
    switch (matrixSize) {
        case 2:
            matrix = BAYER_2x2;
            size = 2;
            break;
        case 4:
            matrix = BAYER_4x4;
            size = 4;
            break;
        case 8:
        default:
            matrix = BAYER_8x8;
            size = 8;
            break;
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
            
            // Preserve alpha
            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }
    
    return output;
}

/**
 * Floyd-Steinberg error diffusion dithering
 */
export function floydSteinbergDither(input, width, height, components, colorDepth, intensity) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const len = input.length;
    
    // Float32Array allows negative values during error diffusion
    const buffer = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        buffer[i] = input[i];
    }
    
    const rowSize = width * components;
    
    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        
        for (let x = 0; x < width; x++) {
            const idx = rowStart + x * components;
            
            // Process R, G, B (not alpha)
            for (let c = 0; c < 3; c++) {
                const i = idx + c;
                const oldVal = buffer[i];
                const newVal = Math.round(oldVal / step) * step;
                const error = (oldVal - newVal) * intensity;
                
                buffer[i] = newVal;
                
                // Floyd-Steinberg distribution: right (7/16), bottom-left (3/16), bottom (5/16), bottom-right (1/16)
                if (x + 1 < width) {
                    buffer[i + components] += error * 0.4375; // 7/16
                }
                if (y + 1 < height) {
                    const nextRow = i + rowSize;
                    if (x > 0) buffer[nextRow - components] += error * 0.1875; // 3/16
                    buffer[nextRow] += error * 0.3125; // 5/16
                    if (x + 1 < width) buffer[nextRow + components] += error * 0.0625; // 1/16
                }
            }
        }
    }
    
    // Convert back to Uint8Array with clamping
    const output = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i]; // Preserve original alpha
        } else {
            output[i] = Math.max(0, Math.min(255, Math.round(buffer[i])));
        }
    }
    
    return output;
}

/**
 * Atkinson dithering (lighter, more contrast preserving)
 */
export function atkinsonDither(input, width, height, components, colorDepth, intensity) {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const len = input.length;
    
    const buffer = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        buffer[i] = input[i];
    }
    
    const rowSize = width * components;
    const errorShare = intensity / 8; // Atkinson only diffuses 6/8 of error
    
    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        
        for (let x = 0; x < width; x++) {
            const idx = rowStart + x * components;
            
            for (let c = 0; c < 3; c++) {
                const i = idx + c;
                const oldVal = buffer[i];
                const newVal = Math.round(oldVal / step) * step;
                const error = (oldVal - newVal) * errorShare;
                
                buffer[i] = newVal;
                
                // Atkinson: spread to 6 neighbors (1/8 each, losing 2/8 for sharper result)
                if (x + 1 < width) buffer[i + components] += error;
                if (x + 2 < width) buffer[i + components * 2] += error;
                if (y + 1 < height) {
                    const nextRow = i + rowSize;
                    if (x > 0) buffer[nextRow - components] += error;
                    buffer[nextRow] += error;
                    if (x + 1 < width) buffer[nextRow + components] += error;
                }
                if (y + 2 < height) {
                    buffer[i + rowSize * 2] += error;
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
 * Pattern-based dithering
 */
export function patternDither(input, width, height, components, colorDepth, intensity, patternType = 'A') {
    const levels = Math.pow(2, colorDepth);
    const step = 255 / (levels - 1);
    const output = new Uint8Array(input.length);
    
    const matrix = patternType === 'B' ? PATTERN_B : PATTERN_A;
    const size = 8;
    
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

/**
 * Main dither function - dispatches to appropriate algorithm
 */
export function applyDitherAlgorithm(pixelData, width, height, components, options) {
    const {
        algorithm = 'floyd-steinberg',
        colorDepth = 2,
        intensity = 1.0
    } = options;

    switch (algorithm) {
        case 'none':
            return noDither(pixelData, width, height, components, colorDepth);
        
        case 'bayer-2x2':
            return orderedDither(pixelData, width, height, components, colorDepth, intensity, 2);
        
        case 'bayer-4x4':
            return orderedDither(pixelData, width, height, components, colorDepth, intensity, 4);
        
        case 'bayer-8x8':
            return orderedDither(pixelData, width, height, components, colorDepth, intensity, 8);
        
        case 'floyd-steinberg':
            return floydSteinbergDither(pixelData, width, height, components, colorDepth, intensity);
        
        case 'atkinson':
            return atkinsonDither(pixelData, width, height, components, colorDepth, intensity);
        
        case 'pattern-a':
            return patternDither(pixelData, width, height, components, colorDepth, intensity, 'A');
        
        case 'pattern-b':
            return patternDither(pixelData, width, height, components, colorDepth, intensity, 'B');
        
        case 'random':
            return randomDither(pixelData, width, height, components, colorDepth, intensity);
        
        default:
            return floydSteinbergDither(pixelData, width, height, components, colorDepth, intensity);
    }
}

// Algorithm metadata for UI
export const DITHER_ALGORITHMS = [
    { value: 'none', label: 'None (Quantize Only)', category: 'Basic' },
    { value: 'bayer-2x2', label: 'Bayer 2x2', category: 'Ordered' },
    { value: 'bayer-4x4', label: 'Bayer 4x4', category: 'Ordered' },
    { value: 'bayer-8x8', label: 'Bayer 8x8', category: 'Ordered' },
    { value: 'floyd-steinberg', label: 'Floyd-Steinberg', category: 'Error Diffusion' },
    { value: 'atkinson', label: 'Atkinson', category: 'Error Diffusion' },
    { value: 'pattern-a', label: 'Pattern Dither A', category: 'Pattern' },
    { value: 'pattern-b', label: 'Pattern Dither B', category: 'Pattern' },
    { value: 'random', label: 'Random Noise', category: 'Other' }
];
