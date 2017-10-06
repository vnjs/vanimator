"use strict";

/* globals requestAnimationFrame */

const THREE = require('three');
const Split = require('split.js');
const KeyCode = require('key-code');

const local_store = require('./LocalStore.js')();
const geom_helper = require('./GeometryHelper.js')();

const MouseEventHandler = require('./MouseEventHandler.js');
const TreePanel = require('./TreePanel.js');
const MeshEditor = require('./MeshEditor.js');
const ReplayHistory = require('./ReplayHistory.js');
const VersionableState = require('./VersionableState.js');
const AreaSelectGesture = require('./AreaSelectGesture.js');
const ModelCompositor = require('./ModelCompositor.js');

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

    const mouse_evt_handler = MouseEventHandler();

    let ui_left1_content;
    let ui_central_content;
    let ui_timeline_content;

    const ss = VersionableState();

    let current_selected_layer_uid;
    let current_selected_deformer_uid;

    const mesh_editor = MeshEditor();
    let update_mesh_editor = true;
    let mesh_editor_3dobject;
    let active_mesh_editing;

    const area_select_gesture = AreaSelectGesture();
    let select_area_3dobject;

    let scene;
    let camera;
    let renderer;
    let raycaster;
    const rc_mouse_vec = new THREE.Vector2();
    let model_compositor;


    const replay_history = ReplayHistory(ss);

    let editor_dom;

    let view_width = 100;
    let view_height = 100;
    let view_pos_x = 0;
    let view_pos_y = 0;
    let view_scale = 1;

    let editor_view_change_active = false;
    let editor_view_change_sx, editor_view_change_sy;
    let editor_view_vpx, editor_view_vpy;

    let layers_tree_panel;

    let threejs_cache = {};




    // Returns serialized state for read-only access only.
    // You shouldn't modify this object because it will mess up the
    // replay_history!
    function getSerializedState() {
        return ss;
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
    function getModelTreeModel() {
        // Generate model,

        const out = [];

        const meshes = ss.getArray('meshes');
        if (meshes.isDefined()) {
            out.push(
                { type:'branch', path:[], name:'Meshes' }
            );
            meshes.forEach( (layer) => {
                const layer_type = layer.get('type');
                if (layer_type === 'group') {
                    out.push({
                        type:'branch', path:layer.get('path'),
                        name:layer.get('name'), uid:layer.get('uid')
                    });
                }
                else if (layer_type === 'layer') {
                    out.push({
                        type:'leaf', path:layer.get('path'),
                        name:layer.get('name'), uid:layer.get('uid')
                    });
                }
                else {
                    throw Error("Unknown layer type: " + layer_type);
                }
            });

            // The deformers branch
            out.push({ type:'branch', path:[], name:'Deformers' });
            // PENDING: Mesh deformers...
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



    function updateMeshPosition(mesh, layer, z_depth) {
        const mid_width = ss.get('img_width') / 2;
        const mid_height = ss.get('img_height') / 2;
        const px = ((layer.get('width') / 2) + layer.get('x')) - mid_width;
        const py = (-(layer.get('height') / 2 ) - layer.get('y')) + mid_height;
        mesh.position.set(px, py, z_depth);
    }


    // function updateWireframeOf(layer, geometry) {
    //     if (wireframe_mesh !== void 0) {
    //         scene.remove(wireframe_mesh);
    //     }
    //     const geo = new THREE.WireframeGeometry(geometry);
    //     const mat = new THREE.LineBasicMaterial( {
    //         color: 0x0000000,
    //         // Can't use another value. Win32 only supports 1 px line
    //         // width
    //         linewidth: 1
    //     });
    //     mat.transparent = true;
    //     mat.opacity = 0.40;
    //     wireframe_mesh = new THREE.LineSegments( geo, mat );
    //     // Update mesh position,
    //     updateMeshPosition(wireframe_mesh, layer, 310);
    //     scene.add(wireframe_mesh);
    // }


    function refreshScene() {

        disposeNode(scene);
        const children = scene.children;
        for (let i = children.length - 1; i >= 0; --i) {
            scene.remove(children[i]);
        }

        const mid_width = ss.get('img_width') / 2;
        const mid_height = ss.get('img_height') / 2;

        // Mask off the edges at the picture boundary,
        const mask_geometry = geom_helper.createMaskGeometry(
                            -mid_width, mid_height, mid_width, -mid_height);
        const mask_material = new THREE.MeshBasicMaterial(
            {
                color: 0x0a0a0a0
            }
        );
        const mask_mesh = new THREE.Mesh( mask_geometry, [ mask_material ] );
        mask_mesh.position.set(0, 0, 305);
        scene.add(mask_mesh);

        scene.needsUpdate = true;

        update_mesh_editor = true;

    }

    function getLayerFromUid(layer_uid) {
        const meshes = ss.getArray('meshes');
        return meshes.find((layer) => layer_uid === layer.get('uid'));
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

    function refreshTreeControl(control_div, layer_uid) {
        if (layer_uid !== undefined) {
            const view_control = document.createElement('span');
            view_control.className = 'layer-view-icon';
            view_control.vanim_layer_uid = layer_uid;
            const layer = getLayerFromUid(layer_uid);
            if (layer.get('visible') !== true) {
                view_control.classList.add('layer-view-icon-off');
            }
            view_control.addEventListener('click', doToggleVisibility);
            control_div.appendChild(view_control);
        }
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

        // If a layer is selected,
        if (current_selected_layer_uid !== undefined) {

            // If the user clicked on a vertex location then we highlight the
            // vertex and select it. The vertex is made primary.

            let detect_size = 10 * cview_scale;
            if (shift_key) {
                detect_size = 50 * cview_scale;
            }

            const vertex_index = mesh_editor.nearestIndexTo(r.x, r.y, detect_size);
            if (vertex_index.length > 0) {
                // Clicked and dragged a vertex point,

                // Get the vertex index,
                const vertex_i = vertex_index[0];

                active_mesh_editing = {
                    selected_vertex_i: vertex_i,
                };

                if (!shift_key) {
                    mesh_editor.selectNone();
                }
                mesh_editor.selectVertex(vertex_i);

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
                const current_primary_i = mesh_editor.getPrimarySelectVertex();
                const new_i = mesh_editor.addVertex(r.x, r.y);

                active_mesh_editing = {
                    selected_vertex_i: new_i,
                };
                active_mesh_editing.mutation = true;

                mesh_editor.selectNone();
                if (current_primary_i !== undefined) {
                    mesh_editor.addEdge(current_primary_i, new_i, 1);
                }
                mesh_editor.selectVertex(new_i);

                update_mesh_editor = true;

            }

        }


        // // Check for object intersections,
        // raycaster.params.Points.threshold = 10 * view_scale;
        // if (cur_interactible_vertices !== undefined) {
        //     raycaster.setFromCamera(rc_mouse_vec, camera);
        //     const intersects = raycaster.intersectObject( cur_interactible_vertices );
        //     if (intersects.length > 0) {
        //         const io = intersects[0];
        //         const vertex_selected = {
        //             index: io.index
        //         }
        //         cur_vertex_mouse_down = vertex_selected;
        //     }
        // }
    }

    function handleViewPortLeftMouseUp(evt) {

        const shift_key = evt.shiftKey;

        if (area_select_gesture.isActive()) {
            area_select_gesture.complete();

            const selected_indexes = mesh_editor.getAllSelectedIndexes();

            if (!shift_key) {
                mesh_editor.selectNone();
            }
            if (current_selected_layer_uid !== undefined) {
                mesh_editor.selectArea(area_select_gesture);
            }
            update_mesh_editor = true;

            area_select_gesture.clear();
            if (current_selected_layer_uid !== undefined) {
                if (!mesh_editor.isSameSelected(selected_indexes)) {
                    mesh_editor.saveTo(ss, current_selected_layer_uid);
                    replay_history.checkpoint();
                }
            }
            return;
        }

        if (active_mesh_editing !== undefined) {
//            if (active_mesh_editing.mutation === true) {
                if (current_selected_layer_uid !== undefined) {
                    mesh_editor.saveTo(ss, current_selected_layer_uid);
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
                        active_mesh_editing.selected_vertex_i, r.x, r.y);
            active_mesh_editing.mutation = true;
            update_mesh_editor = true;
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
                editor_view_change_active = true;
                editor_view_change_sx = evt.x;
                editor_view_change_sy = evt.y;
                editor_view_vpx = view_pos_x;
                editor_view_vpy = view_pos_y;
            }
        }
        else if (evt.type === 'mouseup') {
            if (evt.button === 0) {
                handleViewPortLeftMouseUp(evt);
            }
            else if (evt.button === 1) {
                editor_view_change_active = false;
            }
        }
        // Middle mouse drag view,
        else if (evt.type === 'mousemove') {
            // If scrolling the viewport window,
            if (editor_view_change_active === true) {
                view_pos_x = editor_view_vpx +
                        ((editor_view_change_sx - evt.x) * view_scale);
                view_pos_y = editor_view_vpy -
                        ((editor_view_change_sy - evt.y) * view_scale);
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

//                    const rpx = view_pos_x + (px * view_scale);
//                    const rpy = view_pos_y + (py * view_scale);
//                    console.log("realp: ", rpx, rpy);
//                    console.log("realp(2): ", rpx / nscale, rpy / nscale);

                    view_scale = nscale;
                    updateCamera();
                }
            }
        }
//        console.log(evt);
    }


    function handleUndoEvent() {
        const did_undo = replay_history.undo();
        if (!did_undo) {
            console.log("Nothing to Undo!");
        }
        else {
            if (current_selected_layer_uid !== undefined) {
                mesh_editor.loadFrom(ss, current_selected_layer_uid);
            }
            refreshScene();
        }
    }

    function handleRedoEvent() {
        const did_redo = replay_history.redo();
        if (!did_redo) {
            console.log("Nothing to Redo!");
        }
        else {
            if (current_selected_layer_uid !== undefined) {
                mesh_editor.loadFrom(ss, current_selected_layer_uid);
            }
            refreshScene();
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
        if (current_selected_layer_uid !== undefined) {

            if (kc === KeyCode.DELETE) {

                // Delete all selected vertexes,
                mesh_editor.deleteSelectedVertices();

                update_mesh_editor = true;
                active_mesh_editing = undefined;

                mesh_editor.saveTo(ss, current_selected_layer_uid);
                replay_history.checkpoint();

            }
            else if (kc === KeyCode.ESC) {
                console.log("ESC PRESSED!");
                ss.debug();
            }
            // Fill line or face,
            else if (c === 'f') {
                const selected_i = mesh_editor.getAllSelectedIndexes();
                // Edge fill,
                if (selected_i.length === 2) {
                    mesh_editor.addEdge(selected_i[0], selected_i[1], 1);
                    update_mesh_editor = true;
                }
                // else if (selected_i.length > 2) {
                //     mesh_editor.computeFacesFromSelected();
                //     update_mesh_editor = true;
                // }

                mesh_editor.saveTo(ss, current_selected_layer_uid);
                replay_history.checkpoint();

            }

        }

//        console.log("KEY DOWN:");
//        console.log(evt);
    }




    function handleLayerSelectChange(evt) {
        const selected = evt.selected_elements;
        if (selected.length === 0) {
            current_selected_layer_uid = undefined;
            current_selected_deformer_uid = undefined;
        }
        else {
            const uid = selected[selected.length - 1];
            // UID will either reference a layer or a deformer. Find out which,
            const layer_ob = getLayerFromUid(uid);
            if (layer_ob !== undefined) {
                current_selected_layer_uid = uid;
                current_selected_deformer_uid = undefined;
                // Set up mesh editor,
                mesh_editor.loadFrom(ss, uid);
            }
            else {
                // PENDING: Handle deformers here,
                throw Error("PENDING: Handle deformers!");
            }
        }
        refreshScene();
    }




    function layout() {

        // Stores the tree panel,
        ui_left1_content = document.querySelector('#ui_left1_content');
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

        // Set the layers tree view,
        layers_tree_panel = TreePanel(getModelTreeModel);
        layers_tree_panel.setControlRefresh(refreshTreeControl);
        layers_tree_panel.addEventListener('select', handleLayerSelectChange);
        ui_left1_content.appendChild(layers_tree_panel.domElement);

        const editor_buttonbar = document.createElement('div');
        editor_buttonbar.className = 'noselect editor_buttonbar';
        editor_buttonbar.innerHTML =
`<div class='editor-button'><div class='editor-pencil-icon'></div></div>
 <div class='editor-button'><div class='editor-tools-icon'></div></div>
`;

        // Set view port,
        editor_dom = renderer.domElement;
        editor_dom.className = 'noselect editor_canvas';
        ui_central_content.appendChild(editor_buttonbar);
        ui_central_content.appendChild(editor_dom);

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

        document.addEventListener('keydown', handleEditorKeyDown, false);

    }

    function renderCall(time) {

        requestAnimationFrame(renderCall);

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


    function initializeLoadedState() {

        threejs_cache = {};

        const meshes = ss.getArray('meshes');
        meshes.forEach((layer) => {

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
                if (layer_name === 'Iris') {
                    console.error("HARD CODED INHERIT ALPHA on 'Iris' Layer!");
                    layer_blend = 'svg:src-over-inherit-alpha';
                }
                else if (layer_name.startsWith('I ')) {
                    console.error("Added -inherit-alpha to blend mode because layer name starts with 'I ': '%s'", layer_name);
                    layer_blend += '-inherit-alpha';
                }

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

                texture.name = layer_name;

                const geometry = geom_helper.createSquareBillboardGeometry(
                        layer.get('width'), layer.get('height'),
                        texture.image.width, texture.image.height);

                const material = new THREE.MeshBasicMaterial(
                    {
                        transparent: true,
                        map: texture,
                    }
                );

                if (layer_blend === 'svg:multiply') {
                    material.blending = THREE.CustomBlending;
                    material.blendSrc = THREE.DstColorFactor;
                    material.blendDst = THREE.OneMinusSrcAlphaFactor;
                    material.blendEquation = THREE.AddEquation;
//                    material.blending = THREE.MultiplyBlending;

                    material.premultipliedAlpha = true;

                }
                else if (layer_blend === 'svg:src-over-inherit-alpha') {

                    // material.blending = THREE.CustomBlending;
                    // material.blendSrc = THREE.DstAlphaFactor;
                    // material.blendDst = THREE.OneMinusSrcAlphaFactor;
                    // material.blendSrcAlpha = THREE.OneFactor;
                    // material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
                    // material.blendEquation = THREE.AddEquation;
                    //
                    // material.premultipliedAlpha = false;

                    material.blending = THREE.CustomBlending;
                    material.blendSrc = THREE.DstAlphaFactor;
                    material.blendDst = THREE.OneMinusSrcAlphaFactor;
                    material.blendEquation = THREE.AddEquation;

                    material.premultipliedAlpha = true;

                }
                else if (layer_blend === 'svg:src-over') {

                    // material.blending = THREE.CustomBlending;
                    // material.blendSrc = THREE.SrcAlphaFactor;
                    // material.blendDst = THREE.OneMinusSrcAlphaFactor;
                    // material.blendSrcAlpha = THREE.OneFactor;
                    // material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
                    // material.blendEquation = THREE.AddEquation;
                    //
                    // material.premultipliedAlpha = false;

                    material.blending = THREE.CustomBlending;
                    material.blendSrc = THREE.OneFactor;
                    material.blendDst = THREE.OneMinusSrcAlphaFactor;
                    material.blendEquation = THREE.AddEquation;

                    material.premultipliedAlpha = true;


//                    material.blending = THREE.NormalBlending;
                }

                const mesh = new THREE.Mesh( geometry, [ material ] );

                // Put data in a local cache,
                threejs_cache[layer.get('uid')] = {
                    texture, mesh, geometry
                };

            }

        });


        model_compositor = ModelCompositor(threejs_cache);
        model_compositor.loadFrom(ss);



        // Make sure the 'Meshes' group is open in the tree view,
        layers_tree_panel.openGroup('Meshes');

        current_selected_layer_uid = undefined;
        current_selected_deformer_uid = undefined;
        active_mesh_editing = undefined;
        mesh_editor.clear();

        // Clear the reply history,
        replay_history.clear();
        // Checkpoint it at initial position,
        replay_history.checkpoint();


        refreshScene();

        // Refresh layout,
        layers_tree_panel.clearSelected();
        layers_tree_panel.refresh();

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
        raycaster = new THREE.Raycaster();

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
