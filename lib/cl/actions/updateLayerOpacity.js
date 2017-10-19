"use strict";

const { getMeshFromUid, getLayerFromUid } = require('./StateUtils.js');

module.exports = function updateLayerOpacity(editor, layer_uid, opacity_value) {

    const ss = editor.getSerializedState();

    const layer_ob = getLayerFromUid(ss, layer_uid);

    if (layer_ob !== undefined) {
        layer_ob.set('opacity', opacity_value);

        // Update layer opacity,
        const cc = editor.getCompositionController();
        cc.updateLayerOpacity(layer_uid, opacity_value);

        // Refresh the scene,
        editor.refreshScene();
        // Checkpoint for UNDO
        editor.checkpointHistory();
    }

};