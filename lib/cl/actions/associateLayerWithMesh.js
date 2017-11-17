"use strict";

const { getMeshFromUid, getLayerFromUid } = require('./StateUtils.js');

// Associates a layer with a mesh. If 'taget_layer_uid' is not null then the
// layer is inserted at the same position as the 'target layer' within the set
// of layers associated with the mesh.

module.exports = function associateLayerWithMesh(editor, layer_uid, mesh_uid, target_layer_uid) {

    const ss = editor.getSerializedState();

    const mesh_ob = getMeshFromUid(ss, mesh_uid);
    const layer_ob = getLayerFromUid(ss, layer_uid);

    if (mesh_ob !== undefined && layer_ob !== undefined) {

        const layer_type = layer_ob.get('type');
        if (layer_type === 'layer') {

            const extra_details = layer_ob.getClonedObject('extra_details');

            // Check layer isn't already assigned to a mesh,
            const mesh_uid_for_layer = extra_details.mesh_uid_for_layer;
            if (mesh_uid_for_layer === undefined) {

                editor.checkpointHistory();
                
                let layers_set = mesh_ob.get('layers_set');
                if (layers_set === undefined) {
                    mesh_ob.set('layers_set', [ layer_uid ]);
                }
                // Make sure we don't insert the same mesh twice,
                else if (layers_set.indexOf(layer_uid) < 0) {
                    let p = 0;
                    if (target_layer_uid !== null) {
                        p = layers_set.indexOf(target_layer_uid);
                        if (p < 0) {
                            p = 0;
                        }
                    }
                    layers_set = layers_set.slice(0);

                    // Insert it into position,
                    layers_set.splice(p, 0, layer_uid);

//                            layers_set.push(layer_uid);
                    mesh_ob.set('layers_set', layers_set);
                }
                extra_details.mesh_uid_for_layer = mesh_uid;
                layer_ob.set('extra_details', extra_details);

                editor.fullUpdatePoseMesh(mesh_uid);
                editor.refreshTreePanels();

                console.log("UPDATED: ", mesh_ob.get('layers_set'));
            }
            else {
                console.error("Layer already assigned a mesh.");
                console.error("PENDING: Report this in UI dialog.");
            }

        }
        else if (layer_type === 'group') {
            console.log("PENDING: drag/drop group");
        }

    }

};
