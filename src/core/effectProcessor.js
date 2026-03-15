/**
 * Effect Processor Module
 * Orchestrates preprocessing, dithering, and color mapping pipeline
 */

import { applyPreprocessing } from './preprocessing.js';
import { applyDitherAlgorithm } from './ditherAlgorithms.js';
import { applyColorMapping, applyColorOverlay } from './colorMapping.js';
import {
    getLayerPixels,
    getFlattenedPixels,
    getSelectionPixels,
    putLayerPixels,
    setupDitherStructureInternal,
    validateLayer,
    revertToSnapshot,
    finalizeDither
} from '../ps/layerManager.js';

// Store processing state for real-time updates
let processingState = {
    isInitialized: false,
    originalPixels: null,
    ditheredLayerId: null,
    originalLayerId: null,
    originalLayerName: null,
    documentId: null,
    imageInfo: null,
    lastSettings: null
};

/**
 * Reset processing state
 */
export function resetProcessingState() {
    processingState = {
        isInitialized: false,
        originalPixels: null,
        ditheredLayerId: null,
        originalLayerId: null,
        originalLayerName: null,
        documentId: null,
        imageInfo: null,
        lastSettings: null
    };
}

/**
 * Check if effect is initialized for real-time updates
 */
export function isEffectInitialized() {
    return processingState.isInitialized;
}

/**
 * Get the full effect settings object
 */
export function getDefaultSettings() {
    return {
        // Target
        target: 'active-layer',
        
        // Preprocessing
        blur: 0,
        sharpenStrength: 0,
        sharpenRadius: 1,
        brightness: 0,
        contrast: 0,
        gamma: 1.0,
        noise: 0,
        grayscale: false,
        
        // Dithering
        algorithm: 'floyd-steinberg',
        colorDepth: 1,
        intensity: 1.0,
        pixelScale: 1,
        
        // Color mapping
        colorMode: 'none',
        shadowColor: '#000000',
        midtoneColor: '#808080',
        highlightColor: '#ffffff',
        shadowThreshold: 85,
        highlightThreshold: 170,
        palettePreset: 'grayscale-4',
        colorOverlay: 0
    };
}

/**
 * Process pixel data through the effect pipeline
 */
export function processPixels(pixels, width, height, components, settings) {
    const startTime = Date.now();

    console.log("[Dither] processPixels called:", width, "x", height, "components:", components, "total bytes:", pixels.length);
    console.log("[Dither] settings:", JSON.stringify({ algorithm: settings.algorithm, colorDepth: settings.colorDepth, intensity: settings.intensity }));

    // Sample first pixel before processing
    console.log("[Dither] Input pixel[0]:", pixels[0], pixels[1], pixels[2], components === 4 ? pixels[3] : "");

    // Step 1: Preprocessing
    let processed = applyPreprocessing(pixels, width, height, components, {
        blur: settings.blur,
        sharpenStrength: settings.sharpenStrength,
        sharpenRadius: settings.sharpenRadius,
        brightness: settings.brightness,
        contrast: settings.contrast,
        gamma: settings.gamma,
        noise: settings.noise,
        grayscale: settings.grayscale
    });

    // Step 2: Dithering
    processed = applyDitherAlgorithm(processed, width, height, components, {
        algorithm: settings.algorithm,
        colorDepth: settings.colorDepth,
        intensity: settings.intensity,
        pixelScale: settings.pixelScale || 1
    });

    // Sample first pixel after dithering
    console.log("[Dither] Output pixel[0]:", processed[0], processed[1], processed[2], components === 4 ? processed[3] : "");

    // Count how many pixels changed
    let changedCount = 0;
    const sampleSize = Math.min(pixels.length, 10000);
    for (let i = 0; i < sampleSize; i++) {
        if (processed[i] !== pixels[i]) changedCount++;
    }
    console.log("[Dither] Changed bytes in first", sampleSize, ":", changedCount, "(", Math.round(changedCount/sampleSize*100), "%)");

    // Step 3: Color mapping
    if (settings.colorMode && settings.colorMode !== 'none') {
        processed = applyColorMapping(processed, width, height, components, {
            mode: settings.colorMode,
            shadowColor: settings.shadowColor,
            midtoneColor: settings.midtoneColor,
            highlightColor: settings.highlightColor,
            shadowThreshold: settings.shadowThreshold,
            highlightThreshold: settings.highlightThreshold,
            palettePreset: settings.palettePreset
        });
    }

    // Step 4: Color overlay (blend original colors onto dithered output)
    if (settings.colorOverlay > 0) {
        processed = applyColorOverlay(processed, pixels, width, height, components, settings.colorOverlay);
    }

    console.log("[Dither] Processing time:", Date.now() - startTime, "ms");
    return processed;
}

