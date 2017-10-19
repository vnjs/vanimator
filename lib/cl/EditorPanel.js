"use strict";

/* globals requestAnimationFrame */

const THREE = require('three');
const Split = require('split.js');
const KeyCode = require('key-code');

const local_store = require('./LocalStore.js')();
const geom_helper = require('./GeometryHelper.js')();

const CompositionController = require('./CompositionController.js');

const ModalDialog = require('./ModalDialog.js');
const MouseEventHandler = require('./MouseEventHandler.js');
const TreePanel = require('./TreePanel.js');
const Slider = require('./Slider.js');
const MeshEditor = require('./MeshEditor.js');
const ReplayHistory = require('./ReplayHistory.js');
const VersionableState = require('./VersionableState.js');
const AreaSelectGesture = require('./AreaSelectGesture.js');
const ModelCompositor = require('./ModelCompositor.js');
const CompositingHelper = require('./CompositingHelper.js')();

const scale_grades = [];

function produceScaleGrade() {
    for (let i = 0; i < 32; ++i) {
        scale_grades.push(1 / Math.pow(1.25, i - 16));
    }
}
produceScaleGrade();
function closestScaleGrade(grade) {
    let fi = 0;
    let curr = scale_grades[fi];
    for (let i = 0; i < scale_grades.length; ++i) {
        const val = scale_grades[i];
        if (Math.abs(grade - val) < Math.abs(grade - curr)) {
            curr = val;
            fi = i;
        }
    }
    return fi;
}


