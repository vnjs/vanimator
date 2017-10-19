"use strict";

const { getMeshFromUid, getLayerFromUid } = require('./StateUtils.js');

module.exports = function updateLayerBlendMode(editor, layer_uid, blend_mode) {

    const ss = editor.getSerializedState();

    const layer_ob = getLayerFromUid(ss, layer_uid);

    if (layer_ob !== undefined) {

        layer_ob.set('blend', blend_mode);

        // Update layer opacity,
        const cc = editor.getCompositionController();
        cc.updateLayerBlendMode(layer_uid, blend_mode);

        // Refresh the scene,
        editor.refreshScene();
        // Checkpoint for UNDO
        editor.checkpointHistory();

    }
//    console.log("BLEND MODE CHANGE: ", evt);
//    console.log("= ", layer_blend_mode_select_el.value);

};
