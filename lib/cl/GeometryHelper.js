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

        geometry.computeBoundingSphere();

        return geometry;

    }



    // Maps vertices and faces to a THREE Geometry, and assigns a propietary
    // property to the geometry;
    //
    // vanim_mutable_vert_map = Maps from vertex uid to the mutable vector that
    //   can be used to morph the geometry.

    function updatePolygonBillboardGeometry(
                    geometry, vertices, face_indexes,
                    x, y, width, height, tex_width, tex_height) {

        // Need to dispose geometry when it's updated otherwise we see a
        // memory leak.
        geometry.dispose();

        const geom_vertices = geometry.vertices;
        const geom_faces = geometry.faces;

        geom_vertices.length = 0;
        geom_faces.length = 0;

        const vert_map = Object.create(null);
        const mutable_vert_map = Object.create(null);
        vertices.forEach((v, i) => {
            const x = v.rx + v.dx;
            const y = v.ry + v.dy;
            const mutable_vert = new THREE.Vector3(x, y, 0);
            vert_map[v.uid] = i;
            mutable_vert_map[v.uid] = mutable_vert;
            // The current mutable vertex items,
            geom_vertices.push( mutable_vert );
        });

        face_indexes.forEach((f) => {
            const va = vert_map[f.a];
            const vb = vert_map[f.b];
            const vc = vert_map[f.c];
            if (va !== undefined && vb !== undefined && vc !== undefined) {
                geom_faces.push( new THREE.Face3(va, vb, vc) );
            }
        });

        // Put the generated vertex map into propietary property of geometry,
        geometry.vanim_mutable_vert_map = mutable_vert_map;

        // Update the UV,
        const geom_vertex_uv = [];
        geometry.faceVertexUvs[0] = geom_vertex_uv;

        function uvFromVertex(v) {
            const uvx = (v.rx - x) / tex_width;
            const uvy = (-v.ry + y) / tex_height;
            return new THREE.Vector2(uvx, uvy);
        }

        geom_faces.forEach((face) => {
            const face_uv = [];
            const va = vertices[ face.a ];
            const vb = vertices[ face.b ];
            const vc = vertices[ face.c ];
            if (va !== undefined && vb !== undefined && vc !== undefined) {
                face_uv.push( uvFromVertex( va ) );
                face_uv.push( uvFromVertex( vb ) );
                face_uv.push( uvFromVertex( vc ) );
                geom_vertex_uv.push( face_uv );
            }
        });

        geometry.verticesNeedUpdate = true;
        geometry.elementsNeedUpdate = true;
        geometry.uvsNeedUpdate = true;
        geometry.computeBoundingSphere();

        return geometry;

    }

    // Creates a billboard plane geometry with arbitrary number of vertices and
    // faces. Maps the UV of the image over the geometry.
    // (width, height) is the dimension of the image within the texture.
    // (tex_width, tex_height) is the dimension of the texture itself.

    function createPolygonBillboardGeometry(vertices, face_indexes,
                                x, y, width, height, tex_width, tex_height) {

        return updatePolygonBillboardGeometry(new THREE.Geometry(),
                vertices, face_indexes,
                x, y, width, height, tex_width, tex_height);

    }


    // Creates a square billboard geometry,

    function createSquareBillboardGeometry(
                                x, y, width, height, tex_width, tex_height) {

        let n = -1;

        function v2(x, y) {
            ++n;
            return { uid: n, rx: x, ry: y, dx: 0, dy: 0 };
        }
        function f(a, b, c) {
            return { a, b, c };
        }

        const vertices = [
            v2(x, y),
            v2(x + width, y),
            v2(x, y - height),
            v2(x + width, y - height)
        ];
        const faces = [
            f(1, 0, 2),
            f(1, 2, 3)
        ];

        return createPolygonBillboardGeometry(
                    vertices, faces, x, y, width, height, tex_width, tex_height);

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


    // Computes the minimum distance squared from the given point (x, y) to
    // the line segment represented by the (x1, y1) and (x2, y2)
    // Square root the result to calc the actual distance.

    function minimumDistanceSqPointToLine(x, y, x1, y1, x2, y2) {

        const C = x2 - x1;
        const D = y2 - y1;
        const len_sq = (C * C) + (D * D);

        const A = x - x1;
        const B = y - y1;
        const dot = (A * C) + (B * D);

        let dot_over_len = -1;
        // In case of 0 length line
        if (len_sq !== 0) {
            dot_over_len = dot / len_sq;
        }

        let xx, yy;

        if (dot_over_len < 0) {
            xx = x1;
            yy = y1;
        }
        else if (dot_over_len > 1) {
            xx = x2;
            yy = y2;
        }
        else {
            xx = x1 + (dot_over_len * C);
            yy = y1 + (dot_over_len * D);
        }

        const dx = x - xx;
        const dy = y - yy;
        return (dx * dx) + (dy * dy);
    }




    // Exported API,
    return {
        createMaskGeometry,
        updatePolygonBillboardGeometry,
        createPolygonBillboardGeometry,
        createSquareBillboardGeometry,

        pointInsidePolygon,
        minimumDistanceSqPointToLine
    };

}

module.exports = GeometryHelper;
