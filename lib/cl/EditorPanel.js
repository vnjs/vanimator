"use strict";

/* globals requestAnimationFrame */

const THREE = require('three');
const Split = require('split.js');

const local_store = require('./LocalStore.js')();
const geom_helper = require('./GeometryHelper.js')();

const MouseEventHandler = require('./MouseEventHandler.js');
const TreePanel = require('./TreePanel.js');

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
        lockUIForLoad,
        unlockUIForLoad,
        notify,
        notifyError
    };

    const mouse_evt_handler = MouseEventHandler();

    let ui_left1_content;
    let ui_central_content;
    let ui_timeline_content;

    let scene;
    let camera;
    let renderer;
    let raycaster;
    const rc_mouse_vec = new THREE.Vector2();

    let editor_dom;

    let view_width = 100;
    let view_height = 100;
    let view_pos_x = 0;
    let view_pos_y = 0;
    let view_scale = 1;

    let editor_view_change_active = false;
    let editor_view_change_sx, editor_view_change_sy;
    let editor_view_vpx, editor_view_vpy;

    let current_selected_layer_uid;
    let current_selected_deformer_uid;

    let cur_interactible_vertices;
    let cur_vertex_mouse_down;

    let layers_tree_panel;

    let current_vmod;


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
        if (current_vmod) {

            const out = [
                { type:'branch', path:[], name:'Meshes' }
            ];
            const layer_data = current_vmod.layer_data;
            for (let i = 0; i < layer_data.length; ++i) {
                const layer = layer_data[i];
                if (layer.type === 'group') {
                    out.push({
                        type:'branch', path:layer.path, name:layer.name, uid:layer.uid
                    });
                }
                else if (layer.type === 'layer') {
                    out.push({
                        type:'leaf', path:layer.path, name:layer.name, uid:layer.uid
                    });
                }
                else {
                    throw Error("Unknown layer type: " + layer.type);
                }
            }

            // The deformers branch
            out.push({ type:'branch', path:[], name:'Deformers' });
            // PENDING: Mesh deformers...

            return out;
        }

        return [];

    }







    function disposeNode(parentObject) {
        parentObject.traverse(function (node) {
            if (node instanceof THREE.Mesh) {
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
                            if (mtrl.map) mtrl.map.dispose();
                            if (mtrl.lightMap) mtrl.lightMap.dispose();
                            if (mtrl.bumpMap) mtrl.bumpMap.dispose();
                            if (mtrl.normalMap) mtrl.normalMap.dispose();
                            if (mtrl.specularMap) mtrl.specularMap.dispose();
                            if (mtrl.envMap) mtrl.envMap.dispose();
                            mtrl.dispose();
                        });
                    }
                    else {
                        if (node.material.map) node.material.map.dispose();
                        if (node.material.lightMap) node.material.lightMap.dispose();
                        if (node.material.bumpMap) node.material.bumpMap.dispose();
                        if (node.material.normalMap) node.material.normalMap.dispose();
                        if (node.material.specularMap) node.material.specularMap.dispose();
                        if (node.material.envMap) node.material.envMap.dispose();
                        node.material.dispose();
                    }
                }
            }
        });
    }




    function refreshScene() {

        disposeNode(scene);
        const children = scene.children;
        for (let i = children.length - 1; i >= 0; --i) {
            scene.remove(children[i]);
        }

        const mid_width = current_vmod.img_width / 2;
        const mid_height = current_vmod.img_height / 2;

        function updateMeshPosition(mesh, layer, z_depth) {
            const px = ((layer.width / 2) + layer.x) - mid_width;
            const py = (-(layer.height / 2 ) - layer.y) + mid_height;
            mesh.position.set(px, py, z_depth);
        }

        let z_depth = 300;

        const visible_paths = [
            [ "Meshes" ]
        ];

        const len = current_vmod.layer_data.length;
        for (let i = 0; i < len; ++i) {
            const layer = current_vmod.layer_data[i];
            if (layer.visible === true) {
                // If the path visible?
                let visible = false;
                for (let n = 0; n < visible_paths.length; ++n) {
                    if (JSON.stringify(visible_paths[n]) ===
                                    JSON.stringify(layer.path)) {
                        visible = true;
                        break;
                    }
                }

                if (visible) {
                    if (layer.type === 'group') {
                        const group_path_vis = layer.path.concat(layer.name);
                        visible_paths.push(group_path_vis);
                    }
                    else if (layer.type === 'layer') {
                        const mesh = layer['_three_data'].mesh;

                        // Update mesh position,
                        updateMeshPosition(mesh, layer, z_depth);

                        scene.add(mesh);
                    }
                    else {
                        throw Error('Unknown layer type: ' + layer.type);
                    }
                }
            }

            z_depth -= 2;
        }

        cur_interactible_vertices = undefined;

        // The current selection object,
        if (current_selected_layer_uid !== undefined) {
            const layer = getLayerFromUid(current_selected_layer_uid);
            if (layer['_three_data']) {
                const selected_geom = layer['_three_data'].geometry;
                const geo = new THREE.WireframeGeometry(selected_geom);
                const mat = new THREE.LineBasicMaterial( {
                    color: 0x0000000,
                    // Can't use another value. Win32 only supports 1 px line
                    // width
                    linewidth: 1
                });
                mat.transparent = true;
                mat.opacity = 0.40;
                const wireframe = new THREE.LineSegments( geo, mat );
                // Update mesh position,
                updateMeshPosition(wireframe, layer, 310);

                const pc_mat2 = new THREE.PointsMaterial({
                    size: 4,
                    sizeAttenuation: false,
                    color: 0x0000000,
                });
                cur_interactible_vertices = new THREE.Points( selected_geom, pc_mat2 );
                // Update mesh position,
                updateMeshPosition(cur_interactible_vertices, layer, 313);

                const pc_mat3 = new THREE.PointsMaterial({
                    size: 2,
                    sizeAttenuation: false,
                    color: 0x0ffffff,
                });

                const vertices2 = new THREE.Points( selected_geom, pc_mat3 );
                // Update mesh position,
                updateMeshPosition(vertices2, layer, 314);

                scene.add( wireframe, cur_interactible_vertices, vertices2 );
            }
        }

        // Mask off the edges of the scene,
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

    }

    function getLayerFromUid(layer_uid) {
        const layer_data = current_vmod.layer_data;
        const len = layer_data.length;
        for (let i = 0; i < len; ++i) {
            const ldata = layer_data[i];
            if (layer_uid === ldata.uid) {
                return ldata;
            }
        }
    }

    function toggleLayerVisibility(layer_uid) {
        if (layer_uid !== undefined) {
            const ldata = getLayerFromUid(layer_uid);
            const cur_visible = ldata.visible;
            ldata.visible = (cur_visible !== true);
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
            const ldata = getLayerFromUid(layer_uid);
            if (ldata.visible !== true) {
                view_control.classList.add('layer-view-icon-off');
            }
            view_control.addEventListener('click', doToggleVisibility);
            control_div.appendChild(view_control);
        }
    }

    function handleViewPortLeftMouseDown(evt) {
        // Check for object intersections,
        raycaster.params.Points.threshold = 10 * view_scale;
        if (cur_interactible_vertices !== undefined) {
            raycaster.setFromCamera(rc_mouse_vec, camera);
            const intersects = raycaster.intersectObject( cur_interactible_vertices );
            if (intersects.length > 0) {
                const io = intersects[0];
                const vertex_selected = {
                    index: io.index
                }
                cur_vertex_mouse_down = vertex_selected;
            }
        }
    }

    function handleViewPortLeftMouseUp(evt) {
        cur_vertex_mouse_down = undefined;
    }

    function handleVertexDrag(evt) {
        // Get the currently selected layer data,
        const ldata = getLayerFromUid(current_selected_layer_uid);
        const mesh = ldata['_three_data'].mesh;
        const geometry = ldata['_three_data'].geometry;
        const dragging_vertex_index = cur_vertex_mouse_down.index;
        const vert = geometry.vertices[dragging_vertex_index];

        // Compute document position of mouse cursor,
        const px = ((editor_dom.width / 2) * rc_mouse_vec.x);
        const py = ((editor_dom.height / 2) * rc_mouse_vec.y);
        const rpx = view_pos_x + (px * view_scale);
        const rpy = view_pos_y + (py * view_scale);

        // Update vertex,
        vert.x = rpx - mesh.position.x;
        vert.y = rpy - mesh.position.y;

        geometry.verticesNeedUpdate = true;
        mesh.needsUpdate = true;
        geometry.computeBoundingSphere();

    }


    function handleEditorMouseEvent(evt) {
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
            if (cur_vertex_mouse_down) {
                handleVertexDrag(evt);
            }
            // If scrolling the viewport window,
            else if (editor_view_change_active === true) {
                view_pos_x = editor_view_vpx +
                        ((editor_view_change_sx - evt.x) * view_scale);
                view_pos_y = editor_view_vpy -
                        ((editor_view_change_sy - evt.y) * view_scale);
            }
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

        // Set view port,
        editor_dom = renderer.domElement;
        editor_dom.className = 'noselect';
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

    }

    function renderCall(time) {
        requestAnimationFrame(renderCall);

        updateCameraPosition();

        renderer.render(scene, camera);
    }


    function lockUIForLoad() {
        console.log("LOCK UI");
    }

    function unlockUIForLoad() {
        console.log("UNLOCK UI");
    }

    function notify(event_type, ...args) {
        if (event_type === 'import_vmod') {
            const [ vmod_object ] = args;

            current_vmod = vmod_object;

            const len = current_vmod.layer_data.length;
            for (let i = len - 1; i >= 0; --i) {
                const layer = current_vmod.layer_data[i];
                if (layer.type === 'layer') {
                    const texture = layer['_three_data'].texture;

                    const seg_x = Math.ceil(layer.width / 64);
                    const seg_y = Math.ceil(layer.height / 64);

                    const geometry = new THREE.PlaneGeometry(
                                layer.width, layer.height,
                                seg_x, seg_y );

                    const material = new THREE.MeshBasicMaterial(
                        {
                            transparent: true,
                            map: texture
                        }
                    );
                    const mesh = new THREE.Mesh( geometry, [ material ] );

                    layer['_three_data'].mesh = mesh;
                    layer['_three_data'].geometry = geometry;
                }
            }

            // Make sure the 'Meshes' group is open in the tree view,
            layers_tree_panel.openGroup('Meshes');

            refreshScene();

            // Refresh layout,
            layers_tree_panel.refresh();

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
            antialias: true
        });
        renderer.setSize(view_width, view_height);
        renderer.setClearColor(0x000000, 0);
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

//        setTimeout( () => {
//            electron_inst.importLocalFile('../../../art/vanimator/tests/C1_Test.ora');
//        }, 100);

    }
    init();


    // Exported API
    return inst;

}

module.exports = EditorPanel;
