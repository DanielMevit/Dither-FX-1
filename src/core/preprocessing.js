/**
 * Image Pre-processing Module
 * Blur, Sharpen, Brightness, Contrast, Noise adjustments
 */

/**
 * Apply Gaussian blur approximation using box blur
 * @param {Uint8Array} input - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components (3 or 4)
 * @param {number} radius - Blur radius (0-50)
 */
export function applyBlur(input, width, height, components, radius) {
    if (radius <= 0) return new Uint8Array(input);
    
    const output = new Uint8Array(input.length);
    const kernelSize = Math.max(1, Math.floor(radius));
    const rowSize = width * components;
    
    // Horizontal pass
    const temp = new Float32Array(input.length);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                let count = 0;
                
                for (let kx = -kernelSize; kx <= kernelSize; kx++) {
                    const nx = x + kx;
                    if (nx >= 0 && nx < width) {
                        sum += input[(y * width + nx) * components + c];
                        count++;
                    }
                }
                
                temp[idx + c] = sum / count;
            }
            
            if (components === 4) {
                temp[idx + 3] = input[idx + 3];
            }
        }
    }
    
    // Vertical pass
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                let count = 0;
                
                for (let ky = -kernelSize; ky <= kernelSize; ky++) {
                    const ny = y + ky;
                    if (ny >= 0 && ny < height) {
                        sum += temp[(ny * width + x) * components + c];
                        count++;
                    }
                }
                
                output[idx + c] = Math.max(0, Math.min(255, Math.round(sum / count)));
            }
            
            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }
    
    return output;
}

/**
 * Apply unsharp mask sharpening
 * @param {Uint8Array} input - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components
 * @param {number} strength - Sharpen strength (0-200)
 * @param {number} radius - Sharpen radius (0-100)
 */
export function applySharpen(input, width, height, components, strength, radius) {
    if (strength <= 0) return new Uint8Array(input);
    
    // Create blurred version
    const blurred = applyBlur(input, width, height, components, Math.max(1, radius * 0.5));
    const output = new Uint8Array(input.length);
    const factor = strength / 100;
    
    for (let i = 0; i < input.length; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i]; // Preserve alpha
        } else {
            // Unsharp mask: original + factor * (original - blurred)
            const diff = input[i] - blurred[i];
            const sharpened = input[i] + diff * factor;
            output[i] = Math.max(0, Math.min(255, Math.round(sharpened)));
        }
    }
    
    return output;
}

/**
 * Adjust brightness
 * @param {Uint8Array} input - Pixel data
 * @param {number} components - Color components
 * @param {number} brightness - Brightness adjustment (-150 to 150)
 */
export function applyBrightness(input, components, brightness) {
    if (brightness === 0) return new Uint8Array(input);
    
    const output = new Uint8Array(input.length);
    
    for (let i = 0; i < input.length; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            output[i] = Math.max(0, Math.min(255, input[i] + brightness));
        }
    }
    
    return output;
}

/**
 * Adjust contrast
 * @param {Uint8Array} input - Pixel data
 * @param {number} components - Color components
 * @param {number} contrast - Contrast adjustment (-50 to 100)
 */
export function applyContrast(input, components, contrast) {
    if (contrast === 0) return new Uint8Array(input);
    
    const output = new Uint8Array(input.length);
    // Convert contrast to factor: -50 maps to 0.5, 0 maps to 1, 100 maps to 2
    const factor = (contrast + 100) / 100;
    
    for (let i = 0; i < input.length; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            // Apply contrast around midpoint (128)
            const adjusted = ((input[i] - 128) * factor) + 128;
            output[i] = Math.max(0, Math.min(255, Math.round(adjusted)));
        }
    }
    
    return output;
}

/**
 * Add noise to image
 * @param {Uint8Array} input - Pixel data
 * @param {number} components - Color components
 * @param {number} amount - Noise amount (0-50)
 */
export function applyNoise(input, components, amount) {
    if (amount <= 0) return new Uint8Array(input);
    
    const output = new Uint8Array(input.length);
    const noiseRange = amount * 2.55; // Scale to 0-127.5 range
    
    for (let i = 0; i < input.length; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            const noise = (Math.random() - 0.5) * 2 * noiseRange;
            output[i] = Math.max(0, Math.min(255, Math.round(input[i] + noise)));
        }
    }
    
    return output;
}

/**
 * Convert to grayscale
 * @param {Uint8Array} input - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components
 */
export function toGrayscale(input, width, height, components) {
    const output = new Uint8Array(input.length);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            
            // Luminance formula (Rec. 709)
            const gray = Math.round(
                input[idx] * 0.2126 +
                input[idx + 1] * 0.7152 +
                input[idx + 2] * 0.0722
            );
            
            output[idx] = gray;
            output[idx + 1] = gray;
            output[idx + 2] = gray;
            
            if (components === 4) {
                output[idx + 3] = input[idx + 3];
            }
        }
    }
    
    return output;
}

/**
 * Apply gamma correction
 * @param {Uint8Array} input - Pixel data
 * @param {number} components - Color components
 * @param {number} gamma - Gamma value (0.2-3.0, 1.0 = no change)
 */
export function applyGamma(input, components, gamma) {
    if (gamma === 1.0) return new Uint8Array(input);

    const output = new Uint8Array(input.length);
    const invGamma = 1.0 / gamma;

    // Build lookup table for speed
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        lut[i] = Math.max(0, Math.min(255, Math.round(255 * Math.pow(i / 255, invGamma))));
    }

    for (let i = 0; i < input.length; i++) {
        if (components === 4 && (i % 4) === 3) {
            output[i] = input[i];
        } else {
            output[i] = lut[input[i]];
        }
    }

    return output;
}

/**
 * Apply all preprocessing in optimal order
 * @param {Uint8Array} input - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components
 * @param {Object} options - Preprocessing options
 */
export function applyPreprocessing(input, width, height, components, options) {
    const {
        blur = 0,
        sharpenStrength = 0,
        sharpenRadius = 1,
        brightness = 0,
        contrast = 0,
        gamma = 1.0,
        noise = 0,
        grayscale = false
    } = options;

    let result = input;

    // Order: blur -> sharpen -> brightness -> contrast -> gamma -> noise -> grayscale
    if (blur > 0) {
        result = applyBlur(result, width, height, components, blur);
    }

    if (sharpenStrength > 0) {
        result = applySharpen(result, width, height, components, sharpenStrength, sharpenRadius);
    }

    if (brightness !== 0) {
        result = applyBrightness(result, components, brightness);
    }

    if (contrast !== 0) {
        result = applyContrast(result, components, contrast);
    }

    if (gamma !== 1.0) {
        result = applyGamma(result, components, gamma);
    }

    if (noise > 0) {
        result = applyNoise(result, components, noise);
    }

    if (grayscale) {
        result = toGrayscale(result, width, height, components);
    }

    return result;
}
