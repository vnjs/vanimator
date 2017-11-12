"use strict";

function getMeshFromUid(ss, mesh_uid) {
    const meshes = ss.getArray('meshes');
    const m = meshes.get(mesh_uid);
    if (m.get('uid') !== undefined) {
        return m;
    }
    return undefined;
}

function getLayerFromUid(ss, layer_uid) {
    const texture_layers = ss.getArray('texture_layers');
    const l = texture_layers.get(layer_uid);
    if (l.get('uid') !== undefined) {
        return l;
    }
    return undefined;
}


function internalRemoveArtLayer(editor, ss, layer_uid) {
    const layers = ss.getArray('texture_layers');
    const layer_ob = layers.get(layer_uid);
    // Remove this layer from mesh,
    const extra_details = layer_ob.get('extra_details');
    const mesh_uid = extra_details.mesh_uid_for_layer;
    console.log("extra_details = ", extra_details);
    if (mesh_uid !== undefined) {

        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        const mesh_layers_set = mesh_ob.get('layers_set').slice(0);

        const i = mesh_layers_set.indexOf(layer_uid);
        console.log("layer_uid = ", layer_uid);
        console.log("mesh_layers_set = ", JSON.stringify(mesh_layers_set));
        console.log("i = ", i);
        if (i >= 0) {
            mesh_layers_set.splice(i, 1);
            mesh_ob.set('layers_set', mesh_layers_set);
        }
        console.log(" out layers_set = ", JSON.stringify(mesh_ob.get('layers_set')));
    }

    // PENDING: Clean up threejs cache for this texture?

    layers.remove(layer_uid);

    return mesh_uid;
}

// Completely removes an anim key and all data associated with it,

function internalRemoveAnimKey(editor, ss, anim_key_uid) {

    const anim_keys = ss.getArray('anim_keys');
    const morph_targets = ss.getArray('morph_targets');

    const anim_key_ob = anim_keys.get(anim_key_uid);

    const keyframe_data = anim_key_ob.get('keyframe_data');
    keyframe_data.forEach((keyframe) => {
        const morph_target_uid = keyframe.morph_target_uid;
        if (morph_target_uid !== undefined) {
            morph_targets.remove(morph_target_uid);
        }
    });

    anim_keys.remove(anim_key_uid);

}





module.exports = {
    getMeshFromUid,
    getLayerFromUid,
    internalRemoveArtLayer,
    internalRemoveAnimKey,
};