/**
 * Initial apply - sets up structure and applies effect
 */
export async function initialApply(layer, settings, onProgress) {
    const photoshop = require("photoshop");
    const { app, core, action } = photoshop;
    
    if (!app.activeDocument) {
        throw new Error("No active document");
    }
    
    const validation = validateLayer(layer);
    if (!validation.valid) {
        throw new Error(validation.error);
    }
    
    onProgress?.("Setting up...");
    
    // Reset any previous state
    resetProcessingState();
    
    // Single executeAsModal for the entire operation
    await core.executeAsModal(async (executionContext) => {
        const doc = app.activeDocument;
        
        // Read pixels based on target setting
        onProgress?.("Reading pixels...");
        console.log("[Dither] Reading pixels, target:", settings.target, "layer:", layer.name, "id:", layer.id);
        let pixelData;
        switch (settings.target) {
            case 'flattened':
                pixelData = await getFlattenedPixels(action, app);
                break;
            case 'selection':
                pixelData = await getSelectionPixels(action, app, layer);
                break;
            case 'active-layer':
            default:
                pixelData = await getLayerPixels(layer);
                break;
        }
        console.log("[Dither] Got pixels:", pixelData.width, "x", pixelData.height, "components:", pixelData.components, "bytes:", pixelData.pixels.length);

        // Setup structure (creates dithered layer, hides original)
        onProgress?.("Creating layers...");
        const structure = await setupDitherStructureInternal(action, app, layer);
        console.log("[Dither] Dithered layer created, id:", structure.ditheredLayer.id, "name:", structure.ditheredLayer.name);

        // Store references
        processingState.documentId = doc.id;
        processingState.ditheredLayerId = structure.ditheredLayer.id;
        processingState.originalLayerId = structure.originalLayerId;
        processingState.originalLayerName = layer.name;
        
        // Store original pixels for future updates
        processingState.originalPixels = new Uint8Array(pixelData.pixels);
        processingState.imageInfo = {
            width: pixelData.width,
            height: pixelData.height,
            components: pixelData.components,
            colorSpace: pixelData.colorSpace,
            colorProfile: pixelData.colorProfile,
            bounds: pixelData.bounds
        };
        
        // Process pixels
        onProgress?.("Applying effect...");
        const processed = processPixels(
            processingState.originalPixels,
            pixelData.width,
            pixelData.height,
            pixelData.components,
            settings
        );
        
        // Write to dithered layer
        onProgress?.("Writing result...");
        await putLayerPixels(
            processingState.documentId,
            processingState.ditheredLayerId,
            processed,
            processingState.imageInfo
        );
        
        // Cleanup
        try {
            if (pixelData.imageData?.dispose) pixelData.imageData.dispose();
        } catch (e) { /* ignore */ }
        
        // Mark as initialized
        processingState.isInitialized = true;
        processingState.lastSettings = { ...settings };
        
    }, { commandName: "Apply Dither Effect" });
    
    return true;
}

/**
 * Update effect with new settings (real-time after initial apply)
 */
export async function updateEffect(settings, onProgress) {
    if (!processingState.isInitialized) {
        throw new Error("Effect not initialized. Please Apply first.");
    }
    
    if (!processingState.originalPixels) {
        throw new Error("No pixel data cached. Please Apply again.");
    }
    
    const photoshop = require("photoshop");
    const { app, core } = photoshop;
    
    // Verify document is still valid
    if (!app.activeDocument || app.activeDocument.id !== processingState.documentId) {
        resetProcessingState();
        throw new Error("Document changed. Please Apply again.");
    }
    
    await core.executeAsModal(async (executionContext) => {
        onProgress?.("Updating...");
        
        // Process from cached original pixels
        const processed = processPixels(
            processingState.originalPixels,
            processingState.imageInfo.width,
            processingState.imageInfo.height,
            processingState.imageInfo.components,
            settings
        );
        
        // Write to dithered layer
        await putLayerPixels(
            processingState.documentId,
            processingState.ditheredLayerId,
            processed,
            processingState.imageInfo
        );
        
        processingState.lastSettings = { ...settings };
        
    }, { commandName: "Update Dither" });
    
    return true;
}

/**
 * Commit effect - finalize and clean up (Done button)
 * Deletes hidden original layer, renames dithered layer, frees memory
 */
export async function commitEffect() {
    if (!processingState.isInitialized) {
        throw new Error("No effect to commit");
    }

    await finalizeDither(
        processingState.ditheredLayerId,
        processingState.originalLayerId
    );
    resetProcessingState();
}

/**
 * Reset effect - revert to snapshot
 */
export async function resetEffect() {
    await revertToSnapshot("Before Dither");
    resetProcessingState();
}

