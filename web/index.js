"use strict";

/* globals window, document */

// Start point for the front end JavaScript code.

const EditorPanel = require('../lib/cl/EditorPanel.js');

// When the window loads,
window.addEventListener('load', () => {

    // Create and initialize the editor panel,
    const editor_panel = EditorPanel(window, document);
    editor_panel.init();

});
