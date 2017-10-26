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

module.exports = {
    getMeshFromUid,
    getLayerFromUid
};
