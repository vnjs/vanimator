"use strict";

const THREE = require('three');

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



    function node(name, uid) {
        return {
            name,
            uid
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



    function loadFrom(ss) {

        // const mid_width = ss.get('img_width') / 2;
        // const mid_height = ss.get('img_height') / 2;

        const meshes = ss.getArray('meshes');

        const root = node('Meshes');

        const track = {};
        track['Meshes'] = root;

        meshes.forEach((layer) => {

            const layer_type = layer.get('type');
            const layer_path = layer.get('path');
            const layer_uid = layer.get('uid');
            const layer_path_key = layer_path.join('.');

            let nn = node(layer.get('name'), layer_uid);
            nn.type = layer_type;
            nn.opacity = layer.get('opacity');
            nn.visible = layer.get('visible');
            nn.blend = layer.get('blend');
            if (layer_type === 'group') {
                const path_complete =
                            layer_path.concat(layer.get('name')).join('.');
                track[path_complete] = nn;
                track[layer_path_key].r = nn;
            }
            else if (layer_type === 'layer') {
                nn.x = layer.get('x');
                nn.y = layer.get('y');
                nn.width = layer.get('width');
                nn.height = layer.get('height');

                track[layer_path_key].l = nn;
                track[layer_path_key] = nn;
            }

        });

        console.log(root);
        layer_tree_root = root;

    }



    function updateMeshPosition(mesh, nn, img_width, img_height) {
        const mid_width = img_width / 2;
        const mid_height = img_height / 2;
        const px = ((nn.width / 2) + nn.x) - mid_width;
        const py = (-(nn.height / 2 ) - nn.y) + mid_height;
        mesh.position.set(px, py, -4);
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
            stencilBuffer: false
        });

        let geom = new THREE.PlaneBufferGeometry(screen_width, screen_height);

        console.log(webgl_render_target.texture);
        webgl_render_target.texture.premultipliedeAlpha = false;

        const mat = new THREE.MeshBasicMaterial({
            map: webgl_render_target.texture,
            depthTest: false,
            depthWrite: false,
            transparent: true,
//            opacity: 0.95
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor, // THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,

            // blendSrc: THREE.SrcAlphaFactor,
            // blendDst: THREE.OneMinusSrcAlphaFactor,
            // blendSrcAlpha: THREE.OneFactor,
            // blendDstAlpha: THREE.OneMinusSrcAlphaFactor,

            blendEquation: THREE.AddEquation,

        });
        const mesh = new THREE.Mesh(geom, mat);

        const bg_geometry = new THREE.PlaneBufferGeometry(2, 2);
        const bg_material = new THREE.MeshBasicMaterial({
            map: webgl_render_target.texture,
        });
        const background_mesh = new THREE.Mesh(bg_geometry, bg_material);
        const background_scene = new THREE.Scene();
        const background_camera = new THREE.Camera();
        background_scene.add(background_camera);
        background_scene.add(background_mesh);
        const ctarget = {
            in_use: true,
            geom,
            mesh,
            webgl_target: webgl_render_target,
            background_scene: background_scene,
            background_camera: background_camera,
            dispose: () => {
                ctarget.in_use = false;
            },
            resize: (w, h) => {
                webgl_render_target.setSize(w, h);
                geom.dispose();
                geom = new THREE.PlaneBufferGeometry(w, h);
                ctarget.mesh = new THREE.Mesh(geom, mat);
            }
        };
        render_target_pool.push(ctarget);
        return ctarget;
    }


    function positionRelativeToCamera(mesh, geom, screen_width, camera) {
        const scale = (camera.right - camera.left) / screen_width;
        mesh.position.x = camera.position.x;
        mesh.position.y = camera.position.y;
        mesh.scale.set(scale, scale, scale);
    }


    // Renders the model,

    function render(renderer, camera, img_width, img_height) {

        const screen_width = renderer.getSize().width;
        const screen_height = renderer.getSize().height;

        function paintOn(target_dest, layer_node, in_scene) {
            const mesh = threejs_cache[layer_node.uid].mesh;
            updateMeshPosition(mesh, layer_node, img_width, img_height);
            mesh.renderOrder = 300 - in_scene.children.length;
            mesh.needsUpdate = true;
            in_scene.add(mesh);

        }

        function renderNode(nn, target, in_scene) {
            const left = nn.l;
            const right = nn.r;

            if (left !== undefined) {
                renderNode(left, target, in_scene);
            }
            if (right !== undefined) {
                const right_scene = getWorkerScene();
                const right_target =
                            createRenderTarget(screen_width, screen_height);
                renderNode(right, right_target, right_scene);
                renderer.setClearColor( 0x0ffffff, 0 );
                renderer.clearTarget(right_target.webgl_target, true, true);
                renderer.sortObjects = false;
                renderer.render(right_scene, camera, right_target.webgl_target);
                renderer.sortObjects = true;

                const mesh = right_target.mesh;
                const geom = right_target.geom;
                positionRelativeToCamera(mesh, geom, screen_width, camera);
                mesh.renderOrder = 300 - in_scene.children.length;
                mesh.needsUpdate = true;
                in_scene.add(mesh);

                clearWorkerScene(right_scene);
            }
            if (nn.type === 'layer') {
                paintOn(target, nn, in_scene);
            }
        }


        const worker_scene = getWorkerScene();
        const base_target = createRenderTarget(screen_width, screen_height);
        renderNode(layer_tree_root, base_target, worker_scene);

        renderer.setClearColor( 0x0ffffff, 0 );
        renderer.clearTarget(base_target.webgl_target, true, true);
        renderer.sortObjects = false;
        renderer.render(worker_scene, camera, base_target.webgl_target);
        renderer.sortObjects = true;

        const final_scene = getWorkerScene();
        const mesh = base_target.mesh;
        const geom = base_target.geom;
        positionRelativeToCamera(mesh, geom, screen_width, camera);
        final_scene.add(mesh);
        renderer.render(final_scene, camera);

        disposeAllTargets();

        clearWorkerScene(worker_scene);
        clearWorkerScene(final_scene);


        if (needs_renderer_cleanup === true) {
            renderer.renderLists.dispose();
            needs_renderer_cleanup = false;
        }

    }


    return {
        loadFrom,
        render
    };

}

module.exports = ModelCompositor;
