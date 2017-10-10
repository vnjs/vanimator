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

    let view_mode = 'present';




    // Sets the view mode, either 'pose' or 'present'.
    // After the mode is set, the 'loadFrom' function must be called to
    // recompile the scene graph for the particular mode.

    function setViewMode(mode_title) {
        view_mode = mode_title;
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
            if (node.scene !== undefined) {
                const children = node.scene.children;
                const len = children.length;
                for (let i = len - 1; i >= 0; --i) {
                    node.scene.remove(children[i]);
                }
            }
            if (node.geom !== undefined) {
                node.geom.dispose();
            }
            if (node.material !== undefined) {
                node.material.dispose();
            }
        }
    }


    function loadFrom(ss) {

        const img_width = ss.get('img_width');
        const img_height = ss.get('img_height');

        const meshes = ss.getArray('meshes');

        const root = node('Meshes');
        root.visible = true;

        const track = {};
        track['Meshes'] = root;

        meshes.forEach((layer) => {

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
                                layer_path.concat(layer.get('name')).join('.');

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

            const scene = new THREE.Scene();
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
                        let mesh;
                        // Get the mesh for this layer from threejs_cache,
                        if (view_mode === 'present') {
                            mesh = threejs_cache[child.uid].present_mesh;
                        }
                        else if (view_mode === 'pose') {
                            mesh = threejs_cache[child.uid].pose_mesh;
                        }
                        else {
                            throw Error('Unknown view mode');
                        }
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

                        let geom = new THREE.PlaneGeometry(1, 1);
//                         // Make a mesh for this group,
//                         const material = new THREE.MeshBasicMaterial({
//                             depthTest: false,
//                             depthWrite: false,
//                             transparent: true,
//                             fog: false,
//                             lights: false,
//                             flatShading: true,
//                         });
//                         material.opacity = child.opacity;
//
//                         // material.blending = THREE.CustomBlending;
//                         // material.blendSrc = THREE.OneFactor;
//                         // material.blendDst = THREE.OneMinusSrcAlphaFactor;
//                         // material.blendSrcAlpha = THREE.SrcAlphaFactor;
//                         // material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
//                         // material.blendEquation = THREE.AddEquation;
//                         material.premultipliedAlpha = false;


                        const material = new THREE.ShaderMaterial({
                            transparent: true,
                            uniforms: {
                                opacity: { value: child.opacity },
                                texture: {},
                            },
                            vertexShader: `
varying vec2 vUv;
void main() {
	vUv = uv;
    vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * modelViewPosition;
}
`,
                            fragmentShader: `
uniform float opacity;
uniform sampler2D texture;
varying vec2 vUv;
void main() {
	vec4 tcolor = texture2D( texture, vUv );

    // Input is premultiplied against alpha, so we multiply all channels with
    // alpha.
    vec4 diffuse = vec4( opacity );
    gl_FragColor = tcolor * diffuse;
}

`
                        });


                        CompositingHelper.setMaterialForBlendMode(material, child.blend);

                        const mesh = new THREE.Mesh(geom, material);

                        child.geom = geom;
                        child.mesh = mesh;
                        child.material = material;

                        function position(screen_width, screen_height, camera) {
                            const scale = (camera.right - camera.left) / screen_width;
                            mesh.position.x = camera.position.x;
                            mesh.position.y = camera.position.y;
                            mesh.scale.set(scale * screen_width, scale * screen_height, 1);
                        }

                        function mapToMesh(webgl_target) {
//                            material.map = webgl_target.texture;
                            material.uniforms.texture = { value: webgl_target.texture };
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

        mesh.position.set(0, 0, -4);

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
            stencilBuffer: false
        });

        let geom = new THREE.PlaneBufferGeometry(screen_width, screen_height);

//        console.log(webgl_render_target.texture);
//        webgl_render_target.texture.premultipliedAlpha = true;

        const blend_normal_mat = new THREE.MeshBasicMaterial({
            map: webgl_render_target.texture,
            depthTest: false,
            depthWrite: false,
            transparent: true,

            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor, // SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendEquation: THREE.AddEquation,

        });

        const blend_normal_mesh = new THREE.Mesh(geom, blend_normal_mat);

        const ctarget = {
            in_use: true,
            geom,
            blend_normal_mesh,
            webgl_target: webgl_render_target,
            dispose: () => {
                ctarget.in_use = false;
            },
            resize: (w, h) => {
                webgl_render_target.setSize(w, h);
                geom.dispose();
                geom = new THREE.PlaneBufferGeometry(w, h);
                ctarget.blend_normal_mesh = new THREE.Mesh(geom, blend_normal_mat);
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
                dynamic.position(screen_width, screen_height, camera);

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
        const mesh = base_target.blend_normal_mesh;
        const geom = base_target.geom;
        positionRelativeToCamera(mesh, geom, screen_width, camera);
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
