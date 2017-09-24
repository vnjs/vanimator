"use strict";

/* globals requestAnimationFrame */

const THREE = require('three');
const Split = require('split.js');
const local_store = require('./LocalStore.js')();
const MouseEventHandler = require('./MouseEventHandler.js');
const TreePanel = require('./TreePanel.js');

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
    let view_width = 100;
    let view_height = 100;
    let view_pos_x = 0;
    let view_pos_y = 0;

    let editor_view_change_active = false;
    let editor_view_change_sx, editor_view_change_sy;
    let editor_view_vpx, editor_view_vpy;

    let layers_tree_panel;

    let current_vmod;

    function layoutResizeHandler() {

        view_width = ui_central_content.clientWidth;
        view_height = ui_central_content.clientHeight;

        const tc_width = ui_timeline_content.clientWidth;
        const tc_height = ui_timeline_content.clientHeight;

        // Resize the view panel,
        renderer.setSize(view_width, view_height);
        const scale = 1;
        camera = new THREE.OrthographicCamera(
                        (view_width / -2) * scale, (view_width / 2) * scale,
                        (view_height / 2) * scale, (view_height / -2) * scale,
                        1, 1000 );
        camera.position.z = 500;

    }

    // Returns a tree model of the model,
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

//            console.log(out);

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

        let z_depth = 300;

        const visible_paths = [
            [ "Meshes" ],
            [ "Deformers" ]
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
                        mesh.position.z = z_depth;
                        scene.add(mesh);
                    }
                    else {
                        throw Error('Unknown layer type: ' + layer.type);
                    }
                }
            }

            z_depth -= 2;
        }

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

    function handleEditorMouseEvent(evt) {
        // If middle mouse button down,
        if (evt.type === 'mousedown' && evt.button === 1) {
            editor_view_change_active = true;
            editor_view_change_sx = evt.x;
            editor_view_change_sy = evt.y;
            editor_view_vpx = view_pos_x;
            editor_view_vpy = view_pos_y;
        }
        else if (evt.type === 'mouseup' && evt.button === 1) {
            editor_view_change_active = false;
        }
        // Middle mouse drag view,
        else if (evt.type === 'mousemove' &&
                 editor_view_change_active === true) {
            view_pos_x = editor_view_vpx + (editor_view_change_sx - evt.x);
            view_pos_y = editor_view_vpy - (editor_view_change_sy - evt.y);
        }
    }

    function handleLayerSelectChange(evt) {
        console.log(evt);
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
        const editor_dom = renderer.domElement;
        editor_dom.className = 'noselect';
        ui_central_content.appendChild(editor_dom);

        // Capture mouse events on the editor panel,
        mouse_evt_handler.captureMouseEvents(editor_dom, handleEditorMouseEvent);

        editor_dom.unselectable = "on";
        editor_dom.onselectstart = function() {
            return false;
        };
        editor_dom.style.userSelect = "none";
        editor_dom.style.MozUserSelect = "none";

    }

    function renderCall(time) {
        requestAnimationFrame(renderCall);

        // Set up camera position,
        camera.position.x = view_pos_x;
        camera.position.y = view_pos_y;

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

            const mid_width = current_vmod.img_width / 2;
            const mid_height = current_vmod.img_height / 2;

            const len = current_vmod.layer_data.length;
            for (let i = len - 1; i >= 0; --i) {
                const layer = current_vmod.layer_data[i];
                if (layer.type === 'layer') {
                    const texture = layer['_three_data'].texture;

                    const geometry = new THREE.PlaneGeometry( layer.width, layer.height, 32, 32 );
                    const material = new THREE.MeshBasicMaterial(
                        {
                            transparent: true,
                            map: texture
                        }
                    );
                    const mesh = new THREE.Mesh( geometry, [ material ] );
                    const px = ((layer.width / 2) + layer.x) - mid_width;
                    const py = (-(layer.height / 2 ) - layer.y) + mid_height;
                    mesh.position.set(px, py, 0);

                    layer['_three_data'].mesh = mesh;
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
            alpha: true
        });
        renderer.setSize(view_width, view_height);
        renderer.setClearColor(0x000000, 0);

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
