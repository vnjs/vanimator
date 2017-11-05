"use strict";

/* globals requestAnimationFrame */

const THREE = require('three');
const Split = require('split.js');
const KeyCode = require('key-code');

const local_store = require('./LocalStore.js')();
const geom_helper = require('./GeometryHelper.js')();

const CompositionController = require('./CompositionController.js');

const TimeLine = require('./timeline/TimeLine.js');
const ActionsTimeLineOpts = require('./ActionsTimeLineOpts.js');

const ModalDialog = require('./ModalDialog.js');
const MouseEventHandler = require('./MouseEventHandler.js');
const TreePanel = require('./TreePanel.js');
const ActionsListPanel = require('./ActionsListPanel.js');
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
        deselectLayers,
        refreshTreePanels,
        refreshScene,
        fullRefresh,
        initializeTextureLayers,
    };


    let threejs_cache = {};

    const mouse_evt_handler = MouseEventHandler();

    let ui_left1_content;
    let ui_left2_content;
    let ui_left3_content;
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

    const editing_properties = {};

    let editor_view_change_active;
    let editor_view_zoom_active;

    const edit_tools = [];
    let last_edit_ob;
    let current_tool_mode;

    let layers_tree_panel;
    let meshes_tree_panel;
    let actions_list_panel;
    let time_line_panel;



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

        if (time_line_panel !== undefined) {
            time_line_panel.layoutFromResize();
        }

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
            texture_layers.forEach( (layer_ob) => {
                const layer_type = layer_ob.get('type');
                if (layer_type === 'group') {
                    out.push({
                        type: 'branch', path: layer_ob.get('path'),
                        name: layer_ob.get('name'), uid: layer_ob.get('uid'),
                        layer_type: 'group', draggable: true
                    });
                }
                else if (layer_type === 'layer') {
                    out.push({
                        type: 'leaf', path: layer_ob.get('path'),
                        name: layer_ob.get('name'), uid: layer_ob.get('uid'),
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
                    name: name, uid: mesh_uid,
                    root_mesh_name: name, root_mesh_uid: mesh_uid, draggable: true
                });
                // The layers attached to this mesh,
                let layers_set = mesh.get('layers_set');
                if (layers_set !== undefined) {
                    layers_set.forEach((layer_uid) => {
                        const layer_ob = getLayerFromUid(layer_uid);
                        let comp_uid = mesh_uid + ':' + layer_uid;
                        out.push({
                            type: 'leaf', path: [ 'Meshes', mesh_uid ],
                            name: layer_ob.get('name'), uid: comp_uid,
                            root_mesh_name: name, root_mesh_uid: mesh_uid, draggable: true
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

    function refreshSelectedMesh() {
        if (current_selected_mesh_uid !== undefined) {
            mesh_editor.loadFrom(ss, current_selected_mesh_uid);
        }
    }

    function refreshTreePanels() {
        if (layers_tree_panel !== undefined) {
            layers_tree_panel.refresh();
        }
        if (meshes_tree_panel !== undefined) {
            meshes_tree_panel.refresh();
        }
        if (actions_list_panel !== undefined) {
            actions_list_panel.refresh();
        }
    }

    function refreshAllPoseMeshes() {
        const meshes = ss.getArray('meshes');
        meshes.forEach((mesh_ob) => {
            updatePoseMeshObject(mesh_ob);
        });
    }

    function fullRefresh() {
        refreshScene();
        refreshTreePanels();
        refreshAllPoseMeshes();
        refreshSelectedMesh();
    }


    function isInMeshModeEdit() {
        const mesh_edit_tool_active = (current_tool_mode === 'mesh_edit_mode');
        return ( mesh_editor.getMode() === 'edit' &&
                 mesh_edit_tool_active === true );
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



    function createWeightedVertexSelection() {
        let vert_move_radius = editing_properties.vertex_move_radius;
        if (vert_move_radius === undefined) {
            vert_move_radius = 0;
        }
        return mesh_editor.createWeightedSelection(vert_move_radius);
    }

    function createWeightedCurvePointsSelection(curve_2d_line) {
        let point_move_radius = editing_properties.vertex_move_radius;
        if (point_move_radius === undefined) {
            point_move_radius = 0;
        }
        return curve_2d_line.createWeightedSelection(point_move_radius);
    }



    // Places a vertex at the given x/y coordinates (document space).
    function placeVertex(r) {
        const current_primary_uid = mesh_editor.getPrimarySelectVertex();
        const new_uid = mesh_editor.addVertex(r.x, r.y);

        mesh_editor.selectNone();
        if (current_primary_uid !== undefined) {
            mesh_editor.addEdge(current_primary_uid, new_uid, 1);
            updatePoseMesh(current_selected_mesh_uid,
                                    mesh_editor.getCurrentMeshDetails());
        }
        mesh_editor.selectVertex(new_uid);

        const weighted_selection = createWeightedVertexSelection();
        active_mesh_editing = {
            edit_class: 'vertex',
            edit_type: 'translate',
            selected_vertex_uid: new_uid,
            weighted_selection: weighted_selection,
            edit_r_start: r
        };

        update_mesh_editor = true;
    }

    function placeCurveControlPoint(r) {
        const curve_2d_line = mesh_editor.getCurvedDeformerLine();
        const point_uid = curve_2d_line.addVertexPoint(r.x, r.y);

        curve_2d_line.selectNone();
        curve_2d_line.selectPoint(point_uid);

        const weighted_selection = createWeightedCurvePointsSelection(curve_2d_line);
        active_mesh_editing = {
            edit_class: 'curve_point',
            edit_type: 'translate',
            selected_point_uid: point_uid,
            weighted_selection: weighted_selection,
            edit_r_start: r
        };

        update_mesh_editor = true;
    }


    function startMeshEdit(r, edit_type) {
        const weighted_selection = createWeightedVertexSelection();
        active_mesh_editing = {
            edit_class: 'vertex',
            edit_type,
            weighted_selection: weighted_selection,
            edit_r_start: r
        };
        update_mesh_editor = true;
    }

    function startCurveEdit(r, edit_type) {
        const curve_2d_line = mesh_editor.getCurvedDeformerLine();
        const weighted_selection = createWeightedCurvePointsSelection(curve_2d_line);
        active_mesh_editing = {
            edit_class: 'curve_point',
            edit_type,
            weighted_selection: weighted_selection,
            edit_r_start: r
        };
        update_mesh_editor = true;
    }



    function handleMouseDownOnControl(r, view_scale, shift_key) {

        // If the user clicked on a vertex location then we highlight the
        // vertex and select it. The vertex is made primary.

        let detect_size = 10 * view_scale;
        if (shift_key) {
            detect_size = 50 * view_scale;
        }

        // Select on mesh,
        if (current_tool_mode === 'mesh_edit_mode') {

            // Select the vertex if near to click
            const vertex_uid = mesh_editor.nearestIndexTo(r.x, r.y, detect_size);
            if (vertex_uid === undefined) {
                return false;
            }

            // Clicked and dragged a vertex point,

            if (!shift_key) {
                mesh_editor.selectNone();
            }
            mesh_editor.selectVertex(vertex_uid);

            startMeshEdit(r, 'translate');

            return true;

        }
        else if (current_tool_mode === 'curve_mode') {

            const curve_2d_line = mesh_editor.getCurvedDeformerLine();
            const point_uid =
                    curve_2d_line.nearestPointUidTo(r.x, r.y, detect_size);
            if (point_uid === undefined) {
                return false;
            }

            if (!shift_key) {
                curve_2d_line.selectNone();
            }
            curve_2d_line.selectPoint(point_uid);

            startCurveEdit(r, 'translate');

            return true;
        }

        return false;

    }


    function handleViewPortLeftMouseDown(evt) {

        // PENDING: Decide how we act here depending on the mode we are
        //   currently in.


        // Mesh editing mode....

        // Calculate the cursor to coordinates in document space,
        const r = translateCursorToDocumentCoordinates();

        const shift_key = evt.shiftKey;

        // If a mesh is selected,
        if (current_selected_mesh_uid !== undefined) {

            const handled = handleMouseDownOnControl(r, view_scale, shift_key);

            // Clicked on an area away from an index, so either we start an
            // area select gesture if shift is pressed, or create a new
            // vertex point.
            if (!handled) {
                if (shift_key) {
                    // Shift is pressed,

                    // Start area select gesture,
                    area_select_gesture.start(r.x, r.y);

                }
                else if (isInMeshModeEdit()) {
                    // Place a vertex at the mouse position if mesh edit
                    // mode,
                    placeVertex(r);
                }
                else if (current_tool_mode === 'curve_mode') {
                    // Place a control point in curve mode,
                    placeCurveControlPoint(r);
                }
            }

        }

    }

    function handleCompleteAreaSelectGesture(evt) {
        const shift_key = evt.shiftKey;

        area_select_gesture.complete();

        let editor;
        if (current_tool_mode === 'mesh_edit_mode') {
            editor = mesh_editor;
        }
        else if (current_tool_mode === 'curve_mode') {
            const curved_2d_line = mesh_editor.getCurvedDeformerLine();
            editor = curved_2d_line;
        }
        else {
            throw Error('Unknown tool mode: ' + current_tool_mode);
        }

        const selected_indexes = editor.getAllSelectedIndexes();

        if (!shift_key) {
            editor.selectNone();
        }
        if (current_selected_mesh_uid !== undefined) {
            editor.selectArea(area_select_gesture);
        }
        update_mesh_editor = true;

        area_select_gesture.clear();
        if (current_selected_mesh_uid !== undefined) {
            // Only checkpoint if the selection was changed by this
            // operation,
            if (!editor.isSameSelected(selected_indexes)) {
                mesh_editor.saveTo(ss, current_selected_mesh_uid);
                replay_history.checkpoint();
            }
        }
    }

    function handleCompleteMeshEditing(evt) {
        if (current_selected_mesh_uid !== undefined) {
            mesh_editor.saveTo(ss, current_selected_mesh_uid);
            replay_history.checkpoint();
        }
        active_mesh_editing = undefined;
    }



    function handleVertexDrag(evt) {

        // Calculate the cursor to coordinates in document space,
        const r = translateCursorToDocumentCoordinates();

        // If the area select gesture is currently active,
        if ( area_select_gesture.isActive() ) {
            area_select_gesture.moveTo(r.x, r.y);
            return;
        }

        // Actively handle the vertex drag,
        if (active_mesh_editing !== undefined) {
            const edit_class = active_mesh_editing.edit_class;
            if (edit_class === 'vertex') {
                editVertexesAction(r);
            }
            else if (edit_class === 'curve_point') {
                editDeformLineAction(r);
            }
            else {
                throw Error('Unknown edit class: ' + edit_class);
            }
        }

    }


    function handleEditorMouseEvent(evt) {
//        console.log(evt);
        // If middle mouse button down,
        if (evt.type === 'mousedown') {
            // Focus the renderer,
            renderer.domElement.focus();
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
            if (active_mesh_editing !== undefined) {
                handleCompleteMeshEditing(evt);
            }
            else if (area_select_gesture.isActive()) {
                handleCompleteAreaSelectGesture(evt);
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
            fullRefresh();
        }
    }

    function handleRedoEvent() {
        const did_redo = replay_history.redo();
        if (!did_redo) {
            console.log("Nothing to Redo!");
        }
        else {
            fullRefresh();
        }
    }

    function startInteractiveTransform(edit_type) {
        mouse_evt_handler.startMouseMoveCaptureEvents();
        // Calculate the cursor to coordinates in document space,
        const r = translateCursorToDocumentCoordinates();

        // Interactive transform on mesh edit mode,
        if (current_tool_mode === 'mesh_edit_mode') {
            startMeshEdit(r, edit_type);
        }
        else if (current_tool_mode === 'curve_mode') {
            startCurveEdit(r, edit_type);
        }
        else {
            throw Error('Unknown tool mode: ' + current_tool_mode);
        }
    }

    function toggleAllSelection() {
        let editor;
        if (current_tool_mode === 'mesh_edit_mode') {
            editor = mesh_editor;
        }
        else if (current_tool_mode === 'curve_mode') {
            const curved_2d_line = mesh_editor.getCurvedDeformerLine();
            editor = curved_2d_line;
        }
        else {
            throw Error('Unknown tool mode: ' + current_tool_mode);
        }

        const selected_uids = editor.getAllSelectedIndexes();
        if (selected_uids.length > 0) {
            if (!editor.areAllVertexesSelected()) {
                // Checkpoint if we destructively altered selection set
                mesh_editor.saveTo(ss, current_selected_mesh_uid);
                checkpointHistory();
            }
            editor.selectNone();
        }
        else {
            editor.selectAll();
        }
        update_mesh_editor = true;
    }



    function selectedVertexesToClipboard(setClipboard) {
        const selected_data = mesh_editor.getAllSelectedData();
        selected_data.clipboard = true;
        selected_data.clipboard_type = 'vertex_set';
        setClipboard(JSON.stringify(selected_data, null, 2));
    }

    function handleEditorCutOperation(setClipboard) {
        selectedVertexesToClipboard(setClipboard);
    }
    function handleEditorCopyOperation(setClipboard) {
        selectedVertexesToClipboard(setClipboard);
    }
    function handleEditorPasteOperation(selected_data) {
        if (current_selected_mesh_uid === undefined) {
            return;
        }
        if (isInMeshModeEdit()) {
            if (selected_data.clipboard === true) {
                const insert_count = mesh_editor.mergeInData(selected_data);
                if (insert_count >= 0) {
                    mesh_editor.saveTo(ss, current_selected_mesh_uid);
                    checkpointHistory();
                    fullRefresh();
                }
            }
        }
    }


    function handleEditorKeyDown(evt) {
        const kc = evt.keyCode;
        const c = evt.key;

        if (kc === KeyCode.ESC) {
            ss.debug();
        }

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
                if (isInMeshModeEdit()) {
                    // Delete all selected vertexes,
                    mesh_editor.deleteSelectedVertices();
                    updatePoseMesh(current_selected_mesh_uid,
                                        mesh_editor.getCurrentMeshDetails());

                    update_mesh_editor = true;
                    active_mesh_editing = undefined;

                    mesh_editor.saveTo(ss, current_selected_mesh_uid);
                    replay_history.checkpoint();
                }
            }
            // Fill line or face,
            else if (c === 'f') {
                if (isInMeshModeEdit()) {
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
            // Toggle all select,
            else if (c === 'a') {
                // Toggle selection on mesh edit mode,
                toggleAllSelection();
            }
            // Scale mode,
            else if (c === 's' && active_mesh_editing === undefined) {
                console.log("Start Scale...");
                startInteractiveTransform('scale');
            }
            // Rotate mode,
            else if (c === 'r' && active_mesh_editing === undefined) {
                console.log("Start Rotation...");
                startInteractiveTransform('rotate');
            }
            // Translate mode,
            else if (c === 'g' && active_mesh_editing === undefined) {
                console.log("Start Move...");
                startInteractiveTransform('translate');
            }

        }

//        console.log("KEY DOWN:");
//        console.log(evt);
    }



    // Interactive active that moves deform curve.

    function editDeformLineAction(now_r) {
        // The translation type,
        const edit_type = active_mesh_editing.edit_type;

        const start_r = active_mesh_editing.edit_r_start;
//        const selected_point_uid = active_mesh_editing.selected_point_uid;
        const weighted_selection = active_mesh_editing.weighted_selection;

        // The difference between when the drag started and now
        const dx = now_r.x - start_r.x;
        const dy = now_r.y - start_r.y;

        const curved_2d_line = mesh_editor.getCurvedDeformerLine();

        if (edit_type === 'translate') {
            curved_2d_line.translateWeightedVertexes(weighted_selection, dx, dy);
        }
        else if (edit_type === 'rotate') {
            const sx = start_r.x;
            const sy = start_r.y;
            curved_2d_line.rotateWeightedVertexes(
                                weighted_selection, sx, sy, dx, dy);
        }
        else if (edit_type === 'scale') {
            curved_2d_line.scaleWeightedVertexes(
                                weighted_selection, dx, dy, view_scale);
        }
        else {
            throw Error('Unknown edit_type: ' + edit_type);
        }

        update_mesh_editor = true;
        updatePoseMesh( current_selected_mesh_uid,
                        mesh_editor.getCurrentMeshDetails() );

    }

    // Interactive action that moves vertexes.

    function editVertexesAction(now_r) {

        // The translation type,
        const edit_type = active_mesh_editing.edit_type;

        const start_r = active_mesh_editing.edit_r_start;
        const weighted_selection = active_mesh_editing.weighted_selection;

        // The difference between when the drag started and now
        const dx = now_r.x - start_r.x;
        const dy = now_r.y - start_r.y;

        if (edit_type === 'translate') {
            mesh_editor.translateWeightedVertexes(weighted_selection, dx, dy);
        }
        else if (edit_type === 'rotate') {
            const sx = start_r.x;
            const sy = start_r.y;
            mesh_editor.rotateWeightedVertexes(
                                weighted_selection, sx, sy, dx, dy);
        }
        else if (edit_type === 'scale') {
            mesh_editor.scaleWeightedVertexes(
                                weighted_selection, dx, dy, view_scale);
        }
        else {
            throw Error('Unknown edit_type: ' + edit_type);
        }

        update_mesh_editor = true;
        updatePoseMesh( current_selected_mesh_uid,
                        mesh_editor.getCurrentMeshDetails() );
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


    // Sets the mesh mode (eg. 'edit', 'pose')
    function setMeshMode(mode_change_value) {
        model_compositor.setViewMode(mode_change_value);
        mesh_editor.setMode(mode_change_value);
        update_mesh_editor = true;
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



    function handleInteractiveActionUpdate(action_uid, value) {

        const excludes_action_uid = [action_uid];

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
                                deform.vertex_arr, vertex_def_other.vertex_arr);
            }
            else {
                vertex_arr = deform.vertex_arr;
            }
            const layers_set = deform.layers_set;
            for (let i = 0; i < layers_set.length; ++i) {
                const layer_uid = layers_set[i];
                composition_controller.updatePoseGeometry(
                            layer_uid, vertex_arr, deform.face_indexes);
            }
        }

    }

    function writeActionValue(action_uid, value) {
        const actions = ss.getArray('actions');
        const action_ob = actions.get(action_uid);
        action_ob.set('value', value);

        const excludes_action_uid = [action_uid];

        // Calculate mesh deforms from all other actions,
        const all_mesh_deforms =
                composition_controller.calcMeshMorphsFromActions(
                                                    ss, excludes_action_uid);
        // Calculate mesh deforms for this action,
        const action_mesh_deforms =
                composition_controller.calcMeshMorphsFromSingleAction(
                                                    ss, action_uid, value);

        // Update geometry from the deform information,
        const meshes = ss.getArray('meshes');
        for (let mesh_uid in action_mesh_deforms) {
            const deform = action_mesh_deforms[mesh_uid];
            const vertex_def_other = all_mesh_deforms[mesh_uid];
            let vertex_arr;
            if (vertex_def_other !== undefined) {
                vertex_arr = composition_controller.mergeVertexDeforms(
                                deform.vertex_arr, vertex_def_other.vertex_arr);
            }
            else {
                vertex_arr = deform.vertex_arr;
            }
            const mesh_ob = meshes.get(mesh_uid);
            mesh_ob.set('me_vertices', vertex_arr);
        }

        // const action_mesh_deforms =
        //         composition_controller.calcMeshMorphsFromSingleAction(
        //                                             ss, action_uid, value);
        // const meshes = ss.getArray('meshes');
        // for (let mesh_uid in action_mesh_deforms) {
        //     const mesh_ob = meshes.get(mesh_uid);
        //     const deform = action_mesh_deforms[mesh_uid];
        //     mesh_ob.set('me_vertices', deform.vertex_arr);
        // }
        refreshScene();
        refreshSelectedMesh();
    }


    function handleActionsListChange(evt) {
        const type = evt.type;
        const uid = evt.uid;
        const value = evt.value;

        time_line_panel.updateCurrentTimePoint(value);

        if (type === 'controlmove') {
            handleInteractiveActionUpdate(uid, value);
        }
        else if (type === 'controlchange') {
            // Write value of action uid to serialized state,
            writeActionValue(uid, value);
        }
    }

    function handleTimeLineTimeChange(evt) {
        const type = evt.type;
        const uid = evt.uid;
        const value = evt.value;

        actions_list_panel.updateActionValue(uid, value);

        if (type === 'timemove') {
            handleInteractiveActionUpdate(uid, value);
        }
        else if (type === 'timechange') {
            // Write value of action uid to serialized state,
            writeActionValue(uid, value);
        }

    }



    function handleActionsListItemSelect(evt) {
        const type = evt.type;
        if (type === 'controlselect') {
            time_line_panel.setupFor({ uid: evt.uid });
        }
        else if (type === 'controlunselect') {
            time_line_panel.clear();
        }
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

        const layer_uid = drop_data.uid;

        const associateLayerWithMesh = require('./actions/associateLayerWithMesh.js');
        associateLayerWithMesh(editor, layer_uid, target_mesh_uid, target_layer_uid);

    }


    function handleMeshModeChange(evt) {
        const mode_change_value = evt.target.value;
        setMeshMode(mode_change_value);
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

    function addAction(action_name, action_type) {
        const addModelAction = require('./actions/addModelAction.js');
        addModelAction(editor, action_name, action_type);
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

    function doAddLayerGroupAction() {
        modal_dialog.setForm({
            type: 'simple_text',
            title: 'Enter the name of the new layer group:',
            accept: (form) => {
                const layer_group_name = form.fields.value;
                const addEmptyArtLayerGroup =
                                    require('./actions/addArtLayerGroup.js');
                addEmptyArtLayerGroup(editor, layer_group_name);
            }
        });
        modal_dialog.show();
    }

    function doRemoveLayerAction() {
        if (current_selected_layer_uid !== undefined) {
            const removeArtLayer = require('./actions/removeArtLayer.js');
            removeArtLayer(editor, current_selected_layer_uid);
        }
    }

    function doAddActionAction() {
        modal_dialog.setForm({
            type: 'new_action_form',
            title: 'Enter the name of the new model action:',
            accept: (form) => {
                const action_name = form.fields.value;
                const action_type = form.fields.type;
                addAction(action_name, action_type);
            }
        });
        modal_dialog.show();
    }


    function toggleEditTool(mode) {
        const t = edit_tools.find((v) => v.mode === mode);
        if (t === undefined) {
            return;
        }
        if (last_edit_ob !== undefined) {
            last_edit_ob.surr_el.className = 'editor-button';
        }
        t.surr_el.className = 'editor-button-selected';
        current_tool_mode = mode;
        last_edit_ob = t;

        refreshScene();
    }



    function createEditToolButton(toggle_mode, icon_class) {
        const button_el = document.createElement('div');
        button_el.className = icon_class;
        button_el.addEventListener('mousedown', (evt) => {
            toggleEditTool(toggle_mode);
        });
        const surr_el = document.createElement('div');
        surr_el.className = 'editor-button';
        surr_el.appendChild(button_el);
        edit_tools.push({
            mode: toggle_mode,
            button_el,
            surr_el,
        });
        return surr_el;
    }


    function layout() {

//        console.log("EditorPanel LAYOUT");

        // Stores the tree panel,
        ui_left1_content = document.querySelector('#ui_left1_content');
        ui_left2_content = document.querySelector('#ui_left2_content');
        ui_left3_content = document.querySelector('#ui_left3_content');
        ui_central_content = document.querySelector('#ui_central_content');
        ui_timeline_content = document.querySelector('#ui_timeline_content');

        // Load split pane state from local storage,
        const layoutk1_sizes = local_store.load('layoutk1_sizes', [10, 10, 80]);
        const layoutk2_sizes = local_store.load('layoutk2_sizes', [80, 20]);
        const layoutk3_sizes = local_store.load('layoutk3_sizes', [50, 50]);

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

        const lk3_split =
                Split(['#ui_left2_content', '#ui_left3_content'], {
            direction: 'vertical',
            gutterSize: 8,
            cursor: 'row-resize',
            sizes: layoutk3_sizes,
            minSize: [100, 100],
            snapOffset: 0,
            onDrag: layoutResizeHandler,
            onDragEnd: () => local_store.save('layoutk3_sizes', lk3_split.getSizes())
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

        // Actions,
        actions_list_panel = ActionsListPanel(editor);
        actions_list_panel.addEventListener(
                        'controlmove', handleActionsListChange);
        actions_list_panel.addEventListener(
                        'controlchange', handleActionsListChange);
        actions_list_panel.addEventListener(
                        'controlselect', handleActionsListItemSelect);
        actions_list_panel.addEventListener(
                        'controlunselect', handleActionsListItemSelect);

        // Time line,
        const time_line_opts = ActionsTimeLineOpts(editor);
        time_line_panel = TimeLine(time_line_opts);

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

        const actions_list_content = document.createElement('div');
        actions_list_content.className = 'noselect actions-list-content';
        actions_list_content.appendChild(actions_list_panel.domElement);

        ui_left1_content.appendChild(mesh_tree_content);

        ui_left2_content.appendChild(texture_layer_tree_actions);
        ui_left2_content.appendChild(texture_layer_tree_content);

        ui_left3_content.appendChild(actions_list_content);

        ui_timeline_content.appendChild(time_line_panel.domElement);

        const editor_buttonbar = document.createElement('div');
        editor_buttonbar.className = 'noselect editor_buttonbar';

        editor_buttonbar.appendChild(
                    createEditToolButton('mesh_edit_mode', 'editor-pencil-icon'));
        editor_buttonbar.appendChild(
                    createEditToolButton('curve_mode', 'editor-curves-icon'));
//        editor_buttonbar.appendChild(
//                    createEditToolButton('tools_mode', 'editor-tools-icon'));

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
        editor_dom.tabIndex = 0;
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

        time_line_panel.addEventListener(
                                'timemove', handleTimeLineTimeChange, false);
        time_line_panel.addEventListener(
                                'timechange', handleTimeLineTimeChange, false);

        document.addEventListener('keydown', handleEditorKeyDown, false);

        function getClipboardData(evt) {
            // Get pasted data via clipboard API
            return evt.clipboardData || window.clipboardData;
        }

        // If copy pressed,
        document.addEventListener('copy', (evt) => {

            if (document.activeElement === renderer.domElement) {
                evt.preventDefault();
                handleEditorCopyOperation((text) => {
                    getClipboardData(evt).setData('text/plain', text);
                });
            }

        });
        // If cut pressed,
        document.addEventListener('cut', (evt) => {
            // Only consume clipboard operation on editor,
            if (document.activeElement === renderer.domElement) {
                evt.preventDefault();
                handleEditorCutOperation((text) => {
                    getClipboardData(evt).setData('text/plain', text);
                });
            }
        });
        // If paste pressed,
        document.addEventListener('paste', (evt) => {
            const dtext = getClipboardData(evt).getData('text/plain');
            let parsed_ob;
            try {
                parsed_ob = JSON.parse(dtext);
            }
            catch (e) {
                console.error('Invalid clipboard format.');
                return;
            }
            if (parsed_ob.clipboard === true) {
                const clipboard_type = parsed_ob.clipboard_type;
                if (clipboard_type === 'vertex_set') {
                    evt.preventDefault();
                    handleEditorPasteOperation(parsed_ob);
                }
                else {
                    console.error('Unknown clipboard type: ' + clipboard_type);
                }
            }
        });

    }

    function renderCall(time) {

        requestAnimationFrame(renderCall);

//        camera.rotation.z += 0.05 * Math.PI / 180;

        // Render call on the drawing panel,
        try {
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
                mesh_editor_3dobject = new THREE.Object3D();
                const edges_ob = mesh_editor.createEdgesOb();
                const faces_ob = mesh_editor.createFacesOb();
                mesh_editor_3dobject.add(
                    edges_ob,
                    faces_ob
                );
                if (current_tool_mode === 'mesh_edit_mode') {
                    const unselect_points_ob = mesh_editor.createUnselectedPointsOb();
                    const select_points_ob = mesh_editor.createSelectedPointsOb();
                    const pselect_points_ob = mesh_editor.createPrimarySelectedPointsOb();
                    mesh_editor_3dobject.add(
                        unselect_points_ob,
                        select_points_ob,
                        pselect_points_ob
                    );
                }
                else if (current_tool_mode === 'curve_mode') {
                    const deformer_control = mesh_editor.createDeformerControlOb();
                    mesh_editor_3dobject.add(
                        deformer_control
                    );
                }

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
        catch (e) {
            console.error(e);
        }

        // Render call on the time line panel,
        try {
            if (time_line_panel !== undefined) {
                time_line_panel.renderCall();
            }
        }
        catch (e) {
            console.error(e);
        }

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



    function initializeTextureLayers() {

        const texture_layers = ss.getArray('texture_layers');
        texture_layers.forEach((layer) => {

            const layer_type = layer.get('type');
            if (layer_type === 'layer') {

                const power = layer.getFromObject('extra_details', 'raw_texture_power');
                const tex_type = layer.get('raw_texture_type');
                const pixels = layer.get('$raw_texture_pixels').data;

                // Initialize the three.js specific data,
                // Create the threejs specific texture data
                const renderer = getRenderer();
                const max_anisotropy = renderer.capabilities.getMaxAnisotropy();

                const layer_name = layer.get('name');
                const layer_uid = layer.get('uid');
                const layer_blend = layer.get('blend');
                const layer_opacity = layer.get('opacity');

                // // HACK, Until we have a way to set this up in the UI...
                // if ( layer_blend === 'svg:src-over' &&
                //      layer_name.startsWith('I ') ) {
                //     console.error("Added -inherit-alpha to blend mode because layer name starts with 'I ': '%s'", layer_name);
                //     layer_blend += '-inherit-alpha';
                // }
                //
                // layer.set('blend', layer_blend);

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
                threejs_cache[layer_uid] = {
                    texture, dimension,
                    present_mesh, present_geometry, present_material,
                    pose_mesh, pose_geometry, pose_material
                };

                const cc = composition_controller;
                cc.updateLayerBlendMode(layer_uid, layer_blend);
                cc.updateLayerOpacity(layer_uid, layer_opacity);

            }
            else if (layer_type === 'group') {

                // Create a plane geometry mesh for the group. This mesh/
                // geometry is used when we need a 3d object to paint a
                // composition group into its parent.

                const group_uid = layer.get('uid');
                const group_blend = layer.get('blend');
                const group_opacity = layer.get('opacity');

                let geom = new THREE.PlaneGeometry(1, 1);

                const material =
                            CompositingHelper.createPreMultAlphaMaterial();

                const mesh = new THREE.Mesh(geom, material);

                threejs_cache[group_uid] = {
                    present_mesh: mesh, present_geometry: geom, present_material: material,
                    pose_mesh: mesh, pose_geometry: geom, pose_material: material
                };

                const cc = composition_controller;
                cc.updateLayerBlendMode(group_uid, group_blend);
                cc.updateLayerOpacity(group_uid, group_opacity);

            }
            else {
                throw Error('Unknown layer type: ' + layer_type);
            }

        });

    }


    function initializeLoadedState() {

//        console.log("EditorPanel INITIALIZE");

        threejs_cache = {};
        composition_controller = CompositionController(threejs_cache);

        // Define actions list if it doesn't already exist,
        const actions = ss.getArray('actions');
        if (!actions.isDefined()) {
            ss.defineArray('actions');
        }
        // Animation keys (describes how a mesh_morph, deform_transform or
        // layer property is changed over the frames of an action),
        const anim_keys = ss.getArray('anim_keys');
        if (!anim_keys.isDefined()) {
            ss.defineArray('anim_keys');
        }
        // Morph targets, describes how the vertexes of a mesh are displaced in
        // a morph operation,
        const morph_targets = ss.getArray('morph_targets');
        if (!morph_targets.isDefined()) {
            ss.defineArray('morph_targets');
        }

        initializeTextureLayers();

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


        // Reset UI to initial state,
        const initial_mesh_mode = 'edit';
        edit_mesh_mode_select_el.value = initial_mesh_mode;
        setMeshMode(initial_mesh_mode);

        toggleEditTool('mesh_edit_mode');


        refreshScene();

        // Refresh layout,
        layers_tree_panel.deselectAll();
        meshes_tree_panel.deselectAll();
        actions_list_panel.deselectAll();

        refreshTreePanels();
        layers_tree_panel.refresh();
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
        else if (event_type === 'merge_vmod') {
            const [ loaded_serialized_state ] = args;
            const mergeImportedState = require('./actions/mergeImportedState.js');
            mergeImportedState(editor, loaded_serialized_state);
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
        // else if (event_type === 'global_cut') {
        //     handleCutEvent(args[0]);
        // }
        // else if (event_type === 'global_copy') {
        //     handleCopyEvent(args[0]);
        // }
        // else if (event_type === 'global_paste') {
        //     handlePasteEvent(args[0]);
        // }
        else if (event_type === 'add_mesh') {
            doAddMeshAction();
        }
        else if (event_type === 'remove_mesh') {
            doRemoveMeshAction();
        }
        else if (event_type === 'add_layer_group') {
            doAddLayerGroupAction();
        }
        else if (event_type === 'remove_layer') {
            doRemoveLayerAction();
        }
        else if (event_type === 'add_action') {
            doAddActionAction();
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
