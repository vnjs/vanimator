"use strict";

const { internalRemoveArtLayer } = require('./StateUtils.js');

module.exports = function mergeImportedState(editor, imported_ss) {

    const ss = editor.getSerializedState();

    // Get the layers from the current,

    const all_layer_set = [];

    const layers = ss.getArray('texture_layers');
    layers.forEach((layer_ob) => {
        all_layer_set.push({
            uid: layer_ob.get('uid'),
            name: layer_ob.get('name'),
            mesh_uid_for_layer:
                layer_ob.getFromObject('extra_details', 'mesh_uid_for_layer')
        });
    });

    // Make a target set of layers we want,

    const target_layer_set = [];

    const i_layers = imported_ss.getArray('texture_layers');
    i_layers.forEach((layer_ob) => {
        const iob = {
            uid: layer_ob.get('uid'),
            name: layer_ob.get('name'),
        };
        target_layer_set.push(iob);
    });

    // Layers that existed in the current layer set we mark them with the
    // same uid,

    const uid_rename_map = {};

    target_layer_set.forEach((dl) => {
        const name = dl.name;
        const sl = all_layer_set.find((o1) => o1.name === name);
        if (sl !== undefined) {
            uid_rename_map[dl.uid] = sl.uid;
            dl.rename_uid = sl.uid;
            dl.mesh_uid_for_layer = sl.mesh_uid_for_layer;
        }
        else {
            uid_rename_map[dl.uid] = dl.uid;
        }
    });

    const layers_to_remove = [];

    all_layer_set.forEach((sl) => {
        const name = sl.name;
        const dl = target_layer_set.find((o1) => o1.name === name);
        if (dl === undefined) {
            layers_to_remove.push(sl.uid);
        }
    });

    // Remove layers that aren't in target,
    layers_to_remove.forEach((layer_uid) => {
        internalRemoveArtLayer(editor, ss, layer_uid);
    });

    // Remove all the layers,
    const layers_ordinal = layers.getOrdinal().slice(0);
    layers_ordinal.forEach((layer_uid) => {
        layers.remove(layer_uid);
    });
    // Insert the new layers,
    target_layer_set.forEach((dl) => {
        const ilv = i_layers.get(dl.uid);
        // Rename UIDs in path,
        const path = ilv.get('path');
        path.forEach((pp, i) => {
            const rv = uid_rename_map[pp];
            if (rv !== undefined) {
                path[i] = rv;
            }
        });
        const the_uid = uid_rename_map[dl.uid];

        const FIELDS_TO_COPY = [
            'type', 'name', 'x', 'y', 'width', 'height', 'opacity', 'blend',
            'visible',
            'raw_texture_type', '$raw_texture_pixels'
        ];

        const extra_details = ilv.getClonedObject('extra_details');
        const lob = {
            uid: the_uid,
            path: path,
            extra_details,
        };
        if (dl.mesh_uid_for_layer !== undefined) {
            extra_details.mesh_uid_for_layer = dl.mesh_uid_for_layer;
        }

        FIELDS_TO_COPY.forEach((field) => {
            const v = ilv.get(field);
            if (v !== undefined) {
                lob[field] = v;
            }
        });

        layers.push(the_uid, lob);
    });

    // Fix 'mesh_uid_for_layer'


//    console.log(target_layer_set);

    editor.initializeTextureLayers();

    editor.checkpointHistory();

    editor.deselectMeshes();
    editor.fullRefresh();

};
