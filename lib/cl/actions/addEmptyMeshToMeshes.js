"use strict";

const uuidv1 = require('uuid/v1');

module.exports = function addEmptyMeshToMeshes(editor, mesh_name) {

    const ss = editor.getSerializedState();

    const meshes = ss.getArray('meshes');

    const uid = uuidv1();

    const mesh_ob = {
        uid: uid,
        name: mesh_name,
    };

    meshes.push(uid, mesh_ob);

    // Checkpoint for UNDO
    editor.checkpointHistory();

    editor.refreshTreePanels();

};
