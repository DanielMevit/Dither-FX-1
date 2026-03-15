/**
 * Post-Processing Effects Module
 * CRT/Glow simulation and Chromatic Aberration
 */

/**
 * Sample a single channel from pixel data with clamped bounds
 */
function sampleChannel(data, width, height, components, x, y, channel) {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    return data[(cy * width + cx) * components + channel];
}

/**
 * Apply CRT/retro display simulation
 * @param {Uint8Array} input - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components (3 or 4)
 * @param {Object} options - CRT options
 */
export function applyCRTEffect(input, width, height, components, options) {
    const {
        scanlineIntensity = 30,
        scanlineWidth = 2,
        bloomStrength = 0,
        bloomRadius = 3,
        phosphorGlow = 0,
        vignetteStrength = 0
    } = options;

    // Ensure we have a mutable copy (UXP may share buffer with new Uint8Array())
    let result = input.slice(0);

    // 1. Phosphor glow — sub-pixel RGB channel separation
    if (phosphorGlow > 0) {
        const glowResult = new Uint8Array(result.length);
        const shift = phosphorGlow / 100; // 0-1 pixel shift

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * components;
                // Shift R left, B right, G stays
                glowResult[idx] = sampleChannel(result, width, height, components, x - shift, y, 0);
                glowResult[idx + 1] = result[idx + 1];
                glowResult[idx + 2] = sampleChannel(result, width, height, components, x + shift, y, 2);
                if (components === 4) glowResult[idx + 3] = result[idx + 3];
            }
        }
        result = glowResult;
    }

    // 2. Scanlines — darken every Nth row
    if (scanlineIntensity > 0) {
        const darkFactor = 1 - (scanlineIntensity / 100);
        const lineWidth = Math.max(1, scanlineWidth);

        for (let y = 0; y < height; y++) {
            // Darken if this row falls on a scanline gap
            if ((y % (lineWidth * 2)) >= lineWidth) {
                const rowStart = y * width * components;
                for (let x = 0; x < width; x++) {
                    const idx = rowStart + x * components;
                    result[idx] = Math.round(result[idx] * darkFactor);
                    result[idx + 1] = Math.round(result[idx + 1] * darkFactor);
                    result[idx + 2] = Math.round(result[idx + 2] * darkFactor);
                }
            }
        }
    }

    // 3. Bloom — bright pixels bleed light to neighbors
    if (bloomStrength > 0) {
        const bloomFactor = bloomStrength / 100;
        const radius = Math.max(1, Math.min(10, bloomRadius));

        // Create brightness mask
        const brightMask = new Float32Array(width * height);
        const threshold = 180;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * components;
                const lum = 0.2126 * result[idx] + 0.7152 * result[idx + 1] + 0.0722 * result[idx + 2];
                brightMask[y * width + x] = lum > threshold ? (lum - threshold) / (255 - threshold) : 0;
            }
        }

        // Box blur the brightness mask (horizontal then vertical)
        const temp = new Float32Array(brightMask.length);
        // Horizontal
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0, count = 0;
                for (let kx = -radius; kx <= radius; kx++) {
                    const nx = x + kx;
                    if (nx >= 0 && nx < width) {
                        sum += brightMask[y * width + nx];
                        count++;
                    }
                }
                temp[y * width + x] = sum / count;
            }
        }
        // Vertical
        const blurred = new Float32Array(brightMask.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0, count = 0;
                for (let ky = -radius; ky <= radius; ky++) {
                    const ny = y + ky;
                    if (ny >= 0 && ny < height) {
                        sum += temp[ny * width + x];
                        count++;
                    }
                }
                blurred[y * width + x] = sum / count;
            }
        }

        // Screen-blend bloom back onto image
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * components;
                const bloom = blurred[y * width + x] * bloomFactor * 255;
                for (let c = 0; c < 3; c++) {
                    // Screen blend: 1 - (1-a)(1-b)
                    const a = result[idx + c] / 255;
                    const b = bloom / 255;
                    result[idx + c] = Math.min(255, Math.round((1 - (1 - a) * (1 - b)) * 255));
                }
            }
        }
    }

    // 4. Vignette — darken corners
    if (vignetteStrength > 0) {
        const cx = width / 2;
        const cy = height / 2;
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        const strength = vignetteStrength / 100;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dx = (x - cx) / cx;
                const dy = (y - cy) / cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const vignette = 1 - dist * dist * strength * 0.5;
                const factor = Math.max(0, Math.min(1, vignette));

                const idx = (y * width + x) * components;
                result[idx] = Math.round(result[idx] * factor);
                result[idx + 1] = Math.round(result[idx + 1] * factor);
                result[idx + 2] = Math.round(result[idx + 2] * factor);
            }
        }
    }

    return result;
}

/**
 * Apply chromatic aberration — shift R/G/B channels in different directions
 * @param {Uint8Array} input - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components
 * @param {Object} options - { strength: 0-20, angle: 0-360 }
 */
export function applyChromaticAberration(input, width, height, components, options) {
    const { strength = 5, angle = 0 } = options;
    if (strength <= 0) return input.slice(0);

    const output = new Uint8Array(input.length);
    const rad = angle * Math.PI / 180;
    const offsetX = Math.cos(rad) * strength;
    const offsetY = Math.sin(rad) * strength;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;

            // Red: shift in +offset direction
            output[idx] = sampleChannel(input, width, height, components, x + offsetX, y + offsetY, 0);
            // Green: stays at original position
            output[idx + 1] = input[idx + 1];
            // Blue: shift in -offset direction
            output[idx + 2] = sampleChannel(input, width, height, components, x - offsetX, y - offsetY, 2);

            if (components === 4) output[idx + 3] = input[idx + 3];
        }
    }

    return output;
}
