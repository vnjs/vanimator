"use strict";

const THREE = require('three');

const CompositingHelper = require('./CompositingHelper.js')();

// Composites a model to a renderer. This will paint the model as a plane at
// the given Z depth in the scene. It will honor any existing z information
// currently in the render buffer to allow for further masking/occlusion
// effects.
//
// The render call may need to make multiple passes.
//

function ModelCompositor(threejs_cache) {

    // Layer tree branch,
    let layer_tree_root;

    let pool_width_height;
    let render_target_pool = [];
    let needs_renderer_cleanup = false;

    let worker_scenes = [];

    let view_mode = 'edit';




    // Sets the view mode, either 'pose' or 'edit'.
    // After the mode is set, the 'loadFrom' function must be called to
    // recompile the scene graph for the particular mode.

    function setViewMode(mode_title) {
        view_mode = mode_title;
    }



    // Returns the THREE mesh that will paint the given layer uid,
    function getLayerDrawMesh(layer_uid) {
        let mesh;
        // Get the mesh for this layer from threejs_cache,
        if (view_mode === 'edit') {
            mesh = threejs_cache[layer_uid].present_mesh;
        }
        else if (view_mode === 'pose') {
            mesh = threejs_cache[layer_uid].pose_mesh;
        }
        else {
            throw Error('Unknown view mode');
        }
        return mesh;
    }

    function getGroupDrawDetails(group_uid) {
        let mesh;
        let material;
        // Get the mesh for this layer from threejs_cache,
        if (view_mode === 'edit') {
            mesh = threejs_cache[group_uid].present_mesh;
            material = threejs_cache[group_uid].present_material;
        }
        else if (view_mode === 'pose') {
            mesh = threejs_cache[group_uid].pose_mesh;
            material = threejs_cache[group_uid].pose_material;
        }
        else {
            throw Error('Unknown view mode');
        }
        return { mesh, material };
    }



    function node(name, uid) {
        return {
            name,
            uid,
            children: []
        };
    }


    function getWorkerScene() {
        const len = worker_scenes.length;
        for (let i = 0; i < len; ++i) {
            const tscene = worker_scenes[i];
            if (tscene.in_use === false) {
                tscene.in_use = true;

                const scene = tscene.scene;
                const children = scene.children;
                const len = children.length;
                for (let i = len - 1; i >= 0; --i) {
                    scene.remove(children[i]);
                }

                return scene;
            }
        }
        const scene = new THREE.Scene();
        const tscene = {
            in_use: true,
            scene
        };
        worker_scenes.push(tscene);
        return scene;
    }

    function clearWorkerScene(scene) {
        const len = worker_scenes.length;
        for (let i = 0; i < len; ++i) {
            const tscene = worker_scenes[i];
            if (tscene.scene === scene) {
                tscene.in_use = false;
                return;
            }
        }
    }




    function disposeTree(node) {
        if (node !== undefined) {
            if (node.children !== undefined) {
                // Recurse on children,
                const children = node.children;
                const len = children.length;
                for (let i = 0; i < len; ++i) {
                    disposeTree(children[i]);
                }
            }
            // Remove scene,
            if (node.scene !== undefined) {
                const children = node.scene.children;
                const len = children.length;
                for (let i = len - 1; i >= 0; --i) {
                    const child = children[i];
                    node.scene.remove(child);
                }
                clearWorkerScene(node.scene);
            }
            // Remove geometry,
            if (node.geom !== undefined) {
                node.geom.dispose();
            }
            // Remove material,
            if (node.material !== undefined) {
                node.material.dispose();
            }
        }
    }


    function loadFrom(ss) {

        const img_width = ss.get('img_width');
        const img_height = ss.get('img_height');

        const texture_layers = ss.getArray('texture_layers');

        const root = node('Art');
        root.visible = true;

        const track = {};
        track['Art'] = root;

        texture_layers.forEach((layer) => {

            const layer_type = layer.get('type');
            const layer_path = layer.get('path');
            const layer_uid = layer.get('uid');
            const layer_path_key = layer_path.join('.');

            if (layer_path.length >= 1) {

                let nn = node(layer.get('name'), layer_uid);
                nn.type = layer_type;
                nn.opacity = layer.get('opacity');
                nn.visible = layer.get('visible');
                nn.blend = layer.get('blend');

                if (layer_type === 'group') {
                    const path_complete =
                                layer_path.concat(layer.get('uid')).join('.');

                    track[path_complete] = nn;
                    track[layer_path_key].children.push(nn);
                }
                else if (layer_type === 'layer') {
                    nn.x = layer.get('x');
                    nn.y = layer.get('y');
                    nn.width = layer.get('width');
                    nn.height = layer.get('height');

                    track[layer_path_key].children.push(nn);
                }

            }

        });

        // Build the mesh layout for all the layers and groups,

        function compile(node) {

            const scene = getWorkerScene();
            node.scene = scene;
            // Dynamic children in this scene (children that are drawn to an
            // offscreen buffer and rendered on a mesh).
            node.dynamics = [];

            // Render children from last to first,
            const children = node.children;
            const len = children.length;

            for (let i = len - 1; i >= 0; --i) {

                const child = node.children[i];
                if (child.visible === true) {

                    if (child.type === 'layer') {
                        const mesh = getLayerDrawMesh(child.uid);
                        updateMeshPosition(mesh, child, img_width, img_height);
                        child.mesh = mesh;
                        // Add it to the scene,
                        scene.add(mesh);
                        mesh.needsUpdate = true;
                    }
                    // Otherwise must be a group,
                    else {

                        // Compile the children of the group,
                        compile(child);

                        // Get the group mesh and material object from the
                        // THREE cache,
                        const { mesh, material } =
                                                getGroupDrawDetails(child.uid);
                        child.mesh = mesh;

                        function position(camera) {
                            positionRelativeToCamera(mesh, camera);
                        }

                        function mapToMesh(webgl_target) {
                            material.uniforms.texture = {
                                value: webgl_target.texture
                            };
                            material.needsUpdate = true;
                        }

                        const dynamic = {
                            position,
                            mapToMesh,
                            node: child
                        };

                        node.dynamics.push(dynamic);

                        scene.add(mesh);

                    }

                }

            }

        }
        compile(root);

        // Dispose the existing compiled root (if there is one),
        disposeTree(layer_tree_root);

        layer_tree_root = root;

    }



    function updateMeshPosition(mesh, nn, img_width, img_height) {

        mesh.position.set(0, 0, 0);

        // const mid_width = img_width / 2;
        // const mid_height = img_height / 2;
        // const px = ((nn.width / 2) + nn.x) - mid_width;
        // const py = (-(nn.height / 2 ) - nn.y) + mid_height;
        // mesh.position.set(px, py, -4);

        // const px = (nn.width / 2) + nn.x;
        // const py = (nn.height / 2 ) + nn.y;
        // mesh.position.set(px, py, -4);
    }


    function disposeAllTargets() {
        render_target_pool.forEach((ctarget) => {
            ctarget.dispose();
        });
    }


    function createRenderTarget(screen_width, screen_height) {

        if (pool_width_height !== undefined) {
            // Resize all the pooled render targets if the size is different.
            if ( screen_width !== pool_width_height.width ||
                 screen_height !== pool_width_height.height ) {
                render_target_pool.forEach((ctarget) => {
                    ctarget.resize(screen_width, screen_height);
                });
                pool_width_height = {
                    width: screen_width, height: screen_height
                };
//                needs_renderer_cleanup = true;
            }
        }
        else {
            pool_width_height = {
                width: screen_width, height: screen_height
            };
        }

        // Is there a render target we can use?
        for (let i = 0; i < render_target_pool.length; ++i) {
            const ctarget = render_target_pool[i];
            if (ctarget.in_use === false) {
                ctarget.in_use = true;
                return ctarget;
            }
        }
        // Create a new web gl render target,
        const webgl_render_target = new THREE.WebGLRenderTarget(
                                        screen_width, screen_height, {
            format: THREE.RGBAFormat,
            depthBuffer: false,
            stencilBuffer: false,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
        });
        const rt_texture = webgl_render_target.texture;
        rt_texture.generateMipmaps = false;

        // Create a default material/geom/mesh for adding the output of this
        // target into a scene.
        const material = CompositingHelper.createPreMultAlphaMaterial();
        material.uniforms.opacity = { value: 1 };
        material.uniforms.texture = { value: webgl_render_target.texture };
        CompositingHelper.setMaterialForBlendMode(material, 'svg:src-over');

        const geom = new THREE.PlaneBufferGeometry(1, 1);
        const mesh = new THREE.Mesh(geom, material);

        // The output object,
        const ctarget = {
            in_use: true,
            webgl_target: webgl_render_target,
            dispose: () => {
                ctarget.in_use = false;
            },
            resize: (w, h) => {
                webgl_render_target.setSize(w, h);
            },
            getRenderOutputMesh: () => {
                return mesh;
            }
        };

        render_target_pool.push(ctarget);
        return ctarget;
    }


    function positionRelativeToCamera(mesh, camera) {
        mesh.position.x = camera.position.x;
        mesh.position.y = camera.position.y;
        mesh.rotation.z = camera.rotation.z;
        mesh.scale.set(
                camera.right - camera.left, camera.top - camera.bottom, 1);
    }


    // Renders the model,

    function render(renderer, camera, img_width, img_height) {

        const screen_width = renderer.getSize().width;
        const screen_height = renderer.getSize().height;

        function newRenderNode(nn) {
            const dynamics = nn.dynamics;
            const len = dynamics.length;
            for (let i = 0; i < len; ++i) {
                const dynamic = dynamics[i];

                const worker_scene = newRenderNode(dynamic.node);
                const right_target =
                            createRenderTarget(screen_width, screen_height);
                renderer.setClearColor( 0, 0 );
                renderer.clearTarget(right_target.webgl_target, true, true);
                renderer.sortObjects = false;
                renderer.render(worker_scene, camera, right_target.webgl_target);
                renderer.sortObjects = true;

                dynamic.mapToMesh(right_target.webgl_target);
                dynamic.position(camera);

            }
            return nn.scene;
        }


        const base_target = createRenderTarget(screen_width, screen_height);
        const worker_scene = newRenderNode(layer_tree_root);

        renderer.setClearColor( 0x0, 0 );
        renderer.clearTarget(base_target.webgl_target, true, true);
        renderer.sortObjects = false;
        renderer.render(worker_scene, camera, base_target.webgl_target);
        renderer.sortObjects = true;

        const final_scene = getWorkerScene();

        const mesh = base_target.getRenderOutputMesh();
        positionRelativeToCamera(mesh, camera);
        final_scene.add(mesh);

        renderer.render(final_scene, camera);

        clearWorkerScene(final_scene);

        disposeAllTargets();

        if (needs_renderer_cleanup === true) {
            renderer.renderLists.dispose();
            needs_renderer_cleanup = false;
        }

    }


    return {
        setViewMode,
        loadFrom,
        render
    };

}

module.exports = ModelCompositor;
