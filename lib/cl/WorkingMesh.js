"use strict";

const THREE = require('three');

const uuidv1 = require('uuid/v1');
const earcut = require('earcut');

const { pointInsidePolygon } = require('./GeometryHelper.js')();


// A WorkingMesh is a set of uniquely identifiable 2D vertexes together with
// a set of 3 set triangular face indexes. The data in the working mesh can
// be converted into different forms depending on who is using it.
//
// NOTE: It's not intended for WorkingMesh to be used in the final display
//   format as the format is not space optimal.

function WorkingMesh() {

    function NamedVertex(uid, rx, ry, dx, dy) {
        if (dx === undefined) {
            dx = 0;
        }
        if (dy === undefined) {
            dy = 0;
        }
        return { uid, rx, ry, dx, dy };
    }

    function Face(a, b, c) {
        return { a, b, c };
    }


    let include_morph = false;


    // Map of named vertexes.
    let vertex_map = {};
    // List (by insert order) of named vertexes.
    let vertex_arr = [];
    // List of edges (edge between i and i + 1).
    let edge_indexes = [];
    // List of faces.
    let face_indexes = [];



    function getCurrentMeshDetails() {
        return {
            vertex_arr,
            face_indexes
        };
    }

    function setIncludeMorph(b) {
        include_morph = b;
    }


    function getVectorX(v) {
        if (include_morph === true) {
            return v.rx + v.dx;
        }
        return v.rx;
    }
    function getVectorY(v) {
        if (include_morph === true) {
            return v.ry + v.dy;
        }
        return v.ry;
    }


    function findDistanceDiff(v, x, y, radius) {
        const dx = x - getVectorX(v);
        const dy = y - getVectorY(v);
        const distance_dif = ((dx * dx) + (dy * dy)) - (radius * radius);
        return distance_dif;
    }

    // Returns the closest vertex that is within the given radius of the
    // coordinates x, y.

    function nearestVertexUidTo(x, y, radius) {
        const len = vertex_arr.length;
        const within_radius = [];
        for (let i = len - 1; i >= 0; --i) {
            const v = vertex_arr[i];
            const dd = findDistanceDiff(v, x, y, radius);
            if (dd < 0) {
                within_radius.push([i, dd]);
            }
        }
        if (within_radius.length > 0) {
            // Find the smallest one.
            const len = within_radius.length;
            let smallest = 1;
            let smallest_i;
            for (let i = 0; i < len; ++i) {
                const r = within_radius[i];
                const dd = r[1];
                if (dd < smallest) {
                    smallest_i = r[0];
                    smallest = dd;
                }
            }
            return [ vertex_arr[smallest_i].uid ];
        }
        else {
            return [ ];
        }
    }

    function allVertexUid() {
        return Object.keys(vertex_map);
    }


    function allVertexUidWithin(polygon) {
        const out = [];
        const len = vertex_arr.length;
        for (let i = 0; i < len; ++i) {
            const v = vertex_arr[i];
            if (pointInsidePolygon(
                            getVectorX(v), getVectorY(v), polygon) === true) {
                out.push(v.uid);
            }
        }
        return out;
    }


    // Adds a vertex at the given location. The x/y coordinates are in
    // document space.

    function addVertex(x, y) {
        const uid = uuidv1();
        const v = NamedVertex(uid, x, y);
        vertex_arr.push(v);
        vertex_map[uid] = v;
        return uid;
    }

    // Adds an edge between two vertex uids.

    function addEdge(vertex1_uid, vertex2_uid, edge_type) {

        // If this edge makes a triangle then we fill it,
        const v1_connections = [];
        const v2_connections = [];
        const len = edge_indexes.length;
        for (let i = 0; i < len; i += 2) {
            const ep1 = edge_indexes[i];
            const ep2 = edge_indexes[i + 1];

            if (ep1 === vertex1_uid && ep2 === vertex2_uid) {
                // Edge already defined,
                return;
            }
            if (ep2 === vertex1_uid && ep1 === vertex2_uid) {
                return;
            }

            if (ep1 === vertex1_uid) {
                v1_connections.push(ep2);
            }
            else if (ep2 === vertex1_uid) {
                v1_connections.push(ep1);
            }
            if (ep1 === vertex2_uid) {
                v2_connections.push(ep2);
            }
            else if (ep2 === vertex2_uid) {
                v2_connections.push(ep1);
            }
        }

        const shared_i = [];
        for (let i = 0; i < v1_connections.length; ++i) {
            const p1i = v1_connections[i];
            if (v2_connections.indexOf(p1i) >= 0) {
                shared_i.push(p1i);
            }
        }

        edge_indexes.push(vertex1_uid);
        edge_indexes.push(vertex2_uid);

        if (shared_i.length > 0) {

            shared_i.forEach((vertex3_uid) => {
                const v1 = vertex_map[vertex1_uid];
                const v2 = vertex_map[vertex2_uid];
                const v3 = vertex_map[vertex3_uid];

                const tri_faces = earcut([
                    v1.rx, v1.ry,
                    v2.rx, v2.ry,
                    v3.rx, v3.ry
                ]);
                const route_lu = [ vertex1_uid, vertex2_uid, vertex3_uid ];

                face_indexes.push(
                    Face(route_lu[tri_faces[0]],
                         route_lu[tri_faces[1]],
                         route_lu[tri_faces[2]] ));

            });
        }

    }



    // Moves a single vertex with the given uid,

    function moveSingleVertex(uid, rx, ry) {
        const v = vertex_map[uid];
        if (v === undefined) {
            throw Error("Vertex not found");
        }
        v.rx = rx;
        v.ry = ry;
    }

    function moveSingleVertexMorph(uid, x, y) {
        const v = vertex_map[uid];
        if (v === undefined) {
            throw Error("Vertex not found");
        }
        v.dx = x - v.rx;
        v.dy = y - v.ry;

//        v.dx = dx;
//        v.dy = dy;
    }


    // Removes all named indexes from the given set,

    function removeAllVertexesFrom(uid_set) {

        const lup_map = {};
        uid_set.forEach((uid) => {
            lup_map[uid] = true;
        });

        const len = vertex_arr.length;
        for (let i = len - 1; i >= 0; --i) {
            const v = vertex_arr[i];
            if (lup_map[v.uid] === true) {
                vertex_arr.splice(i, 1);
                delete vertex_map[v.uid];
            }
        }

        // Update edges,
        const edge_len = edge_indexes.length;
        for (let i = edge_len - 2; i >= 0; i -= 2) {
            const ev1 = edge_indexes[i];
            const ev2 = edge_indexes[i + 1];
            if (lup_map[ev1] === true || lup_map[ev2] === true) {
                edge_indexes.splice(i, 2);
            }
        }

        // Kill faces,
        const face_len = face_indexes.length;
        for (let i = face_len - 1; i >= 0; --i) {
            const f = face_indexes[i];
            if ( lup_map[f.a] === true ||
                 lup_map[f.b] === true ||
                 lup_map[f.c] === true ) {
                face_indexes.splice(i, 1);
            }
        }

    }

    // Clears the mesh of all vertexes/edges and faces,

    function clear() {
        vertex_arr.length = 0;
        vertex_map = {};
        edge_indexes.length = 0;
        face_indexes.length = 0;
    }


    function getVertex(uid) {
        return vertex_map[uid];
    }



    function convertCopy(a, f) {
        if (a === undefined) {
            return [];
        }
        // Convert,
        if (a.length > 0) {
            const out = [];
            const len = a.length;
            for (let i = 0; i < len; ++i) {
                out.push( f(a[i]) );
            }
            return out;
        }
        return a.slice(0);
    }

    function arrCopy(a) {
        if (a === undefined) {
            return [];
        }
        return a.slice(0);
    }

    function arrCopyVertexes(v) {
        return convertCopy(v,
            (vt) => NamedVertex( vt.uid, vt.rx, vt.ry, vt.dx, vt.dy )
        );
    }



    function loadFrom(ss, mesh_uid) {
        const meshes = ss.getArray('meshes');
        const mesh = meshes.get(mesh_uid);
        vertex_arr = arrCopyVertexes( mesh.get('me_vertices') );
        edge_indexes = arrCopy( mesh.get('me_edge_indexes') );
        face_indexes = arrCopy( mesh.get('me_face_indexes') );
        vertex_map = {};
        vertex_arr.forEach((v) => {
            vertex_map[v.uid] = v;
        });
    }

    function saveTo(ss, mesh_uid) {
        const meshes = ss.getArray('meshes');
        const mesh = meshes.get(mesh_uid);
        mesh.set('me_vertices', arrCopyVertexes( vertex_arr ));
        mesh.set('me_edge_indexes', arrCopy( edge_indexes ));
        mesh.set('me_face_indexes', arrCopy( face_indexes ));
        console.log("SAVE!");
    }


    function createTHREEVertex(uid) {
        const v = vertex_map[uid];
        return new THREE.Vector3(getVectorX(v), getVectorY(v), 0);
    }

    function toTHREEVertexes(uids) {
        const vts = [];
        uids.forEach((uid) => {
            vts.push(createTHREEVertex(uid));
        });
        return vts;
    }



    function createTHREEFacesGeometry() {
        const geometry = new THREE.Geometry();
        const len = face_indexes.length;
        const verts = geometry.vertices;
        const faces = geometry.faces;
        for (let n = 0; n < len; ++n) {
            const f = face_indexes[n];
            const p = verts.length;
            verts.push(createTHREEVertex(f.a));
            verts.push(createTHREEVertex(f.b));
            verts.push(createTHREEVertex(f.c));
            faces.push(new THREE.Face3(p, p + 1, p + 2));
        }
        geometry.computeBoundingSphere();
        return geometry;
    }

    function createTHREEEdgesGeometry() {
        const geometry = new THREE.Geometry();
        const len = edge_indexes.length;
        const verts = geometry.vertices;
        for (let n = 0; n < len; ++n) {
            verts.push(createTHREEVertex(edge_indexes[n]));
        }
        geometry.computeBoundingSphere();
        geometry.computeLineDistances();
        return geometry;
    }


    return {

        setIncludeMorph,
        getCurrentMeshDetails,

        allVertexUidWithin,
        nearestVertexUidTo,
        allVertexUid,

        addVertex,
        addEdge,

        moveSingleVertex,
        moveSingleVertexMorph,
        removeAllVertexesFrom,
        clear,

        loadFrom,
        saveTo,

        toTHREEVertexes,
        createTHREEFacesGeometry,
        createTHREEEdgesGeometry

    };

}

module.exports = WorkingMesh;
