"use strict";

const geom_helper = require('./GeometryHelper.js')();
const CompositingHelper = require('./CompositingHelper.js')();

// Immediate controller of compositional elements.
// Mesh deforms, opacity/blend mode changes, etc.

function CompositionController(m_three_cache) {

    // Read current blend mode for layer uid and update scene as appropriate,
    function updateLayerBlendMode(layer_uid, layer_blend) {
        const layer_cache_ob = m_three_cache.getLayerData(layer_uid);
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
        const layer_cache_ob = m_three_cache.getLayerData(layer_uid);
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

        const cache_item = m_three_cache.getLayerData(layer_uid);
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



    function findVert(vert_arr, uid) {
        return vert_arr.find( (v) => v.uid === uid );
    }

    function findVertInMap(vert_map, uid) {
        return vert_map[uid];
    }

    function convertVertsToMap(verts_arr) {
        const vert_map = Object.create(null);
        const len = verts_arr.length;
        for (let i = 0; i < len; ++i) {
            const v = verts_arr[i];
            vert_map[v.uid] = v;
        }
        return vert_map;
    }


    function calcMeshMorphFromAnimKey(ss, ak_ob, value) {

        const keyframes = ak_ob.get('keyframe_data');

        if (keyframes.length === 0) {
            return {};
        }

        const morph_targets = ss.getArray('morph_targets');

        // Find the time points over which this time value is determined by,

        let lower_target;
        let lower_target_i = -1;

        // The last keyframe with a time lower than the input value,
        keyframes.forEach((keyframe, i) => {
            const time = keyframe.time;
            if (lower_target === undefined || time <= value) {
                lower_target = time;
                lower_target_i = i;
            }
        });

        let upper_target;
        let upper_target_i;

        // If lower is the last key frame,
        if (lower_target_i === keyframes.length - 1) {
            upper_target = lower_target;
            upper_target_i = lower_target_i;
        }
        else {
            upper_target_i = lower_target_i + 1;
            upper_target = keyframes[upper_target_i].time;
        }

        const dif = upper_target - lower_target;
        const lower_mt = morph_targets.get(keyframes[lower_target_i].morph_target_uid);
        const upper_mt = morph_targets.get(keyframes[upper_target_i].morph_target_uid);

        const lower_verts = lower_mt.get('target_verts');
        const upper_verts = upper_mt.get('target_verts');

        const mesh_uid = lower_mt.get('target_mesh_uid');

        const time_section = dif > 0.01 ? (value - lower_target) / dif : 0;

        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        const layers_set = mesh_ob.get('layers_set');
        const face_indexes = mesh_ob.get('me_face_indexes');
        const me_vertices = mesh_ob.get('me_vertices');

        const vertex_map = Object.create(null);
        const len = me_vertices.length;
        for (let i = 0; i < len; ++i) {
            const vert = me_vertices[i];

            const lvchange = lower_verts[vert.uid];
            const uvchange = upper_verts[vert.uid];

            // The morph interpolation algorithm,
            let dx = 0;
            let dy = 0;

            if (lvchange !== undefined && uvchange !== undefined) {

                // Linear Interpolation (LERP),
                dx = ((uvchange.dx - lvchange.dx) * time_section) + lvchange.dx;
                dy = ((uvchange.dy - lvchange.dy) * time_section) + lvchange.dy;

            }

            const out_v = {
                rx: vert.rx,
                ry: vert.ry,
                dx: dx,
                dy: dy
            };
            vertex_map[vert.uid] = out_v;

        }

        const deform_details = {};
        deform_details[mesh_uid] = {
            layers_set,
            vertex_map,
            face_indexes
        };

        return deform_details;

    }



    function calcMeshMorphsFromAnimKeys(ss, anim_keys, value, all_mesh_deforms) {
        const ak_set = ss.getArray('anim_keys');
        anim_keys.forEach((anim_key) => {
            const anim_key_uid = anim_key.uid;
            const anim_key_type = anim_key.type;
            const ak_ob = ak_set.get(anim_key_uid);

            let deform_details;

            if (anim_key_type === 'mesh_morph') {
                deform_details = calcMeshMorphFromAnimKey(ss, ak_ob, value);
            }
            else {
                throw Error('Unknown anim key type: ' + anim_key_type);
            }

            for (let mesh_uid in deform_details) {
                const details = deform_details[mesh_uid];
                const all_mdetails = all_mesh_deforms[mesh_uid];

                // Merge all the morphs on the same mesh,
                if (all_mdetails === undefined) {
                    all_mesh_deforms[mesh_uid] = details;
                }
                else {

                    for (let vuid in all_mdetails.vertex_map) {
                        const v1 = all_mdetails.vertex_map[vuid];
                        const v2 = details.vertex_map[vuid];
                        if (v2 !== undefined) {
                            v1.dx += v2.dx;
                            v1.dy += v2.dy;
                        }
                    }

                }
            }
        });

        return all_mesh_deforms;
    }




    function calcMeshMorphsFromSingleAction(ss, action_uid, value) {

        const actions = ss.getArray('actions');
        const action_ob = actions.get(action_uid);

        const all_mesh_deforms = {};

        // If there are anim keys,
        const anim_keys = action_ob.get('anim_keys');
        if (anim_keys !== undefined) {
            calcMeshMorphsFromAnimKeys(ss, anim_keys, value, all_mesh_deforms);
        }

        return all_mesh_deforms;

    }




    function calcMeshMorphsFromActions(ss, excludes_action_uid) {

        const actions = ss.getArray('actions');

        const all_mesh_deforms = {};

        // For all actions,
        actions.forEach((action_ob) => {
            const action_uid = action_ob.get('uid');
            if ( excludes_action_uid === undefined ||
                 excludes_action_uid.indexOf(action_uid) < 0 ) {
                const value = action_ob.get('value');
                // If there are anim keys,
                const anim_keys = action_ob.get('anim_keys');
                if (anim_keys !== undefined) {
                    calcMeshMorphsFromAnimKeys(ss, anim_keys, value, all_mesh_deforms);
                }
            }
        });

        return all_mesh_deforms;

    }



    function mergeVertexDeforms(vertex_map1, vertex_map2) {

        const out_vertex_arr = [];

        for (let vuid in vertex_map1) {
            const v1 = vertex_map1[vuid];
            const v2 = vertex_map2[vuid];
            if (v2 === undefined) {
                out_vertex_arr.push({
                    uid: vuid,
                    rx: v1.rx,
                    ry: v1.ry,
                    dx: v1.dx,
                    dy: v1.dy
                });
            }
            else {
                out_vertex_arr.push({
                    uid: vuid,
                    rx: v1.rx,
                    ry: v1.ry,
                    dx: v1.dx + v2.dx,
                    dy: v1.dy + v2.dy
                });
            }
        }

        return out_vertex_arr;
    }


    // Convert vertex map to vertex arr.

    function toVertexArr(vertex_map) {

        const out_vertex_arr = [];

        for (let vuid in vertex_map) {
            const v = vertex_map[vuid];
            out_vertex_arr.push({
                uid: vuid,
                rx: v.rx,
                ry: v.ry,
                dx: v.dx,
                dy: v.dy
            });
        }

        return out_vertex_arr;
    }


    return {
        updateLayerBlendMode,
        updateLayerOpacity,
        updatePoseGeometry,

        calcMeshMorphsFromSingleAction,
        calcMeshMorphsFromActions,

        mergeVertexDeforms,
        toVertexArr,

    //    updatePoseFromSingleAction,
    };

}

module.exports = CompositionController;
