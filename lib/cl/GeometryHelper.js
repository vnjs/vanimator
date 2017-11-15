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

        function insertFaceUv(ip, in_uv_buffer, uv_i) {
            const v = vertices[ ip ];
            const uvx = ((v.rx) - x) / tex_width;
            const uvy = (-(v.ry) + y) / tex_height;
            in_uv_buffer[ uv_i ] = uvx;
            in_uv_buffer[ uv_i + 1 ] = uvy;
        }

        let vanim_buffer = geometry.vanim_buffer;

        const vertices_length = vertices.length;
        const face_indexes_length = face_indexes.length;

        let vert_buffer;
        let uv_buffer;
        let faces_buffer;

        let buffer_update;

        if ( vanim_buffer === undefined ||
             vanim_buffer.vertices_length !== vertices_length ||
             vanim_buffer.face_indexes_length !== face_indexes_length ) {

            // Need to dispose geometry when it's updated otherwise we see a
            // memory leak.
            geometry.dispose();

            vert_buffer = new Float32Array( vertices_length * 3 );
            uv_buffer = new Float32Array( vertices_length * 2 );
            faces_buffer = new Uint16Array( face_indexes_length * 3 );

            geometry.vanim_buffer = {
                vert_buffer,
                uv_buffer,
                faces_buffer,
                vertices_length,
                face_indexes_length
            };

            buffer_update = true;

        }
        else {

            vert_buffer = vanim_buffer.vert_buffer;
            uv_buffer = vanim_buffer.uv_buffer;
            faces_buffer = vanim_buffer.faces_buffer;

            buffer_update = false;

        }

        const vert_map = Object.create(null);

        let n = 0;
        let uvi = 0;
        for (let i = 0; i < vertices_length; ++i) {
            const v = vertices[i];
            const mx = v.rx + v.dx;
            const my = v.ry + v.dy;

            vert_map[v.uid] = i;
            vert_buffer[ n++ ] = mx;
            vert_buffer[ n++ ] = my;
            vert_buffer[ n++ ] = 0;

            insertFaceUv( i, uv_buffer, uvi );
            uvi += 2;
        }

        n = 0;
        for (let i = 0; i < face_indexes_length; ++i) {
            const f = face_indexes[i];
            const ia = vert_map[f.a];
            const ib = vert_map[f.b];
            const ic = vert_map[f.c];
            faces_buffer[ n++ ] = ia;
            faces_buffer[ n++ ] = ib;
            faces_buffer[ n++ ] = ic;
        }

        if (buffer_update === true) {
            geometry.addAttribute('position', new THREE.BufferAttribute( vert_buffer, 3).setDynamic(true));
            geometry.addAttribute('uv', new THREE.BufferAttribute( uv_buffer, 2 ).setDynamic(true));
            geometry.setIndex( new THREE.BufferAttribute( faces_buffer, 1 ).setDynamic(true));
        }

        // console.log(geometry.attributes);

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.uv.needsUpdate = true;
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

        return updatePolygonBillboardGeometry(new THREE.BufferGeometry(),
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
