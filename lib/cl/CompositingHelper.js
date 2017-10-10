"use strict";

const THREE = require('three');

function CompositingHelper() {




    // A material for a texture that has pre-multiplied alpha.
    // Output is pre-multiplied.

    function createPreMultAlphaMaterial() {

        return new THREE.ShaderMaterial({
            transparent: true,
            uniforms: {
                opacity: { value: 1.0 },
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

    }

    // A material for a texture with alpha (not pre-multiplied).
    // Output is pre-multiplied.

    function createAlphaMaterial() {

        return new THREE.ShaderMaterial({
            transparent: true,
            uniforms: {
                opacity: { value: 1.0 },
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
    vec4 diffuse = vec4( 1.0, 1.0, 1.0, opacity );
    gl_FragColor = tcolor * diffuse;
    gl_FragColor.rgb *= gl_FragColor.a;
}

`
        });

    }









    function setMaterialForBlendMode(material, svg_blend_mode) {

        if ( svg_blend_mode === 'svg:multiply' ||
             svg_blend_mode === 'svg:multiply-inherit-alpha' ) {
            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.DstColorFactor;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendEquation = THREE.AddEquation;

            // material.blendSrc = THREE.ZeroFactor;
            // material.blendDst = THREE.SrcColorFactor;
            // material.blendSrcAlpha = THREE.ZeroFactor;
            // material.blendDstAlpha = THREE.SrcAlpha;

//                    material.blending = THREE.MultiplyBlending;

        }
        else if ( svg_blend_mode === 'svg:src-over-inherit-alpha' ) {

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

        }
        else if ( svg_blend_mode === 'svg:src-over' ) {

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

            //
            // material.blending = THREE.CustomBlending;
            // material.blendSrc = THREE.SrcAlphaFactor;
            // material.blendDst = THREE.OneMinusSrcAlphaFactor;
            // material.blendSrcAlpha = THREE.OneFactor;
            // material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
            // material.blendEquation = THREE.AddEquation;



        }
        else {
            throw Error('Unknown blend mode: ' + svg_blend_mode);
        }

    }

    return {
        createAlphaMaterial,
        createPreMultAlphaMaterial,
        setMaterialForBlendMode
    };

}

module.exports = CompositingHelper;
