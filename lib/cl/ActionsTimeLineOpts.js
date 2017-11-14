"use strict";

const uuidv1 = require('uuid/v1');

// Handles Time Line for individual actions.

function ActionsTimeLineOpts(editor) {

    let time_line;


    function setTimeLine(tl) {
        time_line = tl;
    }


    function setupFor(action) {
        const action_uid = action.uid;

        const ss = editor.getSerializedState();
        const actions = ss.getArray('actions');
        const action_ob = actions.get(action_uid);
        const type = action_ob.get('type');

        const ret = {};

        if (type === '1d 0 1') {
            ret.left_limit =  [ 0, 0 ];
            ret.right_limit = [ 1, 1000 ];
        }
        else if (type === '1d -1 1') {
            ret.left_limit =  [ -1, 0 ];
            ret.right_limit = [  1, 1000 ];
        }
        else {
            throw Error("Unknown action type: " + type);
        }

        ret.current_time_point = action_ob.get('value');

        ret.event_info = {
            uid: action_ob.get('uid'),
            name: action_ob.get('name')
        };

        return ret;

    }

    function fvert(vert_set, uid) {
        return vert_set.find((v) => (v.uid === uid));
    }

    function insertMeshMorphKeyFrame(
                current_time_point, action_ob, mesh_ob, keyframe_data) {
        // Inserts a key frame for the given mesh,

        const me_vertices = mesh_ob.get('me_vertices');

        const ss = editor.getSerializedState();
        const composition_controller = editor.getCompositionController();

        const mesh_uid = mesh_ob.get('uid');

        // Compute all mesh deforms for other actions,
        const all_mesh_deforms =
                composition_controller.calcMeshMorphsFromActions(
                                            ss, [ action_ob.get('uid') ]);

        // Other mesh deforms for the uid,
        const mesh_deforms = all_mesh_deforms[mesh_uid];

//        console.log("mesh_deforms = ", mesh_deforms);

        // Create a morph target,
        const target_verts = Object.create(null);
        const morph_ob = {
            uid: uuidv1(),
            target_mesh_uid: mesh_uid,
            target_verts
        };

        // Copy the current 'dx' and 'dy' values into the target verts object.
        // This represents the morph target for all the verts in the shape.
        me_vertices.forEach((vert) => {

            const vuid = vert.uid;

            let dx = vert.dx;
            let dy = vert.dy;
            if (mesh_deforms !== undefined) {
                const v = mesh_deforms.vertex_map[vuid];
                if (v !== undefined) {
                    dx -= v.dx;
                    dy -= v.dy;
                }
            }
            target_verts[vuid] = { dx, dy };

        });

        // Put this in the morph targets,
        const morph_targets = ss.getArray('morph_targets');

        // Put the morph object in the morph targets array,
        morph_targets.push(morph_ob.uid, morph_ob);

        // Now we need to insert this key frame into the keyframe data,
        const keyframe_item = {
            time: current_time_point,
            morph_target_uid: morph_ob.uid
        };

        // Remove any key frames that are near this one,
        for (let i = keyframe_data.length - 1; i >= 0; --i) {
            const si = keyframe_data[i];
            // PENDING: Should this 'near' check have a scaling factor
            //   associated to it?
            if ( si.time <= current_time_point + 0.01 &&
                 si.time >= current_time_point - 0.01 ) {
                // Remove the morph target,
                morph_targets.remove(si.morph_target_uid);
                keyframe_data.splice(i, 1);
            }
        }
        keyframe_data.push(keyframe_item);
        keyframe_data.sort((o1, o2) => (o1.time - o2.time));

        return keyframe_data;
    }

    function insertKeyFrameAction() {
        const current_action = time_line.getCurrentData();
        if (current_action !== undefined) {

            const ss = editor.getSerializedState();

            const actions = ss.getArray('actions');
            const action_ob = actions.get(current_action.uid);

            const action_uid = action_ob.get('uid');
            const action_name = action_ob.get('name');

            const meshes = ss.getArray('meshes');

            let anim_keys = action_ob.get('anim_keys');
            if (anim_keys === undefined) {
                anim_keys = [];
            }

            const current_time_point = time_line.getCurrentTimePoint();

            // For each animation key,
            anim_keys.forEach((anim_key) => {
                const anim_key_type = anim_key.type;
                const anim_key_uid = anim_key.uid;
                const anim_key_target_uid = anim_key.target_uid;

                const anim_keys_set = ss.getArray('anim_keys');
                const ak_ob = anim_keys_set.get(anim_key_uid);
                const anim_key_keyframe_data = ak_ob.get('keyframe_data');

                const keyframe_data_copy = [];
                anim_key_keyframe_data.forEach((kfdata) => {
                    keyframe_data_copy.push(
                            Object.assign( Object.create(null), kfdata ) );
                });

                // Handle mesh morph,
                if (anim_key_type === 'mesh_morph') {
                    const mesh_ob = meshes.get(anim_key_target_uid);
                    // Insert key frame for mesh morph,
                    insertMeshMorphKeyFrame(
                        current_time_point, action_ob, mesh_ob, keyframe_data_copy
                    );
                }
                else {
                    throw Error('Unknown anim key type: ' + anim_key_type);
                }

                // Update the keyframe_data object,
                ak_ob.set('keyframe_data', keyframe_data_copy);

            });

            time_line.refresh();

        }
    }

    function addMeshMorphLine(mesh_uid) {
        const current_action = time_line.getCurrentData();
        if (current_action !== undefined) {
            // Check this mesh morph is not already present,
            const ss = editor.getSerializedState();

            const actions = ss.getArray('actions');
            const action_ob = actions.get(current_action.uid);

            const action_uid = action_ob.get('uid');
            const action_name = action_ob.get('name');

            const meshes = ss.getArray('meshes');
            const mesh_ob = meshes.get(mesh_uid);

            const mesh_name = mesh_ob.get('name');

            // The animation keys,
            // Animation keys is an ordered set of objects that describes
            //  either the mesh_morph, deform_transform, or
            //  layer_property_change.
            let anim_keys = action_ob.get('anim_keys');
            if (anim_keys === undefined) {
                anim_keys = [];
            }

            let do_add = true;

            anim_keys.forEach((anim_key) => {
                const anim_key_type = anim_key.type;
                if (anim_key_type === 'mesh_morph') {
                    if (anim_key.target_uid === mesh_uid) {
                        do_add = false;
                    }
                }
            });

            if (!do_add) {
                console.error("Mesh Morph animation key already present.");
                console.error("PENDING: Turn this into a proper dialog.");
                return;
            }

            // Create a new entry in the animation key array,
            const anim_key_uid = uuidv1();

            // Add animation key,
            const new_anim_keys = anim_keys.slice(0);
            new_anim_keys.push({
                type: 'mesh_morph',
                uid: anim_key_uid,
                target_uid: mesh_uid,
            });

            action_ob.set('anim_keys', new_anim_keys);

            // Add the anim key uid to the 'anim_keys' array. This will
            // contain the timings of key frame data.
            const anim_keys_set = ss.getArray('anim_keys');
            const anim_key_ob = {
                uid: anim_key_uid,
                keyframe_data: []
            };
            anim_keys_set.push(anim_key_uid, anim_key_ob);

            time_line.refresh();

//            console.log("TODO: Add Mesh Morph %s to: %s", mesh_name, action_name);

        }
    }

    function getModel() {
        // Create the model from the current data,
        const ret = {
            row_data: []
        };

        const current_action = time_line.getCurrentData();
        if (current_action !== undefined) {

            const ss = editor.getSerializedState();
            const actions = ss.getArray('actions');
            const action_ob = actions.get(current_action.uid);

            const meshes = ss.getArray('meshes');
            const anim_keys_set = ss.getArray('anim_keys');

            let anim_keys = action_ob.get('anim_keys');
            if (anim_keys === undefined) {
                anim_keys = [];
            }

            anim_keys.forEach( (anim_key) => {

                const anim_key_type = anim_key.type;
                const anim_key_uid = anim_key.uid;
                const anim_key_target_uid = anim_key.target_uid;

                // Fetch keyframe data
                const ak_ob = anim_keys_set.get(anim_key_uid);
                const anim_key_keyframe_data = ak_ob.get('keyframe_data');

                // Action depends on anim key type,
                let name;
                let type;
                const frames = [];
                if (anim_key_type === 'mesh_morph') {
                    type = 'Morph';
                    name = meshes.get(anim_key_target_uid).get('name');
                    anim_key_keyframe_data.forEach((keyframe) => {
                        frames.push({
                            time: keyframe.time,
                            morph_target_uid: keyframe.morph_target_uid
                        });
                    });
                }
                else {
                    throw Error("Unknown animation key type: " + anim_key_type);
                }

                ret.row_data.push({
                    type,
                    name,
                    frames
                });

            });

        }

        return ret;
    }




    function handleDrop(evt) {
        const vstr = evt.dataTransfer.getData('ventry');
        if (vstr !== undefined) {
            const dob = JSON.parse(vstr);
            if (dob.root_mesh_uid !== undefined) {
                // Drop a mesh into the time line!
                const mesh_uid = dob.root_mesh_uid;

                addMeshMorphLine(mesh_uid);

            }
        }
    }

    function canDrop() {
        return true;
    }

    function getDropHandler() {
        return {
            canDrop,
            handleDrop
        };
    }


    function renderRow(row, i, x, y) {
        // Function that renders actions specific details.
    }




    return {
        setTimeLine,
        setupFor,
        getDropHandler,
        getModel,
        insertKeyFrameAction,
        renderRow,
    };

}

module.exports = ActionsTimeLineOpts;
