import React from "react";

import { PanelController } from "./controllers/PanelController.jsx";
import { DitherEffect } from "./panels/DitherEffect.jsx";

import { entrypoints } from "uxp";

const ditherEffectController = new PanelController(() => <DitherEffect/>, { id: "ditherEffect", menuItems: [
    { id: "reload", label: "Reload Plugin", enabled: true, checked: false, oninvoke: () => location.reload() }
] });

entrypoints.setup({
    plugin: {
        create(plugin) {
            console.log("Dither Effect plugin created", plugin);
        },
        destroy() {
            console.log("Dither Effect plugin destroyed");
        }
    },
    panels: {
        ditherEffect: ditherEffectController
    }
});
