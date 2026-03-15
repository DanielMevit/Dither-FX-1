import React, { useState, useRef, useEffect, useCallback } from "react";
import "./DitherEffect.css";
import {
    initialApply,
    updateEffect,
    resetEffect,
    commitEffect,
    batchApply,
    isEffectInitialized,
    getDefaultSettings
} from "../core/effectProcessor.js";
import { getPresetList, loadPreset, savePreset, deletePreset } from "../core/presetManager.js";
import { extractPaletteFromPixels } from "../utils/paletteExtractor.js";
import { traceToVectorPaths } from "../utils/vectorTracer.js";
import { getLayerPixels, createVectorPath } from "../ps/layerManager.js";

/**
 * Hook to wire up sp-picker change events via direct DOM addEventListener.
 * React's synthetic onChange/onInput do NOT fire for UXP sp-picker web components.
 */
function usePickerRef(callback) {
    const ref = useRef(null);
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const handler = (e) => {
            callbackRef.current(e.target.value);
        };
        el.addEventListener('change', handler);
        return () => el.removeEventListener('change', handler);
    }, []);

    return ref;
}

const SETTINGS_STORAGE_KEY = 'dither-fx-settings';

/**
 * Load saved settings from localStorage, merging with defaults
 */
function loadSavedSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...getDefaultSettings(), ...parsed };
        }
    } catch (e) {
        console.warn("[Dither] Could not load saved settings:", e.message);
    }
    return getDefaultSettings();
}

/**
 * Save current settings to localStorage
 */
function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn("[Dither] Could not save settings:", e.message);
    }
}

