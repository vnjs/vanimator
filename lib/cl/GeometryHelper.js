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


    // Creates a billboard plane geometry with arbitrary number of vertices and
    // faces. Maps the UV of the image over the geometry.
    // (width, height) is the dimension of the image within the texture.
    // (tex_width, tex_height) is the dimension of the texture itself.

    function createPolygonBillboardGeometry(vertices, face_indexes,
                                        width, height, tex_width, tex_height) {

        const geometry = new THREE.Geometry();
        const mid_wid = width / 2;
        const mid_hei = height / 2;

        const geom_vertices = geometry.vertices;
        const geom_faces = geometry.faces;

        const geom_vertex_uv = [];
        geometry.faceVertexUvs[0] = geom_vertex_uv;

        vertices.forEach((v) => {
            geom_vertices.push( new THREE.Vector3(v.x, v.y, v.z) );
        });
        face_indexes.forEach((f) => {
            geom_faces.push( new THREE.Face3(f.a, f.b, f.c) );
        });

        function uvFromVertex(vertex) {
            const uvx = (vertex.x - -mid_wid) / tex_width;
            const uvy = (-vertex.y - -mid_hei) / tex_height;
            return new THREE.Vector2(uvx, uvy);
        }

        geom_faces.forEach((face) => {
            const face_uv = [];
            face_uv.push( uvFromVertex( geom_vertices[ face.a ] ) );
            face_uv.push( uvFromVertex( geom_vertices[ face.b ] ) );
            face_uv.push( uvFromVertex( geom_vertices[ face.c ] ) );
            geom_vertex_uv.push( face_uv );
        });

        geometry.uvsNeedUpdate = true;
        geometry.computeBoundingBox();

        return geometry;

    }


    function createSquareBillboardGeometry(width, height, tex_width, tex_height) {

        const mid_wid = width / 2;
        const mid_hei = height / 2;

        const vertices = [
            new THREE.Vector3(-mid_wid, mid_hei, 0),
            new THREE.Vector3(mid_wid, mid_hei, 0),
            new THREE.Vector3(-mid_wid, -mid_hei, 0),
            new THREE.Vector3(mid_wid, -mid_hei, 0)
        ];
        const faces = [
            new THREE.Face3(1, 0, 2),
            new THREE.Face3(1, 2, 3)
        ];

        return createPolygonBillboardGeometry(
                    vertices, faces, width, height, tex_width, tex_height);

    }


    // Returns true if the given point is inside the polygon represented by the
    // vertex set 'vs'.

    function pointInsidePolygon(x, y, vs) {
        // ray-casting algorithm based on
        // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i][0];
            let yi = vs[i][1];
            let xj = vs[j][0];
            let yj = vs[j][1];

            let intersect = ((yi > y) !== (yj > y)) &&
                                (x < ((xj - xi) * (y - yi) / (yj - yi)) + xi);
            if (intersect) {
                inside = !inside;
            }
        }

        return inside;
    }


    // Exported API,
    return {
        createMaskGeometry,
        createPolygonBillboardGeometry,
        createSquareBillboardGeometry,
        pointInsidePolygon
    };

}

module.exports = GeometryHelper;
