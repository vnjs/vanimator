"use strict";

const { getMeshFromUid, getLayerFromUid, internalRemoveAnimKey } = require('./StateUtils.js');




module.exports = function deleteMeshFromMeshes(editor, mesh_uid, layer_uid) {

    const ss = editor.getSerializedState();

    editor.checkpointHistory();

    let did_delete = false;

    if (layer_uid === null) {
        const meshes = ss.getArray('meshes');
        const mesh_ob = getMeshFromUid(ss, mesh_uid);

        const lsn = mesh_ob.get('layers_set');
        lsn.forEach((layer_uid) => {

            const layer_ob = getLayerFromUid(ss, layer_uid);

            layer_ob.deleteInObject('extra_details', 'mesh_uid_for_layer');

            editor.resetLayerPoseGeometry(layer_uid);

        });

        // Remove the mesh,
        meshes.remove(mesh_uid);
        did_delete = true;

        // Remove any mesh morph actions,
        const actions = ss.getArray('actions');
        actions.forEach((action_ob) => {
            const anim_keys = action_ob.get('anim_keys').slice(0);
            const len = anim_keys.length;
            let did_remove_from_action = false;
            for (let i = len - 1; i >= 0; --i) {
                const anim_key_arr_ob = anim_keys[i];
                if (anim_key_arr_ob.type === 'mesh_morph') {
                    const anim_key_mesh_uid = anim_key_arr_ob.target_uid;
                    if (anim_key_mesh_uid === mesh_uid) {
                        internalRemoveAnimKey(editor, ss, anim_key_arr_ob.uid);
                        anim_keys.splice(i, 1);
                        did_remove_from_action = true;
                    }
                }
            }
            // Update action's anim keys if we updated it,
            if (did_remove_from_action === true) {
                action_ob.set('anim_keys', anim_keys);
            }
        });

    }
    else {
        // Remove the layer from mesh,
        const mesh_ob = getMeshFromUid(ss, mesh_uid);
        const layer_ob = getLayerFromUid(ss, layer_uid);

        layer_ob.deleteInObject('extra_details', 'mesh_uid_for_layer');

        editor.resetLayerPoseGeometry(layer_uid);

        const layers_set = mesh_ob.get('layers_set');
        const c = layers_set.indexOf(layer_uid);
        if (c >= 0) {
            const lsn = layers_set.slice(0);
            lsn.splice(c, 1);
            mesh_ob.set('layers_set', lsn);
            did_delete = true;
        }

    }

    if (did_delete === false) {
        editor.removeTopHistory();
    }

    editor.fullUpdatePoseMesh(mesh_uid);

    editor.deselectMeshes();
    editor.fullRefresh();

};
