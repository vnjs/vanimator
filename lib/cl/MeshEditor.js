"use strict";

const path = require('path');
const THREE = require('three');
const earcut = require('earcut');

// A 2D mesh constructor/editor. Allows for the user interactible construction
// and editing of the vertexes, faces and uv of a mesh.

const three_loader = new THREE.TextureLoader();
const p = path.join(__dirname, '../../assets/select_dot.png');
const vertex_dot_tex = three_loader.load( p );

const { pointInsidePolygon } = require('./GeometryHelper.js')();

function MeshEditor(ss) {

    let loaded_layer;

    let vertices = [];
    let edge_indexes = [];
    let face_indexes = [];

    // Currently selected indexes. The last index in this array is the
    // primary selected index.
    let selected_indexes = [];




    function convertCopy(a, clazz, f) {
        if (a === undefined) {
            return [];
        }
        // Convert,
        if (a.length > 0 && !(a[0] instanceof clazz)) {
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
        return convertCopy(v, THREE.Vector3, (vt) => vector(vt.x, vt.y, vt.z));
    }

    function arrCopyFaces(v) {
        return convertCopy(v, THREE.Face3, (vt) => face(vt.a, vt.b, vt.c));
    }

    function loadFrom(ss, layer_uid) {
        const meshes = ss.getArray('meshes');
        const layer = meshes.get(layer_uid);
        selected_indexes = arrCopy( layer.get('me_selected_indexes') );
        face_indexes = arrCopyFaces( layer.get('me_face_indexes') );
        edge_indexes = arrCopy( layer.get('me_edge_indexes') );
        vertices = arrCopyVertexes( layer.get('me_vertices') );
        loaded_layer = layer_uid;
    }

    function saveTo(ss, layer_uid) {
        const meshes = ss.getArray('meshes');
        const layer = meshes.get(layer_uid);
        layer.set('me_selected_indexes', arrCopy( selected_indexes ));
        layer.set('me_face_indexes', arrCopyFaces( face_indexes ));
        layer.set('me_edge_indexes', arrCopy( edge_indexes ));
        layer.set('me_vertices', arrCopyVertexes( vertices ));
    }

    function clear() {
        vertices = [];
        edge_indexes = [];
        face_indexes = [];
        selected_indexes = [];
        loaded_layer = undefined;
    }

    function getLoadedLayer() {
        return loaded_layer;
    }



    function vector(x, y) {
        return new THREE.Vector3(x, y, 0);
    }
    function face(i1, i2, i3) {
        return new THREE.Face3(i1, i2, i3);
    }


    function findDistanceDiff(v, x, y, radius) {
        const dx = x - v.x;
        const dy = y - v.y;
        const distance_dif = ((dx * dx) + (dy * dy)) - (radius * radius);
        return distance_dif;
    }


    function nearestIndexTo(x, y, radius) {
        const len = vertices.length;
        const within_radius = [];
        for (let i = len - 1; i >= 0; --i) {
            const v = vertices[i];
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
            return [ smallest_i ];
        }
        else {
            return [ ];
        }
    }


    // Adds a vertex at the given location. The x and y coordinates are in
    // document position.

    function addVertex(x, y) {
        vertices.push(vector(x, y));
        return vertices.length - 1;
    }

    // Adds an edge between vertexes.

    function addEdge(vertex_i1, vertex_i2, edge_type) {

        // If this edge makes a triangle then we fill it,
        const v1_connections = [];
        const v2_connections = [];
        const len = edge_indexes.length;
        for (let i = 0; i < len; i += 2) {
            const ep1 = edge_indexes[i];
            const ep2 = edge_indexes[i + 1];

            if (ep1 === vertex_i1 && ep2 === vertex_i2) {
                // Edge already defined,
                return;
            }
            if (ep2 === vertex_i1 && ep1 === vertex_i2) {
                return;
            }

            if (ep1 === vertex_i1) {
                v1_connections.push(ep2);
            }
            else if (ep2 === vertex_i1) {
                v1_connections.push(ep1);
            }
            if (ep1 === vertex_i2) {
                v2_connections.push(ep2);
            }
            else if (ep2 === vertex_i2) {
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

        edge_indexes.push(vertex_i1);
        edge_indexes.push(vertex_i2);

        if (shared_i.length > 0) {
//            console.log("NEW FACE!");
            shared_i.forEach((vertex_i3) => {
                const v1 = vertices[vertex_i1];
                const v2 = vertices[vertex_i2];
                const v3 = vertices[vertex_i3];

                const tri_faces = earcut([
                    v1.x, v1.y,
                    v2.x, v2.y,
                    v3.x, v3.y
                ]);
                const route_lu = [ vertex_i1, vertex_i2, vertex_i3 ];

                face_indexes.push(
                    face(route_lu[tri_faces[0]],
                         route_lu[tri_faces[1]],
                         route_lu[tri_faces[2]] ));

//                console.log(vertex_i1, vertex_i2, vertex_i3);
            });
        }

    }




    function vertNode(arr, index, vertex) {
        if (arr[index] !== undefined) {
            return arr[index];
        }
        arr[index] = {
            index,
            vertex,
            connects: [],
            computed: false,
            visited: false
        };
        return arr[index];
    }

    function computeVertNode(arr, index) {
        const node = vertNode(arr, index, vertices[index]);
        if (node.computed === true) {
            return node;
        }
        else {
            node.computed = true;
            const local_connects = [];
            // Find all edges that connect to this vertex,
            const len = edge_indexes.length;
            for (let i = 0; i < len; i += 2) {
                const ei1 = edge_indexes[i];
                const ei2 = edge_indexes[i + 1];
                let connect_to;
                if (ei1 === index) {
                    connect_to = ei2;
                }
                else if (ei2 === index) {
                    connect_to = ei1;
                }
                if ( connect_to !== undefined &&
                     node.connects.indexOf(connect_to) < 0) {
                    node.connects.push(connect_to);
                    local_connects.push(connect_to);
                }
            }
            // Recurse,
            for (let i = 0; i < local_connects.length; ++i) {
                computeVertNode(arr, local_connects[i]);
            }
        }
    }

    function computeVertexGraph() {
        const len = vertices.length;
        if (len <= 0) {
            return undefined;
        }
        const arr = [];
        for (let i = 0; i < len; ++i) {
            computeVertNode(arr, i);
        }
        return arr;
    }



    function computeFacesFromSelected() {
        if (selected_indexes.length > 2) {
            const vertex_graph = computeVertexGraph();

            // Find edge if necessary,
            function findEdge(i) {
                const v = vertex_graph[i];
                v.visited = true;
                // Pick first single connection not already travelled,
                const len = v.connects.length;
                for (let n = 0; n < len; ++n) {
                    const ci = v.connects[n];
                    if ( vertex_graph[ci].visited === false &&
                         selected_indexes.indexOf(ci) >= 0 ) {
                        return findEdge(ci);
                    }
                }
                return i;
            }

            // Find an end vertex point from those selected,
            let pointi = selected_indexes[selected_indexes.length - 1];
            pointi = findEdge(pointi);

            // Clear visited flag,
            const len = vertex_graph.length;
            for (let i = 0; i < len; ++i) {
                vertex_graph[i].visited = false;
            }

            // Check graph
            const route = [];
            const route_lu = [];

            function travel(i) {
                const v = vertex_graph[i];
                v.visited = true;
                const vertex = vertices[i];
                route.push(vertex.x, vertex.y);
                route_lu.push(v.index);
                // Pick a single connection not already travelled,
                const len = v.connects.length;
                for (let n = 0; n < len; ++n) {
                    const ci = v.connects[n];
                    if ( vertex_graph[ci].visited === false &&
                         selected_indexes.indexOf(ci) >= 0 ) {
                        travel(ci);
                        break;
                    }
                }
            }
            travel(pointi);

            console.log("Route Calculated:");
            console.log(" select size:    ", selected_indexes.length);
            console.log(" route:          ", JSON.stringify(route));
            console.log(" route.size / 2: ", route.length / 2);

            const tri_faces = earcut(route);
            console.log(" RESULT: ", JSON.stringify(tri_faces));

            face_indexes.length = 0;
            for (let i = 0; i < tri_faces.length; i += 3) {
                face_indexes.push(
                    face(route_lu[tri_faces[i]],
                         route_lu[tri_faces[i + 1]],
                         route_lu[tri_faces[i + 2]] ));
            }

        }
    }



    function moveSingleVertex(vertex_i, x, y) {
        const v = vertices[vertex_i];
        vertices[vertex_i] = vector(x, y);
    }

    // Removes specific vertexes from the selected list.

    function removeSelectVertices(indexes) {
        indexes.forEach((index) => {
            const p = selected_indexes.indexOf(index);
            if (p >= 0) {
                selected_indexes.splice(p, 1);
            }
        });
    }

    function deleteSelectedVertices() {

        const wm = [];
        let len = vertices.length;
        for (let i = 0; i < len; ++i) {
            wm.push(i);
        }

        selected_indexes.sort((o1, o2) => {
            return o1 - o2;
        });

        const lenc = selected_indexes.length;
        for (let i = lenc - 1; i >= 0; --i) {
            const vi = selected_indexes[i];
            vertices.splice(vi, 1);
            wm.splice(vi, 1);
        }

        // Update edge index references,
        len = edge_indexes.length;
        for (let i = len - 2; i >= 0; i -= 2) {
            const ev1 = edge_indexes[i];
            const ev2 = edge_indexes[i + 1];
            if (selected_indexes.indexOf(ev1) >= 0 ||
                selected_indexes.indexOf(ev2) >= 0) {
                edge_indexes.splice(i, 2);
            }
            else {
                edge_indexes[i] = wm.indexOf(ev1);
                edge_indexes[i + 1] = wm.indexOf(ev2);
            }
        }

        // Kill faces
        len = face_indexes.length;
        for (let i = len - 1; i >= 0; --i) {
            const f = face_indexes[i];
            if ( selected_indexes.indexOf(f.a) >= 0 ||
                 selected_indexes.indexOf(f.b) >= 0 ||
                 selected_indexes.indexOf(f.c) >= 0 ) {
                face_indexes.splice(i, 1);
            }
            else {
                face_indexes[i] = face(
                    wm.indexOf(f.a),
                    wm.indexOf(f.b),
                    wm.indexOf(f.c) );
            }
        }

        // Clear the selected indexes list,
        selected_indexes.length = 0;
    }

    function toggleSelectVertices(indexes) {
        removeSelectVertices(indexes);
        indexes.forEach((index) => {
            selected_indexes.push(index);
        });
    }

    function selectVertex(index) {
        removeSelectVertices([ index ]);
        selected_indexes.push(index);
    }

    function selectArea(area_select_gesture) {
        const polygon = area_select_gesture.getPolygon();
        const len = vertices.length;
        for (let i = 0; i < len; ++i) {
            if (selected_indexes.indexOf(i) < 0) {
                const v = vertices[i];
                if (pointInsidePolygon(v.x, v.y, polygon) === true) {
                    selected_indexes.push(i);
                }
            }
        }
    }

    function selectAll() {
        selectNone();
        const len = vertices.length;
        for (let i = 0; i < len; ++i) {
            selected_indexes[i] = i;
        }
    }

    function selectNone() {
        selected_indexes.length = 0;
    }


    function getPrimarySelectVertex() {
        if (selected_indexes.length === 0) {
            return undefined;
        }
        return selected_indexes[selected_indexes.length - 1];
    }

    function getAllSelectedIndexes() {
        const out = [];
        const len = selected_indexes.length;
        for (let i = 0; i < len; ++i) {
            out.push(selected_indexes[i]);
        }
        return out;
    }

    function isSameSelected(cmp_indexes) {
        if (cmp_indexes.length !== selected_indexes.length) {
            return false;
        }
        const this_indexes = getAllSelectedIndexes();
        function ncmp(v1, v2) {
            return (v1 - v2);
        }
        this_indexes.sort(ncmp);
        const cin = [].concat(cmp_indexes);
        cin.sort(ncmp);
        for (let i = 0; i < cin.length; ++i) {
            if (cin[i] !== this_indexes[i]) {
                return false;
            }
        }
        return true;
    }



    // --- THREE specific functions ---

    function pointsObject(in_vertices, color, size) {
        const geometry = new THREE.Geometry();
        geometry.vertices = in_vertices;
        const pc_mat2 = new THREE.PointsMaterial({
            size: size,
            sizeAttenuation: false,
            transparent: true,
            map: vertex_dot_tex,
            color: color,
        });
        geometry.needsUpdate = true;
        const points = new THREE.Points( geometry, pc_mat2 );
        points.position.z = 313;

        geometry.computeBoundingSphere();

        return points;
    }

    function createFacesOb() {
        const geometry = new THREE.Geometry();
        const len = face_indexes.length;
        const verts = geometry.vertices;
        const faces = geometry.faces;
        for (let n = 0; n < len; ++n) {
            const f = face_indexes[n];
            const p = verts.length;
            verts.push(vertices[f.a]);
            verts.push(vertices[f.b]);
            verts.push(vertices[f.c]);
            faces.push(new THREE.Face3(p, p + 1, p + 2));
        }

        geometry.computeBoundingSphere();

        const material2 = new THREE.MeshBasicMaterial( {
            color: 0x0000080,
        } );
        material2.transparent = true;
        material2.opacity = 0.15;

        const mesh = new THREE.Mesh(geometry, material2);
        mesh.position.z = 310;

        const geo = new THREE.WireframeGeometry(geometry);
        const mat = new THREE.LineBasicMaterial( {
            color: 0x0404040,
            // Can't use another value. Win32 only supports 1 px line
            // width
            linewidth: 1
        });
        mat.transparent = true;
        mat.opacity = 0.35;
        const wireframe_mesh = new THREE.LineSegments( geo, mat );
        wireframe_mesh.position.z = 311;

        const faceg = new THREE.Object3D();
        faceg.add(mesh);
        faceg.add(wireframe_mesh);

        return faceg;
    }


    function createEdgesOb() {
        const geometry = new THREE.Geometry();
        const len = edge_indexes.length;
        const verts = geometry.vertices;
        for (let n = 0; n < len; ++n) {
            verts.push(vertices[edge_indexes[n]]);
        }

        geometry.computeBoundingSphere();
        geometry.computeLineDistances();

        // const line_mat = new THREE.LineDashedMaterial( {
        //     color: 0x006fff,
        //     linewidth: 1,
        //     scale: 0.25,
        //     dashSize: 3,
        //     gapSize: 1,
        // } );

        const line_mat = new THREE.LineBasicMaterial( {
            color: 0x006fff
        } );
        line_mat.transparent = true;
        line_mat.opacity = 0.80;
        const lines = new THREE.LineSegments(geometry, line_mat);
        lines.position.z = 312;
        return lines;
    }

    function createUnselectedPointsOb() {

        // The Unselected points,
        const unselected = [];
        const len = vertices.length;
        for (let i = 0; i < len; ++i) {
            if (selected_indexes.indexOf(i) < 0) {
                unselected.push(vertices[i]);
            }
        }

        return pointsObject(unselected, 0x05020E0, 6);

    }

    function createSelectedPointsOb() {

        // The Selected points,
        const selected = [];
        const len = vertices.length;
        for (let i = 0; i < len; ++i) {
            if (selected_indexes.indexOf(i) >= 0) {
                selected.push(vertices[i]);
            }
        }

        return pointsObject(selected, 0x0ff7f7f, 6);

    }

    function createPrimarySelectedPointsOb() {

        const primary_selected = [];
        const sel_len = selected_indexes.length;
        if (sel_len > 0) {
            primary_selected.push(vertices[selected_indexes[sel_len - 1]]);
        }

        return pointsObject(primary_selected, 0x0f03030, 8);

    }



    // Exported API,
    return {

        loadFrom,
        saveTo,
        clear,
        getLoadedLayer,

        nearestIndexTo,

        addVertex,
        addEdge,
        computeFacesFromSelected,

        moveSingleVertex,

        deleteSelectedVertices,

        removeSelectVertices,
        toggleSelectVertices,
        selectVertex,
        selectArea,
        selectAll,
        selectNone,

        getPrimarySelectVertex,
        getAllSelectedIndexes,
        isSameSelected,

        createFacesOb,
        createEdgesOb,
        createUnselectedPointsOb,
        createSelectedPointsOb,
        createPrimarySelectedPointsOb,
    };

}

module.exports = MeshEditor;
