"use strict";

const { getMeshFromUid, getLayerFromUid } = require('./StateUtils.js');

module.exports = function updateLayerBlendMode(editor, layer_uid, blend_mode) {

    const ss = editor.getSerializedState();

    const layer_ob = getLayerFromUid(ss, layer_uid);

    if (layer_ob !== undefined) {

        // Checkpoint for UNDO
        editor.checkpointHistory();

        layer_ob.set('blend', blend_mode);

        // Update layer opacity,
        const cc = editor.getCompositionController();
        cc.updateLayerBlendMode(layer_uid, blend_mode);

    }

};
