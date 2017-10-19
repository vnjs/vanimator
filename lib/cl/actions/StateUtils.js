"use strict";

function getMeshFromUid(ss, mesh_uid) {
    const meshes = ss.getArray('meshes');
    return meshes.get(mesh_uid);
}

function getLayerFromUid(ss, layer_uid) {
    const texture_layers = ss.getArray('texture_layers');
    return texture_layers.get(layer_uid);
}

module.exports = {
    getMeshFromUid,
    getLayerFromUid
};
