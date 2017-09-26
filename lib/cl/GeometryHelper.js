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


    function createSquareBillboardGeometry(width, height, tex_height, tex_width) {

        const geometry = new THREE.Geometry();

        const mid_wid = width / 2;
        const mid_hei = height / 2;

        const vertices = geometry.vertices;
        const faces = geometry.faces;
        const vertex_uv = [];
        geometry.faceVertexUvs[0] = vertex_uv;

        vertices.push(
            new THREE.Vector3(-mid_wid, mid_hei, 0),
            new THREE.Vector3(mid_wid, mid_hei, 0),
            new THREE.Vector3(-mid_wid, -mid_hei, 0),
            new THREE.Vector3(mid_wid, -mid_hei, 0)
        );
        faces.push(
            new THREE.Face3(1, 0, 2),
            new THREE.Face3(1, 2, 3)
        );

        const luv = 0;
        const ruv = width / tex_width;
        const tuv = 0;
        const buv = (height / tex_height);

        const face1 = [];
        face1.push(
            new THREE.Vector2(ruv, tuv),
            new THREE.Vector2(luv, tuv),
            new THREE.Vector2(luv, buv)
        );
        const face2 = [];
        face2.push(
            new THREE.Vector2(ruv, tuv),
            new THREE.Vector2(luv, buv),
            new THREE.Vector2(ruv, buv)
        );

        vertex_uv.push(face1, face2);

        geometry.uvsNeedUpdate = true;
        geometry.computeBoundingBox();

        return geometry;

    }



    // Exported API,
    return {
        createMaskGeometry,
        createSquareBillboardGeometry
    };

}

module.exports = GeometryHelper;
