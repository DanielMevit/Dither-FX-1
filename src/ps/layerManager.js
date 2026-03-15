/**
 * Photoshop Layer Management Module
 * Handles non-destructive workflow, layer groups, and history states
 */

const DITHERED_LAYER_SUFFIX = " (Dithered)";

/**
 * Get the Photoshop API modules
 */
function getPhotoshopAPI() {
    const photoshop = require("photoshop");
    return {
        app: photoshop.app,
        core: photoshop.core,
        imaging: photoshop.imaging,
        action: photoshop.action,
        constants: photoshop.constants
    };
}

/**
 * Validate that a layer can be processed
 */
export function validateLayer(layer) {
    if (!layer) {
        return { valid: false, error: "No layer selected" };
    }
    
    if (layer.kind === "smartObject") {
        return { valid: false, error: "Smart Object must be rasterized first" };
    }

    const unsupportedTypes = ["group", "adjustment", "text", "solidColor", "gradientFill", "patternFill"];

    if (unsupportedTypes.includes(layer.kind)) {
        return { valid: false, error: `Layer type "${layer.kind}" is not supported. Please rasterize first.` };
    }
    
    if (layer.allLocked || layer.pixelsLocked) {
        return { valid: false, error: "Layer pixels are locked. Please unlock first." };
    }
    
    const bounds = layer.bounds;
    if (!bounds) {
        return { valid: false, error: "Cannot read layer bounds" };
    }
    
    const width = Math.round(bounds.right - bounds.left);
    const height = Math.round(bounds.bottom - bounds.top);
    
    if (width <= 0 || height <= 0) {
        return { valid: false, error: "Layer appears to be empty" };
    }
    
    return { valid: true, width, height, bounds };
}

/**
 * Get pixel data from a layer - MUST be called within executeAsModal
 */
export async function getLayerPixels(layer) {
    const { imaging } = getPhotoshopAPI();
    const validation = validateLayer(layer);
    
    if (!validation.valid) {
        throw new Error(validation.error);
    }
    
    const { bounds } = validation;
    
    const getResult = await imaging.getPixels({
        layerID: layer.id,
        sourceBounds: {
            left: bounds.left,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom
        },
        colorSpace: "RGB"
    });
    
    if (!getResult?.imageData) {
        throw new Error("Failed to get pixels from layer");
    }
    
    const imageData = getResult.imageData;
    const pixelBuffer = await imageData.getData({ chunky: true });
    
    return {
        pixels: pixelBuffer,
        width: imageData.width,
        height: imageData.height,
        components: imageData.components,
        colorSpace: imageData.colorSpace || "RGB",
        colorProfile: imageData.colorProfile,
        bounds: bounds,
        imageData: imageData
    };
}

/**
 * Write pixel data back to a layer - MUST be called within executeAsModal
 */
export async function putLayerPixels(documentID, layerID, pixelData, imageInfo) {
    const { imaging } = getPhotoshopAPI();
    
    const newImageData = await imaging.createImageDataFromBuffer(
        pixelData,
        {
            width: imageInfo.width,
            height: imageInfo.height,
            components: imageInfo.components,
            colorSpace: imageInfo.colorSpace,
            colorProfile: imageInfo.colorProfile,
            chunky: true
        }
    );
    
    await imaging.putPixels({
        documentID: documentID,
        layerID: layerID,
        imageData: newImageData,
        targetBounds: { left: imageInfo.bounds.left, top: imageInfo.bounds.top },
        replace: true
    });
    
    // Cleanup
    try {
        if (newImageData.dispose) newImageData.dispose();
    } catch (e) { /* ignore */ }
}

/**
 * Create a history snapshot - MUST be called within executeAsModal
 */
export async function createSnapshotInternal(action, name = "Before Dither") {
    try {
        await action.batchPlay([
            {
                _obj: "make",
                _target: [{ _ref: "snapshotClass" }],
                from: { _ref: "historyState", _property: "currentHistoryState" },
                name: name,
                using: { _enum: "historyState", _value: "fullDocument" }
            }
        ], {});
        return true;
    } catch (error) {
        console.warn("Could not create snapshot:", error.message);
        return false;
    }
}

/**
 * Setup dither structure - MUST be called within executeAsModal
 * Returns the dithered layer for pixel manipulation
 */
export async function setupDitherStructureInternal(action, app, sourceLayer) {
    const doc = app.activeDocument;
    
    // Create snapshot first
    await createSnapshotInternal(action, "Before Dither");
    
    // Duplicate source layer to create the dithered layer
    await action.batchPlay([
        { _obj: "select", _target: [{ _ref: "layer", _id: sourceLayer.id }] },
        { 
            _obj: "duplicate", 
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], 
            name: sourceLayer.name + DITHERED_LAYER_SUFFIX 
        }
    ], {});
    
    // Get the duplicated layer (now selected)
    const ditheredLayer = doc.activeLayers[0];
    
    // Hide the original source layer
    await action.batchPlay([
        { _obj: "select", _target: [{ _ref: "layer", _id: sourceLayer.id }] },
        { _obj: "hide", null: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }
    ], {});
    
    // Select the dithered layer again
    await action.batchPlay([
        { _obj: "select", _target: [{ _ref: "layer", _id: ditheredLayer.id }] }
    ], {});
    
    return {
        ditheredLayer: ditheredLayer,
        originalLayerId: sourceLayer.id
    };
}

/**
 * Revert to snapshot - standalone function with own modal
 */
export async function revertToSnapshot(snapshotName = "Before Dither") {
    const { core, action, app } = getPhotoshopAPI();
    
    try {
        await core.executeAsModal(async () => {
            const doc = app.activeDocument;
            if (!doc) return;
            
            const historyStates = doc.historyStates;
            
            for (const state of historyStates) {
                if (state.name === snapshotName) {
                    await action.batchPlay([
                        {
                            _obj: "select",
                            _target: [{ _ref: "snapshotClass", _name: snapshotName }]
                        }
                    ], {});
                    return;
                }
            }
            
            // If no snapshot found, just undo
            await action.batchPlay([
                { _obj: "undo" }
            ], {});
        }, { commandName: "Revert to Snapshot" });
        
        return true;
    } catch (error) {
        console.error("Could not revert:", error.message);
        return false;
    }
}

export { DITHERED_LAYER_SUFFIX };
