/**
 * Preset Manager Module
 * Save, load, and manage named dither effect presets via localStorage
 */

const PRESETS_STORAGE_KEY = 'dither-fx-presets';

// Built-in presets (shipped with plugin, not deletable)
const BUILT_IN_PRESETS = {
    'crt-scanline': {
        name: 'CRT Scanline',
        builtIn: true,
        settings: {
            algorithm: 'cyber', pixelScale: 2, colorDepth: 1, intensity: 1.0,
            grayscale: true, crtEnabled: true, crtScanlineIntensity: 40,
            crtScanlineWidth: 2, crtPhosphorGlow: 30, crtBloomStrength: 20,
            colorMode: 'mono', shadowColor: '#001100', highlightColor: '#00ff00'
        }
    },
    'gameboy-classic': {
        name: 'Game Boy Classic',
        builtIn: true,
        settings: {
            algorithm: 'bayer-4x4', colorDepth: 2, intensity: 1.0,
            colorMode: 'palette', palettePreset: 'gameboy', pixelScale: 2
        }
    },
    'newspaper': {
        name: 'Newspaper Print',
        builtIn: true,
        settings: {
            algorithm: 'halftone-45', colorDepth: 1, intensity: 1.0,
            halftoneSize: 8, colorMode: 'mono', shadowColor: '#000000',
            highlightColor: '#f5f0e8', grayscale: true
        }
    },
    '1bit-atkinson': {
        name: '1-Bit Atkinson',
        builtIn: true,
        settings: {
            algorithm: 'atkinson', colorDepth: 1, intensity: 1.0,
            colorMode: 'mono', shadowColor: '#000000', highlightColor: '#ffffff'
        }
    },
    'retro-amber': {
        name: 'Retro Amber Monitor',
        builtIn: true,
        settings: {
            algorithm: 'bayer-8x8', colorDepth: 2, intensity: 1.0,
            colorMode: 'palette', palettePreset: 'mono-amber',
            crtEnabled: true, crtScanlineIntensity: 25, crtScanlineWidth: 1,
            crtVignetteStrength: 30
        }
    },
    'pixel-art': {
        name: 'Pixel Art 4x',
        builtIn: true,
        settings: {
            algorithm: 'floyd-steinberg', colorDepth: 3, intensity: 1.0,
            pixelScale: 4, colorMode: 'palette', palettePreset: 'pico-8'
        }
    },
    'vhs-glitch': {
        name: 'VHS Glitch',
        builtIn: true,
        settings: {
            algorithm: 'random', colorDepth: 3, intensity: 1.5,
            noise: 15, chromaticAberration: 8, chromaticAberrationAngle: 0,
            crtEnabled: true, crtScanlineIntensity: 20, crtScanlineWidth: 3,
            crtPhosphorGlow: 50
        }
    }
};

/**
 * Load user presets from localStorage
 */
function loadUserPresets() {
    try {
        const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.warn("[Presets] Could not load:", e.message);
    }
    return {};
}

/**
 * Save user presets to localStorage
 */
function saveUserPresets(presets) {
    try {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch (e) {
        console.warn("[Presets] Could not save:", e.message);
    }
}

/**
 * Get full preset list (built-in + user)
 * @returns {Object} { id: { name, builtIn, settings } }
 */
export function getPresetList() {
    const user = loadUserPresets();
    return { ...BUILT_IN_PRESETS, ...user };
}

/**
 * Load a preset's settings by ID
 * @param {string} id - Preset ID
 * @returns {Object|null} Settings object or null if not found
 */
export function loadPreset(id) {
    const all = getPresetList();
    return all[id]?.settings || null;
}

/**
 * Save a new user preset
 * @param {string} name - Display name
 * @param {Object} settings - Current settings to save
 * @returns {string} The generated preset ID
 */
export function savePreset(name, settings) {
    const user = loadUserPresets();
    const id = 'user-' + Date.now();
    user[id] = {
        name: name,
        builtIn: false,
        settings: { ...settings }
    };
    saveUserPresets(user);
    return id;
}

/**
 * Delete a user preset (refuses to delete built-in)
 * @param {string} id - Preset ID
 * @returns {boolean} True if deleted
 */
export function deletePreset(id) {
    if (BUILT_IN_PRESETS[id]) return false;
    const user = loadUserPresets();
    if (user[id]) {
        delete user[id];
        saveUserPresets(user);
        return true;
    }
    return false;
}
