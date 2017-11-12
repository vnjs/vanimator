"use strict";

const THREE = require('three');

const uuidv1 = require('uuid/v1');
const earcut = require('earcut');

const { pointInsidePolygon } = require('./GeometryHelper.js')();

const AreaManager = require('./AreaManager.js');


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
            edge_indexes,
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

    // Returns the closest vertex that is within the given radius of the
    // coordinates x, y.
    const area_manager = AreaManager(getVectorX, getVectorY);
    function nearestVertexUidTo(x, y, radius) {
        return area_manager.nearestPointUidTo(vertex_arr, x, y, radius);
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



    function getSingleVertex(uid) {
        const v = vertex_map[uid];
        if (v === undefined) {
            throw Error("Vertex not found");
        }
        return {
            x: v.rx,
            y: v.ry
        };
    }

    function getSingleVertexMorph(uid) {
        const v = vertex_map[uid];
        if (v === undefined) {
            throw Error("Vertex not found");
        }
        return {
            x: v.rx + v.dx,
            y: v.ry + v.dy
        };
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
    }

    function flipFaces(uids) {
        // All faces that contain the given vertex uids,
        face_indexes.forEach((face) => {
            let contains_count = 0;
            contains_count += (uids.indexOf(face.a) >= 0) ? 1 : 0;
            contains_count += (uids.indexOf(face.b) >= 0) ? 1 : 0;
            contains_count += (uids.indexOf(face.c) >= 0) ? 1 : 0;
            if (contains_count === 3) {
                const t = face.a;
                face.a = face.b;
                face.b = t;
            }
        });
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





    // Create a set of weighted vertex uid points around the selected uids with
    // the given radius.

    function createWeightedSelection(selected_uids, radius) {

        const weighted_vs = {};

        vertex_arr.forEach((v) => {
            const vuid = v.uid;
            const x = getVectorX(v);
            const y = getVectorY(v);

            let weight = 0;
            if (selected_uids.indexOf(vuid) >= 0) {
                weight = 1;
            }
            else if (radius > 0) {
                // Calculate weight
                selected_uids.forEach((vuid) => {
                    const sv = vertex_map[vuid];
                    const dx = getVectorX(sv) - x;
                    const dy = getVectorY(sv) - y;
                    // Early exit,
                    if (Math.abs(dx) <= radius || Math.abs(dy) <= radius) {
                        // Distance in document pixels,
                        const dist = Math.sqrt((dx * dx) + (dy * dy));
                        // Number between 0 and 1 away from radius
                        const dif = radius - dist;
                        if (dif > 0) {
                            const tw = dif / radius;
                            if (tw > weight) {
                                weight = tw;
                            }
                        }
                    }
                });
            }
            if (weight > 0) {
                weighted_vs[vuid] = {
                    x, y, weight
                };
            }
        });

        // Return weighted vertexes,
        return {
            weighted_vs
        };

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
        if (v === undefined) {
            return;
        }
        return new THREE.Vector3(getVectorX(v), getVectorY(v), 0);
    }

    function toTHREEVertexes(uids) {
        const vts = [];
        uids.forEach((uid) => {
            const v = createTHREEVertex(uid);
            if (v !== undefined) {
                vts.push(v);
            }
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

            const va = createTHREEVertex(f.a);
            const vb = createTHREEVertex(f.b);
            const vc = createTHREEVertex(f.c);
            if (va !== undefined && vb !== undefined && vc !== undefined) {
                verts.push(va);
                verts.push(vb);
                verts.push(vc);
                faces.push(new THREE.Face3(p, p + 1, p + 2));
            }
        }
        geometry.computeBoundingSphere();
        return geometry;
    }

    function createTHREEEdgesGeometry() {
        const geometry = new THREE.Geometry();
        const len = edge_indexes.length;
        const verts = geometry.vertices;
        for (let n = 0; n < len; ++n) {
            const v = createTHREEVertex(edge_indexes[n]);
            if (v !== undefined) {
                verts.push(v);
            }
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

        getSingleVertex,
        getSingleVertexMorph,
        moveSingleVertex,
        moveSingleVertexMorph,
        flipFaces,

        removeAllVertexesFrom,
        clear,
        getVertex,

        createWeightedSelection,

        loadFrom,
        saveTo,

        toTHREEVertexes,
        createTHREEFacesGeometry,
        createTHREEEdgesGeometry

    };

}

module.exports = WorkingMesh;
