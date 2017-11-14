"use strict";

const THREE = require('three');

const geom_helper = require('./GeometryHelper.js')();
const CompositingHelper = require('./CompositingHelper.js')();

function ThreeCache() {

    let threejs_cache = Object.create(null);


    // Initializes all the texture layers in the serialized state object.
    // Loads the texture/material data into the threejs_cache for each layer and
    // updates composition_controller with the initial state of the texture
    // layers (their blend mode and opacity level).

    function initializeTextureLayers(ss, renderer, composition_controller) {

        const texture_layers = ss.getArray('texture_layers');
        texture_layers.forEach((layer) => {

            const layer_type = layer.get('type');
            if (layer_type === 'layer') {

                const power = layer.getFromObject('extra_details', 'raw_texture_power');
                const tex_type = layer.get('raw_texture_type');
                const pixels = layer.get('$raw_texture_pixels').data;

                // Initialize the three.js specific data,
                // Create the threejs specific texture data
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
                else if (tex_type === 'Alpha') {
                    three_format = THREE.AlphaFormat;
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


    function getLayerData(uid) {
        return threejs_cache[uid];
    }


    function clear() {
        threejs_cache = Object.create(null);
    }



    return {
        initializeTextureLayers,
        getLayerData,
        clear
    };

}

module.exports = ThreeCache;
