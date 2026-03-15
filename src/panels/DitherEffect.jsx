import React, { useState, useRef, useEffect, useCallback } from "react";
import "./DitherEffect.css";
import {
    initialApply,
    updateEffect,
    resetEffect,
    isEffectInitialized,
    getDefaultSettings,
    resetProcessingState
} from "../core/effectProcessor.js";

export const DitherEffect = () => {
    // State
    const [settings, setSettings] = useState(getDefaultSettings());
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState({ type: 'ready', message: 'Ready' });
    const [isLiveMode, setIsLiveMode] = useState(false);
    
    // Refs to avoid stale closures
    const settingsRef = useRef(settings);
    const isProcessingRef = useRef(false);
    const isLiveModeRef = useRef(false);
    const debounceTimerRef = useRef(null);
    const initialApplyDoneRef = useRef(false);
    
    // Keep refs in sync
    settingsRef.current = settings;
    isLiveModeRef.current = isLiveMode;
    
    // Update setting helper
    const updateSetting = useCallback((key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);
    
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
                {/* Target Selection */}
                <div className="section">
                    <div className="section-header">
                        <sp-body size="S" className="section-title">Target</sp-body>
                    </div>
                    <div className="control-row">
                        <sp-picker
                            size="s"
                            value={settings.target}
                            onInput={(e) => updateSetting('target', e.target.value)}
                        >
                            <sp-menu slot="options">
                                <sp-menu-item value="active-layer">Active Layer</sp-menu-item>
                                <sp-menu-item value="flattened">Flattened Document</sp-menu-item>
                                <sp-menu-item value="selection">Selection Only</sp-menu-item>
                            </sp-menu>
                        </sp-picker>
                    </div>
                </div>
                
                {/* Dither Settings */}
                <div className="section">
                    <div className="section-header">
                        <sp-body size="S" className="section-title">Dither Algorithm</sp-body>
                    </div>
                    
                    <div className="control-row">
                        <sp-label size="S">Algorithm</sp-label>
                        <sp-picker
                            size="s"
                            value={settings.algorithm}
                            onInput={(e) => updateSetting('algorithm', e.target.value)}
                        >
                            <sp-menu slot="options">
                                <sp-label className="dropdown-category">BASIC</sp-label>
                                <sp-menu-item value="none">None (Quantize Only)</sp-menu-item>
                                
                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">ORDERED (BAYER)</sp-label>
                                <sp-menu-item value="bayer-2x2">Bayer 2x2</sp-menu-item>
                                <sp-menu-item value="bayer-4x4">Bayer 4x4</sp-menu-item>
                                <sp-menu-item value="bayer-8x8">Bayer 8x8</sp-menu-item>
                                
                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">ERROR DIFFUSION</sp-label>
                                <sp-menu-item value="floyd-steinberg">Floyd-Steinberg</sp-menu-item>
                                <sp-menu-item value="atkinson">Atkinson</sp-menu-item>
                                
                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">PATTERN</sp-label>
                                <sp-menu-item value="pattern-a">Pattern Dither A</sp-menu-item>
                                <sp-menu-item value="pattern-b">Pattern Dither B</sp-menu-item>
                                
                                <sp-divider size="small"></sp-divider>
                                <sp-label className="dropdown-category">OTHER</sp-label>
                                <sp-menu-item value="random">Random Noise</sp-menu-item>
                            </sp-menu>
                        </sp-picker>
                    </div>
                    
                    <div className="control-row slider-row">
                        <sp-label size="S">Color Depth: {settings.colorDepth} bit ({Math.pow(2, settings.colorDepth)} levels)</sp-label>
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
                </div>
                
                {/* Pre-processing */}
                <div className="section">
                    <div className="section-header">
                        <sp-body size="S" className="section-title">Pre-processing</sp-body>
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
                    <div className="section-header">
                        <sp-body size="S" className="section-title">Color Mapping</sp-body>
                    </div>
                    
                    <div className="control-row">
                        <sp-label size="S">Mode</sp-label>
                        <sp-picker
                            size="s"
                            value={settings.colorMode}
                            onInput={(e) => updateSetting('colorMode', e.target.value)}
                        >
                            <sp-menu slot="options">
                                <sp-menu-item value="none">None (Original)</sp-menu-item>
                                <sp-menu-item value="mono">Mono (2 Colors)</sp-menu-item>
                                <sp-menu-item value="duotone">Duotone</sp-menu-item>
                                <sp-menu-item value="tritone">Tri-tone</sp-menu-item>
                            </sp-menu>
                        </sp-picker>
                    </div>
                    
                    {settings.colorMode !== 'none' && (
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
                                        onInput={(e) => updateSetting('shadowColor', e.target.value)}
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
                                            onInput={(e) => updateSetting('midtoneColor', e.target.value)}
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
                                        onInput={(e) => updateSetting('highlightColor', e.target.value)}
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
                        {isProcessing ? "Processing..." : (isLiveMode ? "Re-Apply" : "Apply Dither")}
                    </sp-button>
                    <sp-button
                        variant="secondary"
                        onClick={handleReset}
                        disabled={isProcessing ? true : undefined}
                    >
                        Reset
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
