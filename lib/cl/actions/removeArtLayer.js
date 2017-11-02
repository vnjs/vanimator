"use strict";

const { internalRemoveArtLayer } = require('./StateUtils.js');

function pathStartsWith(path1, path2) {
    if (path1.length < path2.length) {
        return false;
    }
    for (let i = 0; i < path2.length; ++i) {
        if (path1[i] !== path2[i]) {
            return false;
        }
    }
    return true;
}

function internalRemoveGroupLayer(editor, ss, layer_uid) {
    const layers = ss.getArray('texture_layers');
    layers.remove(layer_uid);
    return undefined;
}


module.exports = function removeArtLayer(editor, layer_uid) {

    if (layer_uid === undefined) {
        return;
    }

    const ss = editor.getSerializedState();

    const layers = ss.getArray('texture_layers');

    const layer_ob = layers.get(layer_uid);

    const layer_type = layer_ob.get('type');
    const layer_name = layer_ob.get('name');
    const layer_path = layer_ob.get('path');

    if (layer_type === undefined) {
        return;
    }

    const updated_meshes = [];
    function addToMeshSet(mesh_uid) {
        if (mesh_uid !== undefined && updated_meshes.indexOf(mesh_uid) < 0) {
            updated_meshes.push(mesh_uid);
        }
    }

    // Is it a group?
    if (layer_type === 'group') {
        // Recursively remove all the children,
        const rem_path = layer_path.concat([ layer_uid ]);
        const groups_to_remove = [ layer_uid ];
        const layers_to_remove = [];
        layers.forEach((layer_t) => {
            const path_t = layer_t.get('path');
            const luid_t = layer_t.get('uid');
            if (pathStartsWith(path_t, rem_path)) {
                if (layer_t.get('type') === 'group') {
                    groups_to_remove.push(luid_t);
                }
                else {
                    layers_to_remove.push(layer_t.get('uid'));
                }
            }
        });
        layers_to_remove.forEach((remove_layer_uid) => {
            addToMeshSet(
                    internalRemoveArtLayer(editor, ss, remove_layer_uid));
        });
        groups_to_remove.forEach((remove_layer_uid) => {
            addToMeshSet(
                    internalRemoveGroupLayer(editor, ss, remove_layer_uid));
        });
    }
    else if (layer_type === 'layer') {
        addToMeshSet( internalRemoveArtLayer(editor, ss, layer_uid) );
    }
    else {
        throw Error('Unknown layer type: ' + layer_type);
    }

    updated_meshes.forEach((mesh_uid) => {
        editor.fullUpdatePoseMesh(mesh_uid);
    });

    editor.checkpointHistory();

    editor.deselectMeshes();
    editor.deselectLayers();
    editor.fullRefresh();

};
