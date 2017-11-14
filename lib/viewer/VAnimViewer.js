"use strict";

/* global document */

const THREE = require('three');

const BrowserVMODLoader = require('./BrowserVMODLoader.js');

const ThreeCache = require('../cl/ThreeCache.js');
const CompositionController = require('../cl/CompositionController.js');
const ModelCompositor = require('../cl/ModelCompositor.js');

const geom_helper = require('../cl/GeometryHelper.js')();





// Model target to render,

function ModelTarget(filename, ss, renderer) {

    const m_three_cache = ThreeCache();
    const composition_controller = CompositionController(m_three_cache);
    const model_compositor = ModelCompositor(m_three_cache);

    const action_name_lookup = Object.create(null);




    function createActionNameLookup() {
        const actions = ss.getArray('actions');
        actions.forEach((action_ob) => {
            const action_name = action_ob.get('name');
            const action_uid = action_ob.get('uid');
            action_name_lookup[action_name] = action_uid;
        });
    }
    createActionNameLookup();



    function updatePoseMesh(mesh_uid, mesh_details) {
        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        const layers_set = mesh_ob.get('layers_set');
        if (layers_set !== undefined) {
            layers_set.forEach( (layer_uid) => {
                composition_controller.updatePoseGeometry(layer_uid,
                        mesh_details.vertex_arr, mesh_details.face_indexes);
            });
        }
    }

    function updatePoseMeshObject(mesh_ob) {
        if (mesh_ob !== undefined) {
            // The mesh details,
            const mesh_details = {
                vertex_arr: mesh_ob.get('me_vertices'),
                face_indexes: mesh_ob.get('me_face_indexes')
            };
            updatePoseMesh(mesh_ob.get('uid'), mesh_details);
        }
    }


    // Initialization code,
    m_three_cache.initializeTextureLayers(ss, renderer, composition_controller);

    // For each mesh, update the pose mesh,
    const meshes = ss.getArray('meshes');
    meshes.forEach((mesh_ob) => {
        updatePoseMeshObject(mesh_ob);
    });

    model_compositor.setViewMode('pose');
    model_compositor.loadFrom(ss);



    function getUidOfActionName(action_name) {
        const action_uid = action_name_lookup[action_name];
        if (action_uid === undefined) {
            throw Error('Unknown action name');
        }
        return action_uid;
    }



    function setActionValue(action_name, value) {

        const action_uid = getUidOfActionName(action_name);

        const actions = ss.getArray('actions');
        const action_ob = actions.get(action_uid);
        action_ob.set('value', value);

        const excludes_action_uid = [ action_uid ];

        // Calculate mesh deforms from all other actions,
        const all_mesh_deforms =
                composition_controller.calcMeshMorphsFromActions(
                                                    ss, excludes_action_uid);
        // Calculate mesh deforms for this action,
        const action_mesh_deforms =
                composition_controller.calcMeshMorphsFromSingleAction(
                                                    ss, action_uid, value);

        // Interactively update pose geometry from the deform information,
        for (let mesh_uid in action_mesh_deforms) {
            const deform = action_mesh_deforms[mesh_uid];
            const vertex_def_other = all_mesh_deforms[mesh_uid];
            let vertex_arr;
            if (vertex_def_other !== undefined) {
                vertex_arr = composition_controller.mergeVertexDeforms(
                                deform.vertex_map, vertex_def_other.vertex_map);
            }
            else {
                vertex_arr = composition_controller.toVertexArr(
                                deform.vertex_map);
            }
            const layers_set = deform.layers_set;
            for (let i = 0; i < layers_set.length; ++i) {
                const layer_uid = layers_set[i];
                composition_controller.updatePoseGeometry(
                            layer_uid, vertex_arr, deform.face_indexes);
            }
        }

    }

    function getActionProperties(action_name) {

        const action_uid = getUidOfActionName(action_name);

        const actions = ss.getArray('actions');
        const action_ob = actions.get(action_uid);
        return {
            type: action_ob.get('type'),
            value: action_ob.get('value')
        };
    }

    function getActionNames() {
        const out = [];
        for (let action_name in action_name_lookup) {
            out.push(action_name);
        }
        return out;
    }



    // Renders this model to the given THREE renderer and camera.

    function render(renderer, camera) {
        model_compositor.render(renderer, camera);
    }



    return {
        setActionValue,
        getActionProperties,
        getActionNames,
        render
    };

}







function createTHREEViewer(renderer, scene, camera) {

    const loaded_models = Object.create(null);

    function loadVMOD(filename, callback) {

        if (loaded_models[filename] !== undefined) {
            throw Error('File already loaded or loading.');
        }
        loaded_models[filename] = 'PENDING';

        // Asynchronously load the VMOD file,
        BrowserVMODLoader.load(filename, (err, serialized_state) => {

            if (err !== undefined) {
                if (callback === undefined) {
                    console.error(err);
                }
                else {
                    callback(err);
                }
                return;
            }

            // Create and initialize the model target,
            const model_target = ModelTarget(filename, serialized_state, renderer);

            // Store it,
            loaded_models[filename] = model_target;

            console.log("SUCCESS loaded: %s", filename);

            // Notify,
            if (callback !== undefined) {
                callback(undefined, model_target);
            }

        });

    }


    function getLoadedModelTarget(filename) {
        return loaded_models[filename];
    }



    function updateCamera(view_width, view_height, view_scale) {
        if (view_scale === undefined) {
            view_scale = 1;
        }
        camera.left = (view_width / -2) * view_scale;
        camera.right = (view_width / 2) * view_scale;
        camera.top = (view_height / 2) * view_scale;
        camera.bottom = (view_height / -2) * view_scale;
        camera.updateProjectionMatrix();
    }


    function renderAll() {

        renderer.clear();
        for (let filename in loaded_models) {
            const model_target = loaded_models[filename];
            if (model_target !== 'PENDING') {
                model_target.render(renderer, camera);
            }
        }

        renderer.render(scene, camera);

    }




    // Return the external object,
    return {
        domElement: renderer.domElement,
        loadVMOD,
        getLoadedModelTarget,

        updateCamera,
        renderAll
    };

}



// Returns a VAnimViewer appropriate for use within a Browser. Use the
// 'domElement' property of the returned object for the element to append to
// the DOM.

function createViewer(width, height, options) {

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;

    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 1, 1000 );
    camera.left = (width / -2) * 1.5;
    camera.right = (width / 2) * 1.5;
    camera.top = (height / 2) * 1.5;
    camera.bottom = (height / -2) * 1.5;
    camera.position.x = 0;
    camera.position.y = 0;
    camera.position.z = 500;
    camera.updateProjectionMatrix();

    return createTHREEViewer(renderer, scene, camera);
}


module.exports = {
    createViewer
};
