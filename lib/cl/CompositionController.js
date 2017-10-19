"use strict";

const geom_helper = require('./GeometryHelper.js')();
const CompositingHelper = require('./CompositingHelper.js')();

// Immediate controller of compositional elements.
// Mesh deforms, opacity/blend mode changes, etc.

function CompositionController(threejs_cache) {

    // Read current blend mode for layer uid and update scene as appropriate,
    function updateLayerBlendMode(layer_uid, layer_blend) {
        const layer_cache_ob = threejs_cache[layer_uid];
        if (layer_cache_ob !== undefined) {
            const pose_material = layer_cache_ob.pose_material;
            const present_material = layer_cache_ob.present_material;
            CompositingHelper.setMaterialForBlendMode(
                                    pose_material, layer_blend );
            CompositingHelper.setMaterialForBlendMode(
                                    present_material, layer_blend );
            pose_material.needsUpdate = true;
            present_material.needsUpdate = true;
        }
    }

    // Read opacity for layer uid and update scene as appropriate,
    function updateLayerOpacity(layer_uid, layer_opacity) {
        const layer_cache_ob = threejs_cache[layer_uid];
        if (layer_cache_ob !== undefined) {
            const pose_material = layer_cache_ob.pose_material;
            const present_material = layer_cache_ob.present_material;
            pose_material.uniforms.opacity.value = layer_opacity;
            present_material.uniforms.opacity.value = layer_opacity;
            pose_material.needsUpdate = true;
            present_material.needsUpdate = true;
        }
    }

    // Update vertex and faces of the pose geometry and update the UV
    // coordinates so the texture maps to the document space positions of each
    // vertex.
    // This will *not* deform geometry.

    function updatePoseGeometry(layer_uid, vertex_arr, face_indexes) {

        const cache_item = threejs_cache[layer_uid];
        const pose_geometry = cache_item.pose_geometry;
        const texture = cache_item.texture;
        const dimension = cache_item.dimension;

        const layer_x = dimension.x;
        const layer_y = dimension.y;
        const layer_width = dimension.width;
        const layer_height = dimension.height;
        const tex_width = texture.image.width;
        const tex_height = texture.image.height;

        // The pose mesh.
        // This is a complex polygon shape with the image material uv
        // aligned on it.
        cache_item.pose_geometry =
            geom_helper.updatePolygonBillboardGeometry(
                pose_geometry,
                vertex_arr, face_indexes,
                layer_x, layer_y, layer_width, layer_height,
                tex_width, tex_height);

    }



    // Morphs the pose geometry object by setting the named vertexes to the
    // given positions.
    //
    // 'modified_vert_map' is a map of vert_uid -> { x, y }
    //
    // Coordinates are in document space.

    function morphPoseGeometry(layer_uid, modified_vert_map) {

        const cache_item = threejs_cache[layer_uid];
        const pose_geometry = cache_item.pose_geometry;

        // For GC (cleans up GL buffers),
        pose_geometry.dispose();

        const vert_map = pose_geometry.vanim_mutable_vert_map;

        for (let vert_uid in modified_vert_map) {
            const vob = vert_map[vert_uid];
            if (vob !== undefined) {
                const src_vert = modified_vert_map[vert_uid];
                const dest_vert = vob.mutable_vert;
                dest_vert.x = src_vert.x;
                dest_vert.y = src_vert.y;
            }
        }

        pose_geometry.verticesNeedUpdate = true;
        pose_geometry.elementsNeedUpdate = true;
        pose_geometry.computeBoundingSphere();

    }

    // Resets pose geometry to its rest state.

    function resetPoseGeometry(layer_uid) {

        const cache_item = threejs_cache[layer_uid];
        const pose_geometry = cache_item.pose_geometry;

        // For GC (cleans up GL buffers),
        pose_geometry.dispose();

        const vert_map = pose_geometry.vanim_mutable_vert_map;

        for (let vert_uid in vert_map) {
            const vob = vert_map[vert_uid];
            const src_vert = vob.rest_vert;
            const dest_vert = vob.mutable_vert;

            dest_vert.x = src_vert.x;
            dest_vert.y = src_vert.y;

        }

        pose_geometry.verticesNeedUpdate = true;
        pose_geometry.elementsNeedUpdate = true;
        pose_geometry.computeBoundingSphere();

    }




    return {
        updateLayerBlendMode,
        updateLayerOpacity,
        updatePoseGeometry,
        morphPoseGeometry,
        resetPoseGeometry
    };

}

module.exports = CompositionController;
