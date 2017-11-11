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
                texture: { },
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

    // Input is pre-multiplied alpha, so we can simply multiply all channels
    // with opacity for output
    gl_FragColor = tcolor * opacity;

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
                texture: { },
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

    // Input is not pre-multiplied so multiply opacity with input channel alpha
    gl_FragColor = tcolor * vec4( 1.0, 1.0, 1.0, opacity );

    // Pre-multiply the output
    gl_FragColor.rgb *= gl_FragColor.a;

}

`
        });

    }









    function setMaterialForBlendMode(material, svg_blend_mode) {



        if ( svg_blend_mode === 'svg:multiply' ) {

            // NOTE: I'm not sure there's a possible CustomBlending
            //  configuration that emulates the multiply blending mode in
            //  Krita. Krita's multiply blend mode acts like src-over when
            //  dst alpha tends towards zero, so we have to blend between
            //  one factor and dst color factor depending on dst alpha when
            //  multiplying src.

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.DstColorFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendDstAlpha = null;
            material.blendEquation = THREE.AddEquation;

        }
        else if ( svg_blend_mode === 'svg:multiply-inherit-alpha' ) {

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.DstColorFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendDstAlpha = null;
            material.blendEquation = THREE.AddEquation;

        }
        else if ( svg_blend_mode === 'svg:src-over-inherit-alpha' ) {

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.DstAlphaFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendDstAlpha = null;
            material.blendEquation = THREE.AddEquation;

        }
        else if ( svg_blend_mode === 'svg:src-over' ) {

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.OneFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendDstAlpha = null;
            material.blendEquation = THREE.AddEquation;

        }
        else if ( svg_blend_mode === 'svg:add-inherit-alpha' ) {

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.DstAlphaFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneFactor;
            material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
            material.blendEquation = THREE.AddEquation;

        }
        else if ( svg_blend_mode === 'svg:add' ) {

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.OneFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneFactor;
            material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
            material.blendEquation = THREE.AddEquation;

        }
        else if ( svg_blend_mode === 'krita:erase' ) {

            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.ZeroFactor;
            material.blendSrcAlpha = null;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendDstAlpha = null;
            material.blendEquation = THREE.AddEquation;

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