export const DitherEffect = () => {
    // State — load saved settings on mount
    const [settings, setSettings] = useState(loadSavedSettings);
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState({ type: 'ready', message: 'Ready' });
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [saveInputValue, setSaveInputValue] = useState('');

    // Refs to avoid stale closures
    const settingsRef = useRef(settings);
    const isProcessingRef = useRef(false);
    const isLiveModeRef = useRef(false);
    const debounceTimerRef = useRef(null);
    const initialApplyDoneRef = useRef(false);
    const abortRef = useRef({ aborted: false });

    // Keep refs in sync
    settingsRef.current = settings;
    isLiveModeRef.current = isLiveMode;

    // Update setting helper
    const updateSetting = useCallback((key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);

    // Hex color update with validation
    const updateColorSetting = useCallback((key, value) => {
        if (/^#[a-f\d]{6}$/i.test(value)) {
            updateSetting(key, value);
        }
    }, [updateSetting]);

    // Picker refs — direct DOM event listeners for sp-picker
    const targetPickerRef = usePickerRef((value) => updateSetting('target', value));
    const algorithmPickerRef = usePickerRef((value) => updateSetting('algorithm', value));
    const colorModePickerRef = usePickerRef((value) => updateSetting('colorMode', value));
    const palettePickerRef = usePickerRef((value) => updateSetting('palettePreset', value));
    const presetPickerRef = usePickerRef((value) => {
        if (value === '__none__') {
            setSettings(getDefaultSettings());
            setStatus({ type: 'success', message: 'Preset cleared' });
            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 1500);
            return;
        }
        const presetSettings = loadPreset(value);
        if (presetSettings) {
            setSettings(prev => ({ ...prev, ...presetSettings }));
            setStatus({ type: 'success', message: 'Preset loaded' });
            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 1500);
        }
    });

    // Live update handler - uses refs to avoid dependency issues
    const handleLiveUpdate = useCallback(async () => {
        // Guard against concurrent execution using ref
        if (isProcessingRef.current) {
            console.log("Already processing, skipping live update");
            return;
        }

        if (!isEffectInitialized()) {
            console.log("Not initialized, skipping live update");
            return;
        }

        if (!isLiveModeRef.current) {
            console.log("Not in live mode, skipping");
            return;
        }

        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Live updating...' });

            await updateEffect(settingsRef.current, (msg) => {
                setStatus({ type: 'processing', message: msg });
            });

            setStatus({ type: 'success', message: 'Updated' });
            setTimeout(() => {
                if (isLiveModeRef.current) {
                    setStatus({ type: 'ready', message: 'Live mode active' });
                }
            }, 500);
        } catch (error) {
            console.error("Live update error:", error);
            setStatus({ type: 'error', message: error.message });
            if (error.message.includes("Document changed") || error.message.includes("not initialized")) {
                setIsLiveMode(false);
                isLiveModeRef.current = false;
            }
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    }, []); // No dependencies - uses refs

    // Debounced live update
    const triggerLiveUpdate = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            handleLiveUpdate();
        }, 200); // 200ms debounce
    }, [handleLiveUpdate]);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // Auto-save settings whenever they change
    useEffect(() => {
        saveSettings(settings);
    }, [settings]);

    // Effect to trigger live updates when settings change
    useEffect(() => {
        // Only trigger if we've already done the initial apply
        if (initialApplyDoneRef.current && isLiveMode && isEffectInitialized()) {
            triggerLiveUpdate();
        }
    }, [settings, isLiveMode, triggerLiveUpdate]);

    // Apply button handler
    const handleApply = async () => {
        if (isProcessingRef.current) {
            console.log("Already processing, ignoring apply");
            return;
        }

        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Applying dither effect...' });

            const photoshop = require("photoshop");
            const { app } = photoshop;

            if (!app.activeDocument) {
                throw new Error("No active document. Please open an image first.");
            }

            const doc = app.activeDocument;
            const activeLayer = doc.activeLayers?.[0] || doc.activeLayer;

            if (!activeLayer) {
                throw new Error("No layer selected. Please select a layer.");
            }

            await initialApply(activeLayer, settings, (msg) => {
                setStatus({ type: 'processing', message: msg });
            });

            // Mark initial apply as done BEFORE setting live mode
            initialApplyDoneRef.current = true;
            isLiveModeRef.current = true;
            setIsLiveMode(true);
            setStatus({ type: 'success', message: 'Effect applied! Live mode active.' });

        } catch (error) {
            console.error("Apply error:", error);
            setStatus({ type: 'error', message: error.message });
            setIsLiveMode(false);
            isLiveModeRef.current = false;
            initialApplyDoneRef.current = false;
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    // Done button handler - finalize and clean up
    const handleDone = async () => {
        if (isProcessingRef.current) return;

        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Finalizing...' });

            // Clear debounce timer
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }

            await commitEffect();

            // Reset UI state
            isLiveModeRef.current = false;
            initialApplyDoneRef.current = false;
            setIsLiveMode(false);
            setSettings(getDefaultSettings());
            setStatus({ type: 'success', message: 'Effect committed' });

            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 2000);
        } catch (error) {
            console.error("Done error:", error);
            setStatus({ type: 'error', message: error.message });
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    // Reset button handler
    const handleReset = async () => {
        if (isProcessingRef.current) return;

        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Reverting...' });

            // Clear debounce timer
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }

            await resetEffect();

            // Reset all state
            isLiveModeRef.current = false;
            initialApplyDoneRef.current = false;
            setIsLiveMode(false);
            setSettings(getDefaultSettings());
            setStatus({ type: 'success', message: 'Reset to original' });

            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 2000);
        } catch (error) {
            console.error("Reset error:", error);
            setStatus({ type: 'error', message: error.message });
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    // Batch apply handler
    const handleBatchApply = async () => {
        if (isProcessingRef.current) return;
        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Batch processing...' });

            await batchApply(settings, (msg) => {
                setStatus({ type: 'processing', message: msg });
            });

            setStatus({ type: 'success', message: 'Batch complete!' });
            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 3000);
        } catch (error) {
            console.error("Batch error:", error);
            setStatus({ type: 'error', message: error.message });
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    // Extract palette from active layer
    const handleExtractPalette = async () => {
        if (isProcessingRef.current) return;
        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Extracting palette...' });

            const photoshop = require("photoshop");
            const { app, core } = photoshop;
            const doc = app.activeDocument;
            if (!doc) throw new Error("No active document");

            const layer = doc.activeLayers?.[0] || doc.activeLayer;
            if (!layer) throw new Error("No layer selected");

            let pixelData;
            await core.executeAsModal(async () => {
                pixelData = await getLayerPixels(layer);
            }, { commandName: "Extract Palette" });

            const colors = extractPaletteFromPixels(
                pixelData.pixels, pixelData.width, pixelData.height,
                pixelData.components, settings.paletteColorCount || 8
            );

            try {
                if (pixelData.imageData?.dispose) pixelData.imageData.dispose();
            } catch (e) { /* ignore */ }

            setSettings(prev => ({
                ...prev,
                customPalette: colors,
                colorMode: 'palette',
                palettePreset: 'custom'
            }));

            setStatus({ type: 'success', message: `Extracted ${colors.length} colors` });
            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 2000);
        } catch (error) {
            console.error("Extract palette error:", error);
            setStatus({ type: 'error', message: error.message });
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    // Cancel any running operation
    const handleCancel = useCallback(() => {
        abortRef.current.aborted = true;
        // Clear debounce timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        isProcessingRef.current = false;
        setIsProcessing(false);
        setStatus({ type: 'ready', message: 'Cancelled' });
        setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 1500);
    }, []);

    // Create vector path from current dithered output
    const handleCreateVectorPath = async () => {
        if (isProcessingRef.current) return;
        // Reset abort signal
        abortRef.current = { aborted: false };
        try {
            isProcessingRef.current = true;
            setIsProcessing(true);
            setStatus({ type: 'processing', message: 'Reading pixels...' });

            const photoshop = require("photoshop");
            const { app, core } = photoshop;
            const doc = app.activeDocument;
            if (!doc) throw new Error("No active document");

            const layer = doc.activeLayers?.[0] || doc.activeLayer;
            if (!layer) throw new Error("No layer selected");

            let pixelData;
            await core.executeAsModal(async () => {
                pixelData = await getLayerPixels(layer);
            }, { commandName: "Read for Vector Trace" });

            if (abortRef.current.aborted) return;

            console.log(`[Vector] Tracing ${pixelData.width}x${pixelData.height} image...`);
            setStatus({ type: 'processing', message: `Tracing ${pixelData.width}x${pixelData.height}...` });

            const paths = traceToVectorPaths(
                pixelData.pixels, pixelData.width, pixelData.height,
                pixelData.components, 128, settings.vectorSimplify || 2.0,
                abortRef.current
            );

            try {
                if (pixelData.imageData?.dispose) pixelData.imageData.dispose();
            } catch (e) { /* ignore */ }

            if (abortRef.current.aborted) return;

            if (paths.length === 0) {
                setStatus({ type: 'error', message: 'No contours found' });
                return;
            }

            const totalPoints = paths.reduce((sum, p) => sum + p.points.length, 0);
            console.log(`[Vector] Found ${paths.length} contours, ${totalPoints} total points`);
            setStatus({ type: 'processing', message: `Creating path (${paths.length} contours, ${totalPoints} pts)...` });

            await createVectorPath(paths, "Dithered Path");

            if (abortRef.current.aborted) return;

            setStatus({ type: 'success', message: `Created path with ${paths.length} contours` });
            setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 3000);
        } catch (error) {
            if (abortRef.current.aborted) return;
            console.error("Vector path error:", error);
            setStatus({ type: 'error', message: error.message });
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    // Save preset handler
    const handleSavePreset = () => {
        const name = saveInputValue.trim();
        if (!name) return;
        savePreset(name, settings);
        setShowSaveInput(false);
        setSaveInputValue('');
        setStatus({ type: 'success', message: `Preset "${name}" saved` });
        setTimeout(() => setStatus({ type: 'ready', message: 'Ready' }), 1500);
    };

    // Helper: list of error diffusion algorithms for conditional UI
    const ERROR_DIFFUSION_ALGOS = [
        'floyd-steinberg', 'floyd-steinberg-serpentine', 'jarvis', 'stucki', 'burkes',
        'sierra', 'sierra-two-row', 'sierra-lite', 'atkinson',
        'stevenson-arce', 'fan', 'shiau-fan', 'shiau-fan-2'
    ];

    // Get status class
    const getStatusClass = () => {
        switch (status.type) {
            case 'error': return 'status-error';
            case 'success': return 'status-success';
            case 'processing': return 'status-processing';
            default: return 'status-ready';
        }
    };

    return (
        <div className="dither-panel">
            {/* Header */}
            <div className="panel-header">
                <sp-heading size="S">Dither Effect</sp-heading>
                {isLiveMode && <span className="live-badge">LIVE</span>}
            </div>

            {/* Status Bar */}
            <div className={`status-bar ${getStatusClass()}`}>
                <sp-body size="XS">{status.message}</sp-body>
            </div>

            <div className="panel-content">
                {/* Presets */}
                <div className="section">
                    <div className="section-header-inline">
                        <sp-body size="S" className="section-title">Preset</sp-body>
                        <sp-picker ref={presetPickerRef} size="s" value="__none__">
                            <sp-menu slot="options">
                                <sp-menu-item value="__none__">None</sp-menu-item>
                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">BUILT-IN</sp-label>
                                {Object.entries(getPresetList()).filter(([, p]) => p.builtIn).map(([id, p]) => (
                                    <sp-menu-item key={id} value={id}>{p.name}</sp-menu-item>
                                ))}
                                {Object.entries(getPresetList()).some(([, p]) => !p.builtIn) && (
                                    <>
                                        <sp-divider size="small"></sp-divider>
                                        <sp-label className="dropdown-category">USER PRESETS</sp-label>
                                        {Object.entries(getPresetList()).filter(([, p]) => !p.builtIn).map(([id, p]) => (
                                            <sp-menu-item key={id} value={id}>{p.name}</sp-menu-item>
                                        ))}
                                    </>
                                )}
                            </sp-menu>
                        </sp-picker>
                    </div>
                    <div className="control-row preset-actions">
                        {showSaveInput ? (
                            <div className="preset-save-row">
                                <sp-textfield
                                    size="s"
                                    placeholder="Preset name"
                                    value={saveInputValue}
                                    onInput={(e) => setSaveInputValue(e.target.value)}
                                ></sp-textfield>
                                <sp-button size="s" variant="primary" onClick={handleSavePreset}>Save</sp-button>
                                <sp-button size="s" variant="secondary" onClick={() => setShowSaveInput(false)}>Cancel</sp-button>
                            </div>
                        ) : (
                            <sp-button size="s" variant="secondary" onClick={() => setShowSaveInput(true)}>
                                Save Current as Preset
                            </sp-button>
                        )}
                    </div>
                </div>

                {/* Target Selection */}
                <div className="section">
                    <div className="section-header-inline">
                        <sp-body size="S" className="section-title">Target</sp-body>
                        <sp-picker
                            ref={targetPickerRef}
                            size="s"
                            value={settings.target}
                        >
                            <sp-menu slot="options">
                                <sp-menu-item value="active-layer">Active Layer</sp-menu-item>
                                <sp-menu-item value="flattened">Flattened Document</sp-menu-item>
                                <sp-menu-item value="selection">Selection Only</sp-menu-item>
                            </sp-menu>
                        </sp-picker>
                    </div>
                    <div className="control-row checkbox-row">
                        <sp-checkbox
                            checked={settings.maskMode ? true : undefined}
                            onInput={(e) => updateSetting('maskMode', e.target.checked)}
                        >
                            Mask mode
                        </sp-checkbox>
                    </div>
                    {settings.maskMode && (
                        <div className="control-row slider-row">
                            <sp-label size="S">Feather: {settings.maskFeather || 0}px</sp-label>
                            <sp-slider
                                min="0"
                                max="50"
                                value={settings.maskFeather || 0}
                                onInput={(e) => updateSetting('maskFeather', parseInt(e.target.value))}
                            ></sp-slider>
                        </div>
                    )}
                </div>

                {/* Dither Settings */}
                <div className="section">
                    <div className="section-header-inline">
                        <sp-body size="S" className="section-title">Algorithm</sp-body>
                        <sp-picker
                            ref={algorithmPickerRef}
                            size="s"
                            value={settings.algorithm}
                        >
                            <sp-menu slot="options">
                                <sp-label className="dropdown-category">BASIC</sp-label>
                                <sp-menu-item value="none">None (Quantize Only)</sp-menu-item>

                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">ORDERED</sp-label>
                                <sp-menu-item value="bayer-2x2">Bayer 2x2</sp-menu-item>
                                <sp-menu-item value="bayer-4x4">Bayer 4x4</sp-menu-item>
                                <sp-menu-item value="bayer-8x8">Bayer 8x8</sp-menu-item>
                                <sp-menu-item value="halftone-dot">Halftone Dot</sp-menu-item>
                                <sp-menu-item value="cluster">Cluster Dot</sp-menu-item>
                                <sp-menu-item value="crosshatch">Crosshatch</sp-menu-item>
                                <sp-menu-item value="blue-noise">Blue Noise 16x16</sp-menu-item>
                                <sp-menu-item value="checkerboard">Checkerboard</sp-menu-item>
                                <sp-menu-item value="hlines">Horizontal Lines</sp-menu-item>
                                <sp-menu-item value="diagonal">Diagonal Lines</sp-menu-item>

                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">ERROR DIFFUSION</sp-label>
                                <sp-menu-item value="floyd-steinberg">Floyd-Steinberg</sp-menu-item>
                                <sp-menu-item value="floyd-steinberg-serpentine">Floyd-Steinberg (Serpentine)</sp-menu-item>
                                <sp-menu-item value="jarvis">Jarvis-Judice-Ninke</sp-menu-item>
                                <sp-menu-item value="stucki">Stucki</sp-menu-item>
                                <sp-menu-item value="burkes">Burkes</sp-menu-item>
                                <sp-menu-item value="atkinson">Atkinson</sp-menu-item>
                                <sp-menu-item value="sierra">Sierra</sp-menu-item>
                                <sp-menu-item value="sierra-two-row">Sierra Two-Row</sp-menu-item>
                                <sp-menu-item value="sierra-lite">Sierra Lite</sp-menu-item>
                                <sp-menu-item value="stevenson-arce">Stevenson-Arce</sp-menu-item>
                                <sp-menu-item value="fan">Fan</sp-menu-item>
                                <sp-menu-item value="shiau-fan">Shiau-Fan</sp-menu-item>
                                <sp-menu-item value="shiau-fan-2">Shiau-Fan (Two-Row)</sp-menu-item>

                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">HALFTONE</sp-label>
                                <sp-menu-item value="halftone-0">Halftone 0°</sp-menu-item>
                                <sp-menu-item value="halftone-22">Halftone 22.5°</sp-menu-item>
                                <sp-menu-item value="halftone-45">Halftone 45°</sp-menu-item>

                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">PATTERN</sp-label>
                                <sp-menu-item value="pattern-a">Pattern A</sp-menu-item>
                                <sp-menu-item value="pattern-b">Pattern B</sp-menu-item>

                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">ARTISTIC</sp-label>
                                <sp-menu-item value="knit">Knit Stitch</sp-menu-item>
                                <sp-menu-item value="circuit">Circuit Board</sp-menu-item>
                                <sp-menu-item value="star">Star Burst</sp-menu-item>
                                <sp-menu-item value="cyber">Cyber Scanline</sp-menu-item>
                                <sp-menu-item value="diamond">Diamond</sp-menu-item>

                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">OTHER</sp-label>
                                <sp-menu-item value="random">Random Noise</sp-menu-item>
                            </sp-menu>
                        </sp-picker>
                    </div>
                    <div className="control-row slider-row">
                        <sp-label size="S">Depth: {settings.colorDepth}bit ({Math.pow(2, settings.colorDepth)} lvl)</sp-label>
                        <sp-slider
                            min="1"
                            max="6"
                            value={settings.colorDepth}
                            onInput={(e) => updateSetting('colorDepth', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Intensity: {Math.round(settings.intensity * 100)}%</sp-label>
                        <sp-slider
                            min="0"
                            max="200"
                            value={settings.intensity * 100}
                            onInput={(e) => updateSetting('intensity', parseInt(e.target.value) / 100)}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Pixel Scale: {settings.pixelScale}x</sp-label>
                        <sp-slider
                            min="1"
                            max="32"
                            value={settings.pixelScale}
                            onInput={(e) => updateSetting('pixelScale', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    {ERROR_DIFFUSION_ALGOS.includes(settings.algorithm) && (
                        <div className="control-row slider-row">
                            <sp-label size="S">Error Spread: {Math.round((settings.spread ?? 1.0) * 100)}%</sp-label>
                            <sp-slider
                                min="0"
                                max="200"
                                value={Math.round((settings.spread ?? 1.0) * 100)}
                                onInput={(e) => updateSetting('spread', parseInt(e.target.value) / 100)}
                            ></sp-slider>
                        </div>
                    )}

                    {(settings.algorithm === 'halftone-0' || settings.algorithm === 'halftone-22' || settings.algorithm === 'halftone-45') && (
                        <div className="control-row slider-row">
                            <sp-label size="S">Dot Size: {settings.halftoneSize || 6}px</sp-label>
                            <sp-slider
                                min="2"
                                max="20"
                                value={settings.halftoneSize || 6}
                                onInput={(e) => updateSetting('halftoneSize', parseInt(e.target.value))}
                            ></sp-slider>
                        </div>
                    )}

                    <div className="control-row checkbox-row">
                        <sp-checkbox
                            checked={settings.invert ? true : undefined}
                            onInput={(e) => updateSetting('invert', e.target.checked)}
                        >
                            Invert Output
                        </sp-checkbox>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Transparency Skip: {settings.transparencyThreshold || 0}</sp-label>
                        <sp-slider
                            min="0"
                            max="255"
                            value={settings.transparencyThreshold || 0}
                            onInput={(e) => updateSetting('transparencyThreshold', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>
                </div>

                {/* Pre-processing */}
                <div className="section">
                    <div className="section-header">
                        <sp-body size="S" className="section-title">Pre-processing</sp-body>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Denoise: {settings.denoise || 0}</sp-label>
                        <sp-slider
                            min="0"
                            max="5"
                            value={settings.denoise || 0}
                            onInput={(e) => updateSetting('denoise', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Blur: {settings.blur}</sp-label>
                        <sp-slider
                            min="0"
                            max="20"
                            value={settings.blur}
                            onInput={(e) => updateSetting('blur', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Sharpen: {settings.sharpenStrength}%</sp-label>
                        <sp-slider
                            min="0"
                            max="200"
                            value={settings.sharpenStrength}
                            onInput={(e) => updateSetting('sharpenStrength', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    {settings.sharpenStrength > 0 && (
                        <div className="control-row slider-row">
                            <sp-label size="S">Sharpen Radius: {settings.sharpenRadius}px</sp-label>
                            <sp-slider
                                min="1"
                                max="10"
                                value={settings.sharpenRadius}
                                onInput={(e) => updateSetting('sharpenRadius', parseInt(e.target.value))}
                            ></sp-slider>
                        </div>
                    )}

                    <div className="control-row slider-row">
                        <sp-label size="S">Brightness: {settings.brightness}</sp-label>
                        <sp-slider
                            min="-100"
                            max="100"
                            value={settings.brightness}
                            onInput={(e) => updateSetting('brightness', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Contrast: {settings.contrast}</sp-label>
                        <sp-slider
                            min="-50"
                            max="100"
                            value={settings.contrast}
                            onInput={(e) => updateSetting('contrast', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Gamma: {(settings.gamma || 1.0).toFixed(1)}{(settings.gamma || 1.0) === 1.0 ? ' (neutral)' : (settings.gamma || 1.0) < 1.0 ? ' (brighter)' : ' (darker)'}</sp-label>
                        <sp-slider
                            min="2"
                            max="30"
                            value={Math.round((settings.gamma || 1.0) * 10)}
                            onInput={(e) => updateSetting('gamma', parseInt(e.target.value) / 10)}
                        ></sp-slider>
                    </div>

                    <div className="control-row slider-row">
                        <sp-label size="S">Noise: {settings.noise}</sp-label>
                        <sp-slider
                            min="0"
                            max="50"
                            value={settings.noise}
                            onInput={(e) => updateSetting('noise', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>

                    <div className="control-row checkbox-row">
                        <sp-checkbox
                            checked={settings.grayscale ? true : undefined}
                            onInput={(e) => updateSetting('grayscale', e.target.checked)}
                        >
                            Convert to Grayscale
                        </sp-checkbox>
                    </div>
                </div>

                {/* Color Mapping */}
                <div className="section">
                    <div className="section-header-inline">
                        <sp-body size="S" className="section-title">Color</sp-body>
                        <sp-picker
                            ref={colorModePickerRef}
                            size="s"
                            value={settings.colorMode}
                        >
                            <sp-menu slot="options">
                                <sp-menu-item value="none">None (Original)</sp-menu-item>
                                <sp-menu-item value="mono">Mono (2 Colors)</sp-menu-item>
                                <sp-menu-item value="duotone">Duotone</sp-menu-item>
                                <sp-menu-item value="tritone">Tri-tone</sp-menu-item>
                                <sp-menu-item value="palette">Palette (Indexed)</sp-menu-item>
                            </sp-menu>
                        </sp-picker>
                    </div>

                    {settings.colorMode === 'palette' && (
                        <>
                        <div className="control-row">
                            <sp-picker
                                ref={palettePickerRef}
                                size="s"
                                value={settings.palettePreset}
                            >
                                <sp-menu slot="options">
                                    <sp-label className="dropdown-category">RETRO</sp-label>
                                    <sp-menu-item value="gameboy">Game Boy</sp-menu-item>
                                    <sp-menu-item value="gameboy-pocket">Game Boy Pocket</sp-menu-item>
                                    <sp-menu-item value="cga-0">CGA Cyan</sp-menu-item>
                                    <sp-menu-item value="cga-1">CGA Red</sp-menu-item>
                                    <sp-menu-item value="commodore-64">Commodore 64</sp-menu-item>
                                    <sp-menu-item value="nes">NES</sp-menu-item>
                                    <sp-menu-item value="pico-8">PICO-8</sp-menu-item>
                                    <sp-menu-item value="apple-ii">Apple II</sp-menu-item>

                                    <sp-divider size="small"></sp-divider>
                                    <sp-label className="dropdown-category">MONOCHROME</sp-label>
                                    <sp-menu-item value="mono-green">Mono Green</sp-menu-item>
                                    <sp-menu-item value="mono-amber">Mono Amber</sp-menu-item>
                                    <sp-menu-item value="sepia">Sepia</sp-menu-item>
                                    <sp-menu-item value="grayscale-4">Grayscale 4</sp-menu-item>
                                    <sp-menu-item value="grayscale-8">Grayscale 8</sp-menu-item>

                                    <sp-divider size="small"></sp-divider>
                                    <sp-label className="dropdown-category">CUSTOM</sp-label>
                                    <sp-menu-item value="custom">Custom (Extracted)</sp-menu-item>
                                </sp-menu>
                            </sp-picker>
                        </div>

                        <div className="control-row">
                            <sp-label size="S">Colors: {settings.paletteColorCount || 8}</sp-label>
                            <sp-slider
                                min="2"
                                max="32"
                                value={settings.paletteColorCount || 8}
                                onInput={(e) => updateSetting('paletteColorCount', parseInt(e.target.value))}
                            ></sp-slider>
                            <sp-button
                                size="s"
                                variant="secondary"
                                onClick={handleExtractPalette}
                                disabled={isProcessing ? true : undefined}
                                style={{ marginTop: '2px' }}
                            >
                                Extract from Layer
                            </sp-button>
                        </div>

                        {settings.customPalette && settings.palettePreset === 'custom' && (
                            <div className="control-row">
                                <div className="palette-swatches">
                                    {settings.customPalette.map((color, i) => (
                                        <div
                                            key={i}
                                            className="palette-swatch"
                                            style={{ backgroundColor: color }}
                                            title={color}
                                        ></div>
                                    ))}
                                </div>
                            </div>
                        )}
                        </>
                    )}

                    {settings.colorMode !== 'none' && settings.colorMode !== 'palette' && (
                        <>
                            <div className="control-row color-row">
                                <sp-label size="S">Shadow Color</sp-label>
                                <div className="color-input-wrapper">
                                    <input
                                        type="color"
                                        value={settings.shadowColor}
                                        onChange={(e) => updateSetting('shadowColor', e.target.value)}
                                        className="color-input"
                                    />
                                    <sp-textfield
                                        size="s"
                                        value={settings.shadowColor}
                                        onInput={(e) => updateColorSetting('shadowColor', e.target.value)}
                                    ></sp-textfield>
                                </div>
                            </div>

                            {settings.colorMode === 'tritone' && (
                                <div className="control-row color-row">
                                    <sp-label size="S">Midtone Color</sp-label>
                                    <div className="color-input-wrapper">
                                        <input
                                            type="color"
                                            value={settings.midtoneColor}
                                            onChange={(e) => updateSetting('midtoneColor', e.target.value)}
                                            className="color-input"
                                        />
                                        <sp-textfield
                                            size="s"
                                            value={settings.midtoneColor}
                                            onInput={(e) => updateColorSetting('midtoneColor', e.target.value)}
                                        ></sp-textfield>
                                    </div>
                                </div>
                            )}

                            <div className="control-row color-row">
                                <sp-label size="S">Highlight Color</sp-label>
                                <div className="color-input-wrapper">
                                    <input
                                        type="color"
                                        value={settings.highlightColor}
                                        onChange={(e) => updateSetting('highlightColor', e.target.value)}
                                        className="color-input"
                                    />
                                    <sp-textfield
                                        size="s"
                                        value={settings.highlightColor}
                                        onInput={(e) => updateColorSetting('highlightColor', e.target.value)}
                                    ></sp-textfield>
                                </div>
                            </div>

                            {settings.colorMode === 'tritone' && (
                                <>
                                    <div className="control-row slider-row">
                                        <sp-label size="S">Shadow Threshold: {settings.shadowThreshold}</sp-label>
                                        <sp-slider
                                            min="10"
                                            max="120"
                                            value={settings.shadowThreshold}
                                            onInput={(e) => updateSetting('shadowThreshold', parseInt(e.target.value))}
                                        ></sp-slider>
                                    </div>
                                    <div className="control-row slider-row">
                                        <sp-label size="S">Highlight Threshold: {settings.highlightThreshold}</sp-label>
                                        <sp-slider
                                            min="130"
                                            max="245"
                                            value={settings.highlightThreshold}
                                            onInput={(e) => updateSetting('highlightThreshold', parseInt(e.target.value))}
                                        ></sp-slider>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    <div className="control-row slider-row">
                        <sp-label size="S">Color Overlay: {settings.colorOverlay || 0}%</sp-label>
                        <sp-slider
                            min="0"
                            max="100"
                            value={settings.colorOverlay || 0}
                            onInput={(e) => updateSetting('colorOverlay', parseInt(e.target.value))}
                        ></sp-slider>
                    </div>
                </div>

                {/* Post Effects */}
                <div className="section">
                    <div className="section-header-inline">
                        <sp-body size="S" className="section-title">Post FX</sp-body>
                        <sp-checkbox
                            checked={settings.crtEnabled ? true : undefined}
                            onInput={(e) => updateSetting('crtEnabled', e.target.checked)}
                        >
                            CRT
                        </sp-checkbox>
                    </div>

                    {settings.crtEnabled && (
                        <>
                            <div className="control-row slider-row">
                                <sp-label size="S">Scanlines: {settings.crtScanlineIntensity}%</sp-label>
                                <sp-slider min="0" max="100" value={settings.crtScanlineIntensity}
                                    onInput={(e) => updateSetting('crtScanlineIntensity', parseInt(e.target.value))}></sp-slider>
                            </div>
                            <div className="control-row slider-row">
                                <sp-label size="S">Line Width: {settings.crtScanlineWidth}px</sp-label>
                                <sp-slider min="1" max="8" value={settings.crtScanlineWidth}
                                    onInput={(e) => updateSetting('crtScanlineWidth', parseInt(e.target.value))}></sp-slider>
                            </div>
                            <div className="control-row slider-row">
                                <sp-label size="S">Bloom: {settings.crtBloomStrength}%</sp-label>
                                <sp-slider min="0" max="100" value={settings.crtBloomStrength}
                                    onInput={(e) => updateSetting('crtBloomStrength', parseInt(e.target.value))}></sp-slider>
                            </div>
                            {settings.crtBloomStrength > 0 && (
                                <div className="control-row slider-row">
                                    <sp-label size="S">Bloom R: {settings.crtBloomRadius}px</sp-label>
                                    <sp-slider min="1" max="10" value={settings.crtBloomRadius}
                                        onInput={(e) => updateSetting('crtBloomRadius', parseInt(e.target.value))}></sp-slider>
                                </div>
                            )}
                            <div className="control-row slider-row">
                                <sp-label size="S">Phosphor: {settings.crtPhosphorGlow}%</sp-label>
                                <sp-slider min="0" max="100" value={settings.crtPhosphorGlow}
                                    onInput={(e) => updateSetting('crtPhosphorGlow', parseInt(e.target.value))}></sp-slider>
                            </div>
                            <div className="control-row slider-row">
                                <sp-label size="S">Vignette: {settings.crtVignetteStrength}%</sp-label>
                                <sp-slider min="0" max="100" value={settings.crtVignetteStrength}
                                    onInput={(e) => updateSetting('crtVignetteStrength', parseInt(e.target.value))}></sp-slider>
                            </div>
                        </>
                    )}

                    <div className="control-row slider-row">
                        <sp-label size="S">Chroma Shift: {settings.chromaticAberration || 0}px</sp-label>
                        <sp-slider min="0" max="20" value={settings.chromaticAberration || 0}
                            onInput={(e) => updateSetting('chromaticAberration', parseInt(e.target.value))}></sp-slider>
                    </div>
                    {(settings.chromaticAberration || 0) > 0 && (
                        <div className="control-row slider-row">
                            <sp-label size="S">Shift Angle: {settings.chromaticAberrationAngle || 0}°</sp-label>
                            <sp-slider min="0" max="360" value={settings.chromaticAberrationAngle || 0}
                                onInput={(e) => updateSetting('chromaticAberrationAngle', parseInt(e.target.value))}></sp-slider>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="panel-footer">
                <div className="button-row">
                    <sp-button
                        variant="primary"
                        onClick={handleApply}
                        disabled={isProcessing ? true : undefined}
                    >
                        {isProcessing ? "Processing..." : "Apply Dither"}
                    </sp-button>
                    {isLiveMode && (
                        <sp-button
                            variant="cta"
                            onClick={handleDone}
                            disabled={isProcessing ? true : undefined}
                        >
                            Done
                        </sp-button>
                    )}
                    <sp-button
                        variant="secondary"
                        onClick={handleReset}
                        disabled={isProcessing ? true : undefined}
                    >
                        Reset
                    </sp-button>
                </div>

                {isProcessing && (
                    <div className="button-row cancel-row">
                        <sp-button variant="warning" onClick={handleCancel}>Cancel</sp-button>
                    </div>
                )}

                <div className="button-row secondary-actions">
                    <sp-button
                        size="s"
                        variant="secondary"
                        onClick={handleBatchApply}
                        disabled={(isProcessing || isLiveMode) ? true : undefined}
                    >
                        Batch All Layers
                    </sp-button>
                    <sp-button
                        size="s"
                        variant="secondary"
                        onClick={handleCreateVectorPath}
                        disabled={isProcessing ? true : undefined}
                    >
                        Create Vector Path
                    </sp-button>
                </div>

                {isLiveMode && (
                    <sp-body size="XS" className="live-hint">
                        Changes will update automatically
                    </sp-body>
                )}
            </div>
        </div>
    );
};