function EditorPanel(window, document) {

    const inst = {
        getSerializedState,
        getRenderer,
        lockUIForLoad,
        unlockUIForLoad,
        notify,
        notifyError
    };

    const editor = {
        getSerializedState,
        getCompositionController,
        resetLayerPoseGeometry,
        fullUpdatePoseMesh,
        checkpointHistory,
        deselectMeshes,
        refreshTreePanels,
        refreshScene,
        fullRefresh,
    };


    let threejs_cache = {};

    const mouse_evt_handler = MouseEventHandler();

    let ui_left1_content;
    let ui_left2_content;
    let ui_central_content;
    let ui_timeline_content;

    const ss = VersionableState();

    let current_selected_layer_uid;
    let current_selected_mesh_uid;
    let current_selected_mesh_layer_uid;

    let layer_blend_mode_select_el;
    let edit_mesh_mode_select_el;
    const opacity_slider = Slider(0, 100, 100);

    const mesh_editor = MeshEditor();
    let update_mesh_editor = true;
    let mesh_editor_3dobject;
    let active_mesh_editing;

    const area_select_gesture = AreaSelectGesture();
    let select_area_3dobject;

    let scene;
    let camera;
    let renderer;
    const rc_mouse_vec = new THREE.Vector2();
    let model_compositor;
    let composition_controller;

    const replay_history = ReplayHistory(ss);

    const modal_dialog = ModalDialog(window, document);
    let editor_dom;

    let view_width = 100;
    let view_height = 100;
    let view_pos_x = 0;
    let view_pos_y = 0;
    let view_scale = 1;

    let editor_view_change_active;
    let editor_view_zoom_active;

    let layers_tree_panel;
    let meshes_tree_panel;



    // Returns serialized state for read-only access only.
    // You shouldn't modify this object because it will mess up the
    // replay_history!
    function getSerializedState() {
        return ss;
    }

    function getCompositionController() {
        return composition_controller;
    }


    function getRenderer() {
        return renderer;
    }

    function updateCameraPosition() {
        // Set up camera position,
        camera.position.x = view_pos_x;
        camera.position.y = view_pos_y;
    }

    function updateCamera() {

        updateCameraPosition();

        camera.left = (view_width / -2) * view_scale;
        camera.right = (view_width / 2) * view_scale;
        camera.top = (view_height / 2) * view_scale;
        camera.bottom = (view_height / -2) * view_scale;
        camera.updateProjectionMatrix();
//        camera.needsUpdate = true;
    }

    function layoutResizeHandler() {

        view_width = ui_central_content.clientWidth;
        view_height = ui_central_content.clientHeight;

        const tc_width = ui_timeline_content.clientWidth;
        const tc_height = ui_timeline_content.clientHeight;

        // Resize the view panel,
        updateCamera();
        renderer.setSize(view_width, view_height);
        camera.position.z = 500;

    }

    // Returns a tree model of the editor content for display in the project
    // tree,
    function getTextureLayersTreeModel() {
        // Generate model,

        const out = [];

        const texture_layers = ss.getArray('texture_layers');
        if (texture_layers.isDefined()) {
            out.push(
                { type:'branch', path:[], name:'Art', uid:'Art' }
            );
            texture_layers.forEach( (layer) => {
                const layer_type = layer.get('type');
                if (layer_type === 'group') {
                    out.push({
                        type: 'branch', path: layer.get('path'),
                        name: layer.get('name'), uid: layer.get('uid'),
                        layer_type: 'group', draggable: true
                    });
                }
                else if (layer_type === 'layer') {
                    out.push({
                        type:'leaf', path:layer.get('path'),
                        name:layer.get('name'), uid:layer.get('uid'),
                        layer_type: 'layer', draggable: true
                    });
                }
                else {
                    throw Error("Unknown layer type: " + layer_type);
                }
            });
        }

        return out;

    }

    function getMeshControlTreeModel() {
        const out = [];
        const meshes = ss.getArray('meshes');
        const deformers = ss.getArray('deformers');

        if (meshes.isDefined()) {
            out.push(
                { type:'branch', path:[], name:'Meshes', uid:'Meshes' }
            );

            meshes.forEach( (mesh) => {
                const mesh_uid = mesh.get('uid');
                const name = mesh.get('name');
                out.push({
                    type: 'branch', path:[ 'Meshes' ],
                    name: name, uid: mesh_uid
                });
                // The layers attached to this mesh,
                let layers_set = mesh.get('layers_set');
                if (layers_set !== undefined) {
                    layers_set.forEach((layer_uid) => {
                        const layer_ob = getLayerFromUid(layer_uid);
                        let comp_uid = mesh_uid + ':' + layer_uid;
                        out.push({
                            type: 'leaf', path: [ 'Meshes', mesh_uid ],
                            name: layer_ob.get('name'), uid: comp_uid
                        });
                    });
                }

            });

            out.push(
                { type:'branch', path:[], name:'Deformers', uid:'Deformers' }
            );
            // PENDING:

        }
        return out;
    }


    function disposeNode(parentObject) {
        parentObject.traverse(function (node) {
            if ( node instanceof THREE.Mesh ||
                 node instanceof THREE.Points ||
                 node instanceof THREE.Line ||
                 node instanceof THREE.LineSegments ||
                 node instanceof THREE.Object3D ) {
                if (node.geometry) {
                    node.geometry.dispose();
                }
                if (node.material) {
                    let materialArray;
                    if (node.material instanceof THREE.MeshFaceMaterial || node.material instanceof THREE.MultiMaterial) {
                        materialArray = node.material.materials;
                    }
                    else if (node.material instanceof Array) {
                        materialArray = node.material;
                    }
                    if (materialArray) {
                        materialArray.forEach(function (mtrl, idx) {
                            if (mtrl.map) {
                                mtrl.map.dispose();
                            }
                            if (mtrl.lightMap) {
                                mtrl.lightMap.dispose();
                            }
                            if (mtrl.bumpMap) {
                                mtrl.bumpMap.dispose();
                            }
                            if (mtrl.normalMap) {
                                mtrl.normalMap.dispose();
                            }
                            if (mtrl.specularMap) {
                                mtrl.specularMap.dispose();
                            }
                            if (mtrl.envMap) {
                                mtrl.envMap.dispose();
                            }
                            mtrl.dispose();
                        });
                    }
                    else {
                        if (node.material.map) {
                            node.material.map.dispose();
                        }
                        if (node.material.lightMap) {
                            node.material.lightMap.dispose();
                        }
                        if (node.material.bumpMap) {
                            node.material.bumpMap.dispose();
                        }
                        if (node.material.normalMap) {
                            node.material.normalMap.dispose();
                        }
                        if (node.material.specularMap) {
                            node.material.specularMap.dispose();
                        }
                        if (node.material.envMap) {
                            node.material.envMap.dispose();
                        }
                        node.material.dispose();
                    }
                }
            }
            else {
                console.warn("Didn't dispose: ", node);
            }
        });
    }


    function refreshScene() {

        disposeNode(scene);
        const children = scene.children;
        for (let i = children.length - 1; i >= 0; --i) {
            scene.remove(children[i]);
        }

        const mid_width = ss.get('img_width') / 2;
        const mid_height = ss.get('img_height') / 2;

        // Mask off the edges at the picture boundary,
        const edge_mask_geometry = geom_helper.createMaskGeometry(
                            -mid_width, mid_height, mid_width, -mid_height);
        const edge_mask_material = new THREE.MeshBasicMaterial(
            {
                color: 0x0a0a0a0
            }
        );
        const edge_mask_mesh = new THREE.Mesh( edge_mask_geometry, edge_mask_material );
        edge_mask_mesh.position.set(0, 0, 305);
        scene.add(edge_mask_mesh);

        scene.needsUpdate = true;

        // Refresh model compositor,
        model_compositor.loadFrom(ss);

        update_mesh_editor = true;

    }

    function checkpointHistory() {
        replay_history.checkpoint();
    }

    function refreshTreePanels() {
        if (layers_tree_panel !== undefined) {
            layers_tree_panel.refresh();
        }
        if (meshes_tree_panel !== undefined) {
            meshes_tree_panel.refresh();
        }
    }

    function fullRefresh() {
        refreshScene();
        refreshTreePanels();
    }


    function getLayerFromUid(layer_uid) {
        const texture_layers = ss.getArray('texture_layers');
        return texture_layers.find((layer) => layer_uid === layer.get('uid'));
    }

    function getMeshFromUid(mesh_uid) {
        const meshes = ss.getArray('meshes');
        return meshes.find((mesh) => mesh_uid === mesh.get('uid'));
    }

    function toggleLayerVisibility(layer_uid) {
        if (layer_uid !== undefined) {
            const layer = getLayerFromUid(layer_uid);
            const cur_visible = layer.get('visible');
            layer.set('visible', (cur_visible !== true));
            // Refresh the layer panel,
            layers_tree_panel.refresh();
            // Refresh the scene,
            refreshScene();
        }
    }

    function doToggleVisibility(evt) {
        const target = evt.target;
        if (target) {
            const uid = target.vanim_layer_uid;
            if (uid !== undefined) {
                toggleLayerVisibility(uid);
            }
        }
    }

    function refreshLayerTreeControl(control_div, layer_uid) {
        if (layer_uid !== undefined) {
            const view_control = document.createElement('span');
            view_control.className = 'layer-view-icon';
            view_control.vanim_layer_uid = layer_uid;
            const layer_ob = getLayerFromUid(layer_uid);
            if (layer_ob !== undefined) {
                if (layer_ob.get('visible') !== true) {
                    view_control.classList.add('layer-view-icon-off');
                }
                view_control.addEventListener('click', doToggleVisibility);
                control_div.appendChild(view_control);
            }
        }
    }

    function refreshMeshesTreeControl(control_div, mesh_uid) {
//        console.log("PENDING: refreshMeshesTreeControl %s", mesh_uid);
//        if (mesh_uid !== undefined) {
//        }
    }

    function translateCursorToDocumentCoordinates() {
        // Calculate the real x and y coordinates in 2D coordinate space,
        const px = ((editor_dom.width / 2) * rc_mouse_vec.x);
        const py = ((editor_dom.height / 2) * rc_mouse_vec.y);
        const rpx = view_pos_x + (px * view_scale);
        const rpy = view_pos_y + (py * view_scale);
        return { x: rpx, y: rpy };
    }

    function handleViewPortLeftMouseDown(evt) {

        // PENDING: Decide how we act here depending on the mode we are
        //   currently in.


        // Mesh editing mode....

        // Calculate the cursor to coordinates in document space,
        const r = translateCursorToDocumentCoordinates();

        const shift_key = evt.shiftKey;
        const cview_scale = view_scale;

        // If a mesh is selected,
        if (current_selected_mesh_uid !== undefined) {

            // If the user clicked on a vertex location then we highlight the
            // vertex and select it. The vertex is made primary.

            let detect_size = 10 * cview_scale;
            if (shift_key) {
                detect_size = 50 * cview_scale;
            }

            const vertex_uids = mesh_editor.nearestIndexTo(r.x, r.y, detect_size);
            if (vertex_uids.length > 0) {
                // Clicked and dragged a vertex point,

                // Get the vertex index,
                const vertex_uid = vertex_uids[0];

                active_mesh_editing = {
                    selected_vertex_uid: vertex_uid,
                };

                if (!shift_key) {
                    mesh_editor.selectNone();
                }
                mesh_editor.selectVertex(vertex_uid);

                update_mesh_editor = true;

            }
            // Clicked on an area away from an index, so either we start an
            // area select gesture if shift is pressed, or create a new
            // vertex point.
            else if (shift_key) {
                // Shift is pressed,

                // Start area select gesture,
                area_select_gesture.start(r.x, r.y);

            }
            else {

                // Place a vertex at the mouse position,
                const current_primary_uid = mesh_editor.getPrimarySelectVertex();
                const new_uid = mesh_editor.addVertex(r.x, r.y);

                active_mesh_editing = {
                    selected_vertex_uid: new_uid,
                };
                active_mesh_editing.mutation = true;

                mesh_editor.selectNone();
                if (current_primary_uid !== undefined) {
                    mesh_editor.addEdge(current_primary_uid, new_uid, 1);
                    updatePoseMesh(current_selected_mesh_uid,
                                        mesh_editor.getCurrentMeshDetails());

                }
                mesh_editor.selectVertex(new_uid);

                update_mesh_editor = true;

            }

        }

    }

    function handleViewPortLeftMouseUp(evt) {

        const shift_key = evt.shiftKey;

        if (area_select_gesture.isActive()) {
            area_select_gesture.complete();

            const selected_indexes = mesh_editor.getAllSelectedIndexes();

            if (!shift_key) {
                mesh_editor.selectNone();
            }
            if (current_selected_mesh_uid !== undefined) {
                mesh_editor.selectArea(area_select_gesture);
            }
            update_mesh_editor = true;

            area_select_gesture.clear();
            if (current_selected_mesh_uid !== undefined) {
                if (!mesh_editor.isSameSelected(selected_indexes)) {
                    mesh_editor.saveTo(ss, current_selected_mesh_uid);
                    replay_history.checkpoint();
                }
            }
            return;
        }

        if (active_mesh_editing !== undefined) {
//            if (active_mesh_editing.mutation === true) {
                if (current_selected_mesh_uid !== undefined) {
                    mesh_editor.saveTo(ss, current_selected_mesh_uid);
                    replay_history.checkpoint();
                }
//            }
            active_mesh_editing = undefined;
        }
    }

    function handleVertexDrag(evt) {

        // Calculate the cursor to coordinates in document space,
        const r = translateCursorToDocumentCoordinates();

        // If the area select gesture is currently active,
        if (area_select_gesture.isActive()) {
            area_select_gesture.moveTo(r.x, r.y);
            return;
        }

        // Actively handle the vertex drag,
        if (active_mesh_editing !== undefined) {
            mesh_editor.moveSingleVertex(
                        active_mesh_editing.selected_vertex_uid, r.x, r.y);
            active_mesh_editing.mutation = true;
            update_mesh_editor = true;

            // PENDING: Handle updating pose mesh of all connected meshes,
            const mesh_details = mesh_editor.getCurrentMeshDetails();
            updatePoseMesh(current_selected_mesh_uid, mesh_details);

        }

    }


    function handleEditorMouseEvent(evt) {
//        console.log(evt);
        // If middle mouse button down,
        if (evt.type === 'mousedown') {
            // Click on vertexes, etc.
            if (evt.button === 0) {
                handleViewPortLeftMouseDown(evt);
            }
            // This is a view port scroll activation,
            else if (evt.button === 1) {
                if (evt.ctrlKey === true) {
                    editor_view_zoom_active = {
                        sx: evt.x,
                        sy: evt.y,
                        mx: rc_mouse_vec.x,
                        my: rc_mouse_vec.y,
                        start_scale: view_scale,
                    };
                }
                else {
                    editor_view_change_active = {
                        sx: evt.x,
                        sy: evt.y,
                        start_vpx: view_pos_x,
                        start_vpy: view_pos_y,
                    };
                }
            }
        }
        else if (evt.type === 'mouseup') {
            if (evt.button === 0) {
                handleViewPortLeftMouseUp(evt);
            }
            else if (evt.button === 1) {
                editor_view_change_active = undefined;
                editor_view_zoom_active = undefined;
            }
        }
        // Middle mouse drag view,
        else if (evt.type === 'mousemove') {
            // If scrolling the viewport window,
            if (editor_view_change_active !== undefined) {
                const ev = editor_view_change_active;
                view_pos_x = ev.start_vpx +
                        ((ev.sx - evt.x) * view_scale);
                view_pos_y = ev.start_vpy -
                        ((ev.sy - evt.y) * view_scale);
            }
            else if (editor_view_zoom_active !== undefined) {
                const ev = editor_view_zoom_active;
                const zx = ev.sx - evt.x;
                const zy = ev.sy - evt.y;

                let dst;
                if (Math.abs(zx) > Math.abs(zy)) {
                    dst = zx;
                }
                else {
                    dst = zy;
                }

                let nscale = ev.start_scale * (1 + (dst / 250));

                // Clamp scale,
                const min_scale = scale_grades[scale_grades.length - 1];
                const max_scale = scale_grades[0];
                if (nscale < min_scale) {
                    nscale = min_scale;
                }
                if (nscale > max_scale) {
                    nscale = max_scale;
                }

                const px = ((editor_dom.width / 2) * ev.mx);
                const py = ((editor_dom.height / 2) * ev.my);

                // This keeps the position consistent relative to the
                // zoom position,
                view_pos_x += (px * view_scale) - (px * nscale);
                view_pos_y += (py * view_scale) - (py * nscale);

                view_scale = nscale;
                updateCamera();

            }
            handleVertexDrag(evt);
        }
    }

    function handleViewPortMouseEvent(evt) {
        if (evt.type === 'mousemove') {
            const mx = (( evt.offsetX / editor_dom.width ) * 2) - 1;
            const my = -(( evt.offsetY / editor_dom.height ) * 2) + 1;
            rc_mouse_vec.x = mx;
            rc_mouse_vec.y = my;
        }
    }

    function handleViewPortWheelEvent(evt) {
        if (evt.type === 'wheel') {
            const delta_y = evt.deltaY;
            let grade_dif = 0;
            if (delta_y < 0) {
                // Wheel up,
                grade_dif = 1;
            }
            else if (delta_y > 0) {
                // Wheel down,
                grade_dif = -1;
            }
            if (grade_dif !== 0) {
                const scale_grade_i = closestScaleGrade(view_scale);
                const nscale = scale_grades[scale_grade_i + grade_dif];
                if (nscale !== undefined) {

                    const px = ((editor_dom.width / 2) * rc_mouse_vec.x);
                    const py = ((editor_dom.height / 2) * rc_mouse_vec.y);

                    // This keeps the position consistent relative to the
                    // zoom position,
                    view_pos_x += (px * view_scale) - (px * nscale);
                    view_pos_y += (py * view_scale) - (py * nscale);

                    view_scale = nscale;
                    updateCamera();

                }
            }
        }
    }


    function handleUndoEvent() {
        const did_undo = replay_history.undo();
        if (!did_undo) {
            console.log("Nothing to Undo!");
        }
        else {
            if (current_selected_mesh_uid !== undefined) {
                mesh_editor.loadFrom(ss, current_selected_mesh_uid);
            }
            fullRefresh();
        }
    }

    function handleRedoEvent() {
        const did_redo = replay_history.redo();
        if (!did_redo) {
            console.log("Nothing to Redo!");
        }
        else {
            if (current_selected_mesh_uid !== undefined) {
                mesh_editor.loadFrom(ss, current_selected_mesh_uid);
            }
            fullRefresh();
        }
    }

    function handleEditorKeyDown(evt) {
        const kc = evt.keyCode;
        const c = evt.key;

        // Look for undo/redo action,
        if (c === 'z') {
            // ISSUE: This key is currently hard-coded. It will be difficult
            //   not to hard-code this because of the way the undo action we
            //   need to override is built into Chromium.
            // CTRL+Z and SHIFT-CTRL-Z
            if (evt.ctrlKey === true) {
                if (evt.shiftKey === true) {
                    handleRedoEvent();
                }
                else {
                    handleUndoEvent();
                }
                evt.preventDefault();
            }
        }


        // If a layer is selected,
        if (current_selected_mesh_uid !== undefined) {

            if (kc === KeyCode.DELETE) {

                // Delete all selected vertexes,
                mesh_editor.deleteSelectedVertices();
                updatePoseMesh(current_selected_mesh_uid,
                                    mesh_editor.getCurrentMeshDetails());

                update_mesh_editor = true;
                active_mesh_editing = undefined;

                mesh_editor.saveTo(ss, current_selected_mesh_uid);
                replay_history.checkpoint();

            }
            else if (kc === KeyCode.ESC) {
                console.log("ESC PRESSED!");
                ss.debug();
            }
            // Fill line or face,
            else if (c === 'f') {
                const selected_uids = mesh_editor.getAllSelectedIndexes();
                // Edge fill,
                if (selected_uids.length === 2) {
                    mesh_editor.addEdge(selected_uids[0], selected_uids[1], 1);
                    updatePoseMesh(current_selected_mesh_uid,
                                        mesh_editor.getCurrentMeshDetails());

                    update_mesh_editor = true;
                }
                // else if (selected_i.length > 2) {
                //     mesh_editor.computeFacesFromSelected();
                //     update_mesh_editor = true;
                // }

                mesh_editor.saveTo(ss, current_selected_mesh_uid);
                replay_history.checkpoint();

            }

        }

//        console.log("KEY DOWN:");
//        console.log(evt);
    }


    function selectLayer(uid) {
        const layer_ob = getLayerFromUid(uid);
        current_selected_layer_uid = uid;
        current_selected_mesh_uid = undefined;
        current_selected_mesh_layer_uid = undefined;
        // Clear mesh editor,
        mesh_editor.clear();
        // Enable and set the opacity and blend mode,
        const blend_mode = layer_ob.get('blend');
        opacity_slider.setValue(layer_ob.get('opacity') * 100);
        opacity_slider.enable();
        layer_blend_mode_select_el.value = blend_mode;
        layer_blend_mode_select_el.disabled = false;
    }

    function parseMeshLayerUid(mesh_layer_uid) {
        const delim = mesh_layer_uid.indexOf(':');
        let mesh_uid;
        let layer_uid;
        if (delim < 0) {
            mesh_uid = mesh_layer_uid;
            layer_uid = null;
        }
        else {
            mesh_uid = mesh_layer_uid.substring(0, delim);
            layer_uid = mesh_layer_uid.substring(delim + 1);
        }
        return { mesh_uid, layer_uid };
    }


    function selectMesh(uid) {
        const { mesh_uid } = parseMeshLayerUid(uid);
        const mesh_ob = getMeshFromUid(uid);
        current_selected_layer_uid = undefined;
        current_selected_mesh_uid = mesh_uid;
        current_selected_mesh_layer_uid = uid;
        // Set up the mesh editor,
        mesh_editor.loadFrom(ss, mesh_uid);
    }


    function deselectLayers() {
        current_selected_layer_uid = undefined;
        opacity_slider.disable();
        layer_blend_mode_select_el.disabled = true;
        layers_tree_panel.deselectAll();
    }

    function deselectMeshes() {
        current_selected_mesh_uid = undefined;
        current_selected_mesh_layer_uid = undefined;
        meshes_tree_panel.deselectAll();
        mesh_editor.clear();
    }



    function handleLayerSelectChange(evt) {
        const selected = evt.selected_elements;
        if (selected.length === 0) {
            deselectLayers();
        }
        else {
            const uid = selected[selected.length - 1];
            // UID will either reference a layer or group. Find out which,
            const layer_ob = getLayerFromUid(uid);
            if (layer_ob !== undefined) {
                selectLayer(uid);
            }
        }

        refreshScene();
        if (meshes_tree_panel !== undefined) {
            deselectMeshes();
            meshes_tree_panel.refresh();
        }
    }


    function handleMeshesSelectChange(evt) {
        const selected = evt.selected_elements;
        if (selected.length === 0) {
            deselectMeshes();
        }
        else {
            const uid = selected[selected.length - 1];
            // UID will reference either a mesh or deformer,
            selectMesh(uid);
        }


        refreshScene();
        if (layers_tree_panel !== undefined) {
            deselectLayers();
            layers_tree_panel.refresh();
        }
    }


    // Handle drop on the meshes instance,

    function handleMeshesDrop(evt) {

        const drop_target_uid = evt.drop_target_uid;
        const drop_data = evt.drop_data;

        const tob = parseMeshLayerUid(drop_target_uid);
        const target_mesh_uid = tob.mesh_uid;
        const target_layer_uid = tob.layer_uid;

        const mesh_ob = getMeshFromUid(target_mesh_uid);

        if (mesh_ob !== undefined) {

            const layer_type = drop_data.layer_type;
            if (layer_type === 'layer') {
                const layer_uid = drop_data.uid;

                const layer_ob = getLayerFromUid(layer_uid);

                if (layer_ob !== undefined) {

                    // Check layer isn't already assigned to a mesh,
                    const mesh_uid_for_layer = layer_ob.get('mesh_uid_for_layer');
                    if (mesh_uid_for_layer === undefined) {
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
                        layer_ob.set('mesh_uid_for_layer', target_mesh_uid);

                        fullUpdatePoseMesh(target_mesh_uid);

                        meshes_tree_panel.refresh();

                        replay_history.checkpoint();

                        console.log("UPDATED: ", mesh_ob.get('layers_set'));
                    }
                    else {
                        console.error("Layer already assigned a mesh.");
                        console.error("PENDING: Report this in UI dialog.");
                    }

                }

            }
            else if (layer_type === 'group') {
                console.log("PENDING: drag/drop group");
            }

        }

    }


    function handleMeshModeChange(evt) {
        const mode_change_value = evt.target.value;
        model_compositor.setViewMode(mode_change_value);
        mesh_editor.setMode(mode_change_value);
        const mesh_uid = current_selected_mesh_uid;
        if (mesh_uid !== undefined) {
            mesh_editor.loadFrom(ss, mesh_uid);
        }
        update_mesh_editor = true;
        refreshScene();
    }

    function handleBlendModeChange(evt) {
        const updateLayerBlendMode = require('./actions/updateLayerBlendMode.js');
        const new_layer_blend_mode = layer_blend_mode_select_el.value;
        updateLayerBlendMode(editor, current_selected_layer_uid, new_layer_blend_mode);
    }

    function handleLayerOpacityChange(evt) {
        const opacity_value = (opacity_slider.getValue() / 100);
        const updateLayerOpacity = require('./actions/updateLayerOpacity.js');
        updateLayerOpacity(editor, current_selected_layer_uid, opacity_value);
    }

    function addEmptyMesh(mesh_name) {
        const addEmptyMeshToMeshes = require('./actions/addEmptyMeshToMeshes.js');
        addEmptyMeshToMeshes(editor, mesh_name);
    }

    function doAddMeshAction() {
        modal_dialog.setForm({
            type: 'simple_text',
            title: 'Enter the name of the new mesh:',
            accept: (form) => {
                const mesh_name = form.fields.value;
                addEmptyMesh(mesh_name);
            }
        });
        modal_dialog.show();
    }


    function doRemoveMeshAction() {
        if (current_selected_mesh_layer_uid !== undefined) {

            const { mesh_uid, layer_uid } =
                            parseMeshLayerUid(current_selected_mesh_layer_uid);
            const deleteMeshFromMeshes =
                            require('./actions/deleteMeshFromMeshes.js');
            deleteMeshFromMeshes(editor, mesh_uid, layer_uid);

        }
    }




    function layout() {

        // Stores the tree panel,
        ui_left1_content = document.querySelector('#ui_left1_content');
        ui_left2_content = document.querySelector('#ui_left2_content');
        ui_central_content = document.querySelector('#ui_central_content');
        ui_timeline_content = document.querySelector('#ui_timeline_content');

        // Load split pane state from local storage,
        const layoutk1_sizes = local_store.load('layoutk1_sizes', [10, 10, 80]);
        const layoutk2_sizes = local_store.load('layoutk2_sizes', [80, 20]);

        // Create split layout,
        const lk1_split =
                Split(['#control_panel1', '#control_panel2', '#central_panel'], {
            gutterSize: 8,
            cursor: 'col-resize',
            sizes: layoutk1_sizes,
            minSize: [100, 100, 240],
            snapOffset: 0,
            onDrag: layoutResizeHandler,
            onDragEnd: () => local_store.save('layoutk1_sizes', lk1_split.getSizes())
        });

        const lk2_split =
                Split(['#ui_central_content', '#ui_timeline_content'], {
            direction: 'vertical',
            gutterSize: 8,
            cursor: 'row-resize',
            sizes: layoutk2_sizes,
            minSize: [240, 8],
            snapOffset: 0,
            onDrag: layoutResizeHandler,
            onDragEnd: () => local_store.save('layoutk2_sizes', lk2_split.getSizes())
        });


        // The tree panel for managing meshes,
        meshes_tree_panel = TreePanel(getMeshControlTreeModel);
        meshes_tree_panel.setControlRefresh(refreshMeshesTreeControl);
        meshes_tree_panel.addEventListener('select', handleMeshesSelectChange);
        meshes_tree_panel.addEventListener('drop', handleMeshesDrop);

        // Set the layers tree view,
        layers_tree_panel = TreePanel(getTextureLayersTreeModel);
        layers_tree_panel.setControlRefresh(refreshLayerTreeControl);
        layers_tree_panel.addEventListener('select', handleLayerSelectChange);

        opacity_slider.domElement.className = 'noselect opacity-slider';
        const blend_pulldown = document.createElement('div');
        blend_pulldown.innerHTML = `
<select id="layer_blend_mode" disabled>
  <option value="svg:src-over">Normal</option>
  <option value="svg:src-over-inherit-alpha">Normal Inherit Alpha</option>
  <option value="svg:multiply">Multiply</option>
  <option value="svg:addition">Addition</option>
  <option value="svg:subtract">Subtract</option>
  <option value="svg:erase">Erase</option>
</select>
`;

        const texture_layer_tree_actions = document.createElement('div');
        texture_layer_tree_actions.className = 'noselect layers-tree-actions';
        texture_layer_tree_actions.appendChild(blend_pulldown);
        texture_layer_tree_actions.appendChild(opacity_slider.domElement);

        // Disable the opacity slider,
        opacity_slider.disable();

        const texture_layer_tree_content = document.createElement('div');
        texture_layer_tree_content.className = 'noselect layers-tree-content';
        texture_layer_tree_content.appendChild(layers_tree_panel.domElement);

        const mesh_tree_content = document.createElement('div');
        mesh_tree_content.className = 'noselect mesh-tree-content';
        mesh_tree_content.appendChild(meshes_tree_panel.domElement);

        ui_left1_content.appendChild(mesh_tree_content);

        ui_left2_content.appendChild(texture_layer_tree_actions);
        ui_left2_content.appendChild(texture_layer_tree_content);

        const editor_buttonbar = document.createElement('div');
        editor_buttonbar.className = 'noselect editor_buttonbar';
        editor_buttonbar.innerHTML = `
<div class='editor-button'><div class='editor-pencil-icon'></div></div>
<div class='editor-button'><div class='editor-tools-icon'></div></div>
`;

        const editor_actionbar = document.createElement('div');
        editor_actionbar.className = 'noselect editor_actionbar';
        editor_actionbar.innerHTML = `
<select id="edit_mesh_mode">
  <option value="edit">Edit Mode</option>
  <option value="pose">Pose Mode</option>
</select>
`;

        // Set view port,
        editor_dom = renderer.domElement;
        editor_dom.className = 'noselect editor_canvas';
        ui_central_content.appendChild(editor_buttonbar);
        ui_central_content.appendChild(editor_dom);
        ui_central_content.appendChild(editor_actionbar);

        // Capture mouse events on the editor panel,
        mouse_evt_handler.captureMouseEvents(editor_dom, handleEditorMouseEvent);
        editor_dom.addEventListener('mousemove', handleViewPortMouseEvent, false);
        editor_dom.addEventListener('wheel', handleViewPortWheelEvent, false);

        editor_dom.unselectable = "on";
        editor_dom.onselectstart = function() {
            return false;
        };
        editor_dom.style.userSelect = "none";
        editor_dom.style.MozUserSelect = "none";

        layer_blend_mode_select_el =
                                document.getElementById('layer_blend_mode');
        edit_mesh_mode_select_el =
                                document.getElementById('edit_mesh_mode');

        // UI Event handlers,
        layer_blend_mode_select_el.addEventListener(
                                'change', handleBlendModeChange, false);
        edit_mesh_mode_select_el.addEventListener(
                                'change', handleMeshModeChange, false);
        opacity_slider.addEventListener(
                                'input', handleLayerOpacityChange, false);

        document.addEventListener('keydown', handleEditorKeyDown, false);

    }

    function renderCall(time) {

        requestAnimationFrame(renderCall);

//        camera.rotation.z += 0.05 * Math.PI / 180;

        // Add select gesture area to the scene,
        const sarea_ob = area_select_gesture.createThreeEdgesOb();
        if (select_area_3dobject !== sarea_ob) {
            if (select_area_3dobject !== undefined) {
                disposeNode(select_area_3dobject);
                scene.remove(select_area_3dobject);
            }
            select_area_3dobject = sarea_ob;
            if (select_area_3dobject !== undefined) {
                scene.add(select_area_3dobject);
            }
        }

        // Update editing mesh if necessary,
        if (update_mesh_editor === true) {
            if (mesh_editor_3dobject !== undefined) {
                disposeNode(mesh_editor_3dobject);
                scene.remove(mesh_editor_3dobject);
            }
            const edges_ob = mesh_editor.createEdgesOb();
            const faces_ob = mesh_editor.createFacesOb();
            const unselect_points_ob = mesh_editor.createUnselectedPointsOb();
            const select_points_ob = mesh_editor.createSelectedPointsOb();
            const pselect_points_ob = mesh_editor.createPrimarySelectedPointsOb();

            mesh_editor_3dobject = new THREE.Object3D();
            mesh_editor_3dobject.add(
                edges_ob,
                faces_ob,
                unselect_points_ob,
                select_points_ob,
                pselect_points_ob
            );
            scene.add(mesh_editor_3dobject);

            update_mesh_editor = false;
        }

        updateCameraPosition();

        renderer.clear();
        if (model_compositor !== undefined) {
            const img_width = ss.get('img_width');
            const img_height = ss.get('img_height');
            model_compositor.render(renderer, camera, img_width, img_height);
        }

        renderer.render(scene, camera);

    }


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

    function fullUpdatePoseMesh(mesh_uid) {
        updatePoseMeshObject(ss.getArray('meshes').get(mesh_uid));
    }

    function resetLayerPoseGeometry(layer_uid) {
        composition_controller.updatePoseGeometry(layer_uid, [], []);
    }




    function initializeLoadedState() {

        threejs_cache = {};
        composition_controller = CompositionController(threejs_cache);

        const texture_layers = ss.getArray('texture_layers');
        texture_layers.forEach((layer) => {

            const layer_type = layer.get('type');
            if (layer_type === 'layer') {

                const power = layer.get('raw_texture_power');
                const tex_type = layer.get('raw_texture_type');
                const pixels = layer.get('$raw_texture_pixels').data;

                // Initialize the three.js specific data,
                // Create the threejs specific texture data
                const renderer = getRenderer();
                const max_anisotropy = renderer.capabilities.getMaxAnisotropy();

                const layer_name = layer.get('name');
                let layer_blend = layer.get('blend');

                console.log(layer_name);

                // HACK, Until we have a way to set this up in the UI...
                if ( layer_blend === 'svg:src-over' &&
                     layer_name.startsWith('I ') ) {
                    console.error("Added -inherit-alpha to blend mode because layer name starts with 'I ': '%s'", layer_name);
                    layer_blend += '-inherit-alpha';
                }

                layer.set('blend', layer_blend);

                let three_format;
                if (tex_type === 'RGB') {
                    three_format = THREE.RGBFormat;
                }
                else if (tex_type === 'RGBA') {
                    three_format = THREE.RGBAFormat;
                }
                else {
                    throw Error('Unknown layer texture format: ' + tex_type);
                }

                const texture = new THREE.DataTexture(
                                    pixels, power, power,
                                    three_format, THREE.UnsignedByteType);
                texture.generateMipmaps = true;
                texture.magFilter = THREE.LinearFilter;
//                texture.minFilter = THREE.LinearMipMapLinearFilter;
                texture.minFilter = THREE.NearestMipMapNearestFilter;

//                texture.minFilter = THREE.NearestFilter;
                texture.anisotropy = max_anisotropy < 4 ? max_anisotropy : 4;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.needsUpdate = true;
                texture.premultiplyAlpha = true;

                texture.name = layer_name;

                const layer_x = layer.get('x');
                const layer_y = layer.get('y');
                const layer_width = layer.get('width');
                const layer_height = layer.get('height');
                const tex_width = texture.image.width;
                const tex_height = texture.image.height;

                // The presentation mesh.
                // This is a simple rectangle mesh with an image material of
                // the layer.
                const present_geometry =
                        geom_helper.createSquareBillboardGeometry(
                            layer_x, layer_y, layer_width, layer_height,
                            tex_width, tex_height);

                const present_material = CompositingHelper.createPreMultAlphaMaterial();
                present_material.uniforms.texture.value = texture;
                present_material.needsUpdate = true;

                // const present_material = new THREE.MeshBasicMaterial(
                //   {
                //      transparent: true,
                //      premultipliedAlpha: false,
                //      color: 0x0ff9090,
                //      map: texture,
                //      opacity: 1,
                //   }
                // );

                const present_mesh = new THREE.Mesh(
                                        present_geometry, present_material );

                // The pose mesh.
                // This is a complex polygon shape with the image material uv
                // aligned on it.
                const pose_geometry = geom_helper.createPolygonBillboardGeometry(
                        [], [],
                        layer_x, layer_y, layer_width, layer_height,
                        tex_width, tex_height);

                const pose_material = CompositingHelper.createPreMultAlphaMaterial();
                pose_material.uniforms.texture.value = texture;
                pose_material.needsUpdate = true;

                // const pose_material = new THREE.MeshBasicMaterial(
                //   {
                //      transparent: true,
                //      premultipliedAlpha: true,
                //      map: texture,
                //      opacity: 1,
                //   }
                // );

                const pose_mesh = new THREE.Mesh(
                                            pose_geometry, pose_material );

                const dimension = {
                    x: layer_x,
                    y: layer_y,
                    width: layer_width,
                    height: layer_height
                };

                // Put data in a local cache,
                threejs_cache[layer.get('uid')] = {
                    texture, dimension,
                    present_mesh, present_geometry, present_material,
                    pose_mesh, pose_geometry, pose_material
                };

                composition_controller.updateLayerBlendMode(
                                            layer.get('uid'), layer_blend);

            }

        });

        // For each mesh, update the pose mesh,
        const meshes = ss.getArray('meshes');
        meshes.forEach((mesh_ob) => {
            updatePoseMeshObject(mesh_ob);
        });

        model_compositor = ModelCompositor(threejs_cache);
        model_compositor.loadFrom(ss);

        // Make sure the 'Art' group is open in the tree view,
        layers_tree_panel.openGroup('Art');

        current_selected_layer_uid = undefined;
        current_selected_mesh_uid = undefined;
        current_selected_mesh_layer_uid = undefined;
        active_mesh_editing = undefined;
        mesh_editor.clear();

        // Clear the reply history,
        replay_history.clear();
        // Checkpoint it at initial position,
        replay_history.checkpoint();


        refreshScene();

        // Refresh layout,
        layers_tree_panel.deselectAll();
        layers_tree_panel.refresh();
        meshes_tree_panel.deselectAll();
        meshes_tree_panel.refresh();

    }




    function lockUIForLoad() {
        console.log("LOCK UI");
    }

    function unlockUIForLoad() {
        console.log("UNLOCK UI");
    }

    function notify(event_type, ...args) {
        if (event_type === 'import_vmod') {
            const [ loaded_serialized_state ] = args;
            ss.load(loaded_serialized_state);
            initializeLoadedState();
        }
        else if (event_type === 'load_vmod') {
            const [ loaded_serialized_state ] = args;
            ss.load(loaded_serialized_state);
            initializeLoadedState();
        }
        else if (event_type === 'global_undo') {
            handleUndoEvent();
        }
        else if (event_type === 'global_redo') {
            handleRedoEvent();
        }
        else if (event_type === 'add_mesh') {
            doAddMeshAction();
        }
        else if (event_type === 'remove_mesh') {
            doRemoveMeshAction();
        }
        else {
            console.error("UNKNOWN EVENT: %s %o", event_type, args);
        }
    }

    function notifyError(event_type, err) {
        console.error("Error type: %s", event_type);
        console.error(err);
    }

    // Initialize the UI

    function init() {

        // Create the three js scene,
        scene = new THREE.Scene();

        renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
        });
        renderer.setSize(view_width, view_height);
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = false;

        camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 1, 1000 );

        window.addEventListener("resize", layoutResizeHandler, false);

        // Layout the UI split panes,
        layout();

        // Dispatch a resize event to layout the components,
        layoutResizeHandler();

        // Add renderCall into animation loop,
        requestAnimationFrame(renderCall);

        // ---- Electron Specifics ----
        // Set the menu in the UI,

        const CLElectron = require('./CLElectron.js');
        const electron_inst = CLElectron(inst);

        // setTimeout( () => {
        //     electron_inst.importLocalFile('../../../art/vanimator/tests/C1_Test.ora');
        // }, 100);

    }
    init();


    // Exported API
    return inst;

}

module.exports = EditorPanel;
