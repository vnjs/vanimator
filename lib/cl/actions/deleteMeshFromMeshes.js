"use strict";

const { getMeshFromUid, getLayerFromUid } = require('./StateUtils.js');

module.exports = function deleteMeshFromMeshes(editor, mesh_uid, layer_uid) {

    const ss = editor.getSerializedState();

    if (layer_uid === null) {
        const meshes = ss.getArray('meshes');
        const mesh_ob = getMeshFromUid(ss, mesh_uid);

        const lsn = mesh_ob.get('layers_set');
        lsn.forEach((layer_uid) => {

            const layer_ob = getLayerFromUid(ss, layer_uid);

            layer_ob.remove('mesh_uid_for_layer');

            editor.resetLayerPoseGeometry(layer_uid);

        });

        // Remove the mesh,
        meshes.remove(mesh_uid);

    }
    else {
        // Remove the layer from mesh,
        const mesh_ob = getMeshFromUid(ss, mesh_uid);
        const layer_ob = getLayerFromUid(ss, layer_uid);

        layer_ob.remove('mesh_uid_for_layer');

        editor.resetLayerPoseGeometry(layer_uid);

        const layers_set = mesh_ob.get('layers_set');
        const c = layers_set.indexOf(layer_uid);
        if (c >= 0) {
            const lsn = layers_set.slice(0);
            lsn.splice(c, 1);
            mesh_ob.set('layers_set', lsn);
        }

    }

    editor.fullUpdatePoseMesh(mesh_uid);

    editor.checkpointHistory();

    editor.deselectMeshes();
    editor.fullRefresh();

};
