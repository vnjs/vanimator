"use strict";

const path = require('path');
const THREE = require('three');

// A 2D mesh constructor/editor. Allows for the user interactible construction
// and editing of the vertexes, faces and uv of a mesh.

const three_loader = new THREE.TextureLoader();
const p = path.join(__dirname, '../../assets/select_dot.png');
const vertex_dot_tex = three_loader.load( p );

const WorkingMesh = require('./WorkingMesh.js');

function MeshEditor() {

    const working_mesh = WorkingMesh();

    // Currently selected indexes. The last index in this array is the
    // primary selected index.
    let selected_indexes = [];




    function arrCopy(a) {
        if (a === undefined) {
            return [];
        }
        return a.slice(0);
    }

    function loadFrom(ss, mesh_uid) {
        working_mesh.loadFrom(ss, mesh_uid);
        const meshes = ss.getArray('meshes');
        const mesh = meshes.get(mesh_uid);
        selected_indexes = arrCopy( mesh.get('me_selected_indexes') );
    }

    function saveTo(ss, mesh_uid) {
        working_mesh.saveTo(ss, mesh_uid);
        const meshes = ss.getArray('meshes');
        const mesh = meshes.get(mesh_uid);
        mesh.set('me_selected_indexes', arrCopy( selected_indexes ));
    }

    function clear() {
        working_mesh.clear();
        selected_indexes = [];
    }


    function getCurrentMeshDetails() {
        // PENDING,
        return {
        };
    }

    function nearestIndexTo(x, y, radius) {
        return working_mesh.nearestVertexUidTo(x, y, radius);
    }


    // Adds a vertex at the given location. The x and y coordinates are in
    // document position.

    function addVertex(x, y) {
        return working_mesh.addVertex(x, y);
    }

    // Adds an edge between vertexes.

    function addEdge(vertex1_uid, vertex2_uid, edge_type) {
        return working_mesh.addEdge(vertex1_uid, vertex2_uid, edge_type);

    }


    function moveSingleVertex(vertex_uid, x, y) {
        return working_mesh.moveSingleVertex(vertex_uid, x, y);
    }

    // Removes specific vertexes from the selected list.

    function removeSelectVertices(uid_set) {
        uid_set.forEach((uid) => {
            const p = selected_indexes.indexOf(uid);
            if (p >= 0) {
                selected_indexes.splice(p, 1);
            }
        });
    }

    function deleteSelectedVertices() {
        const r = working_mesh.removeAllVertexesFrom(selected_indexes);
        // Clear the selected indexes list,
        selected_indexes.length = 0;
        return r;
    }

    function toggleSelectVertices(uid_set) {
        removeSelectVertices(uid_set);
        uid_set.forEach((uid) => {
            selected_indexes.push(uid);
        });
    }

    function selectVertex(uid) {
        removeSelectVertices([ uid ]);
        selected_indexes.push(uid);
    }

    function selectArea(area_select_gesture) {
        const polygon = area_select_gesture.getPolygon();
        const uids = working_mesh.allVertexUidWithin(polygon);
        uids.forEach((uid) => {
            if (selected_indexes.indexOf(uid) < 0) {
                selected_indexes.push(uid);
            }
        });
    }

    function selectAll() {
        selectNone();
        const uids = working_mesh.allVertexUid();
        uids.forEach((uid) => {
            selected_indexes.push(uid);
        });
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
            if (v1 < v2) {
                return -1;
            }
            else if (v1 > v2) {
                return 1;
            }
            return 0;
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

    function pointsObject(vertex_uids, color, size) {
        const geometry = new THREE.Geometry();
        geometry.vertices = working_mesh.toTHREEVertexes(vertex_uids);
        const pc_mat2 = new THREE.PointsMaterial({
            size: size,
            sizeAttenuation: false,
            transparent: true,
            map: vertex_dot_tex,
            color: color,
        });
        geometry.verticesNeedUpdate = true;
//        geometry.needsUpdate = true;
        const points = new THREE.Points( geometry, pc_mat2 );
        points.position.z = 313;

        geometry.computeBoundingSphere();

        return points;
    }

    function createFacesOb() {

        const geometry = working_mesh.createTHREEFacesGeometry();

//        const geometry = new THREE.Geometry();

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

        const geometry = working_mesh.createTHREEEdgesGeometry();

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
        const vertex_uids = working_mesh.allVertexUid();
        vertex_uids.forEach((uid) => {
            if (selected_indexes.indexOf(uid) < 0) {
                unselected.push(uid);
            }
        });

        return pointsObject(unselected, 0x05020E0, 6);

    }

    function createSelectedPointsOb() {

        // The Selected points,
        return pointsObject(selected_indexes, 0x0ff7f7f, 6);

    }

    function createPrimarySelectedPointsOb() {

        const primary_selected = [];
        const sel_len = selected_indexes.length;
        if (sel_len > 0) {
            primary_selected.push(selected_indexes[sel_len - 1]);
        }

        return pointsObject(primary_selected, 0x0f03030, 8);

    }



    // Exported API,
    return {

        loadFrom,
        saveTo,
        clear,
        getCurrentMeshDetails,

        nearestIndexTo,

        addVertex,
        addEdge,
//        computeFacesFromSelected,

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
