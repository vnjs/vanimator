"use strict";

const THREE = require('three');


function GeometryHelper() {


    function createBorder(xverts, yverts, vertices, faces) {
        let vis = vertices.length;
        for (let y = 0; y < yverts.length; ++y) {
            for (let x = 0; x < xverts.length; ++x) {
                vertices.push(
                    new THREE.Vector3(xverts[x], yverts[y], 0)
                );
            }
        }
        const midpointx = (xverts.length / 2) - 1;
        const midpointy = (yverts.length / 2) - 1;
        for (let y = 0; y < yverts.length - 1; ++y) {
            for (let x = 0; x < xverts.length - 1; ++x) {
                // Don't include the faces at the midpoint,
                if (x !== midpointx || y !== midpointy) {
                    faces.push(new THREE.Face3(vis + x + 1, vis + x, vis + x + yverts.length));
                    faces.push(new THREE.Face3(vis + x + 1, vis + x + yverts.length, vis + x + yverts.length + 1));
                }
            }
            vis += xverts.length;
        }
    }


    // Creates a geometry that is a 2d plane with the given rectangular area
    // 'transparent'.

    function createMaskGeometry(left, top, right, bottom) {

        const geometry = new THREE.Geometry();

        const xverts = [ left - 100000, left - 10000, left - 1000, left - 100, left, right, right + 100, right + 1000, right + 10000, right + 100000 ];
        const yverts = [ top + 100000, top + 10000, top + 1000, top + 100, top, bottom, bottom - 100, bottom - 1000, bottom - 10000, bottom - 100000 ];

        createBorder(xverts, yverts, geometry.vertices, geometry.faces);

        geometry.computeBoundingBox();

        return geometry;

    }


    // Exported API,
    return {
        createMaskGeometry
    };

}

module.exports = GeometryHelper;
