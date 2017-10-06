"use strict";

const THREE = require('three');

function CompositingHelper() {

    function setMaterialForBlendMode(material, svg_blend_mode) {

        if ( svg_blend_mode === 'svg:multiply' ||
             svg_blend_mode === 'svg:multiply-inherit-alpha' ) {
            material.blending = THREE.CustomBlending;
            material.blendSrc = THREE.DstColorFactor;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.blendEquation = THREE.AddEquation;
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

        }
        else {
            throw Error('Unknown blend mode: ' + svg_blend_mode);
        }

    }

    return {
        setMaterialForBlendMode
    };

}

module.exports = CompositingHelper;
