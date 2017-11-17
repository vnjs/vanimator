"use strict";

const path = require('path');
const THREE = require('three');

// A 2D mesh constructor/editor. Allows for the user interactible construction
// and editing of the vertexes, faces and uv of a mesh.

const three_loader = new THREE.TextureLoader();
const p = path.join(__dirname, '../../assets/select_dot.png');
const vertex_dot_tex = three_loader.load( p );

const TransformPoints = require('./TransformPoints.js');
const Curved2DLine = require('./Curved2DLine.js');
const WorkingMesh = require('./WorkingMesh.js');

const { minimumDistanceSqPointToLine } = require('./GeometryHelper.js')();

const { doUidsMatch } = require('./Utils.js');

function MeshEditor() {

    const curve_influence_detail = 8;


    const working_mesh = WorkingMesh();

    // Currently selected indexes. The last index in this array is the
    // primary selected index.
    let selected_indexes = [];

    const curved_deformer_line = Curved2DLine();
    let curve_deform_points;
    const curve_deform_line_influences = [];



    let mode = 'edit';






    function setMode(mode_type) {
        console.log('SET MODE: ' + mode_type);
        working_mesh.setIncludeMorph(mode_type !== 'edit');
        if (mode_type === 'edit') {
            curved_deformer_line.setMode('rest');
        }
        else {
            curved_deformer_line.setMode('active');
        }

        mode = mode_type;
    }

    function getMode() {
        return mode;
    }



    function arrCopy(a) {
        if (a === undefined) {
            return [];
        }
        return a.slice(0);
    }

    function loadFrom(ss, mesh_uid) {
        curved_deformer_line.loadFromMesh(ss, mesh_uid);
        working_mesh.loadFrom(ss, mesh_uid);
        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        selected_indexes = arrCopy( mesh_ob.get('me_selected_indexes') );
    }

    function saveTo(ss, mesh_uid) {
        curved_deformer_line.saveToMesh(ss, mesh_uid);
        working_mesh.saveTo(ss, mesh_uid);
        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        mesh_ob.set('me_selected_indexes', arrCopy( selected_indexes ));
    }

    function clear() {
        working_mesh.clear();
        selected_indexes = [];
    }


    function getCurrentMeshDetails() {
        return working_mesh.getCurrentMeshDetails();
    }

    function getCurvedDeformerLine() {
        return curved_deformer_line;
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
        if (mode === 'edit') {
            return working_mesh.moveSingleVertex(vertex_uid, x, y);
        }
        else {
            return working_mesh.moveSingleVertexMorph(vertex_uid, x, y);
        }
    }

    function getSingleVertex(vertex_uid) {
        if (mode === 'edit') {
            return working_mesh.getSingleVertex(vertex_uid);
        }
        else {
            return working_mesh.getSingleVertexMorph(vertex_uid);
        }
    }


    const points_transformer = TransformPoints(getSingleVertex, moveSingleVertex);
    const translateWeightedVertexes = points_transformer.translateWeightedPoints;
    const rotateWeightedVertexes = points_transformer.rotateWeightedPoints;
    const scaleWeightedVertexes = points_transformer.scaleWeightedPoints;

    function mirrorVertexes(uids, mirror_x, mirror_y) {
        points_transformer.mirrorVertexes(uids, mirror_x, mirror_y);
        // Flip faces that contain the given uids,
        working_mesh.flipFaces(uids);
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

    function resetToRest(uids) {
        working_mesh.resetToRest(uids);
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

    // Returns all selected vertexes, edges and faces. Only includes edges
    // and faces where all vertexes are selected,
    function getAllSelectedData() {
        const out_vertex_arr = [];
        const out_edge_indexes = [];
        const out_face_indexes = [];
        const selected_data = {
            vertex_arr: out_vertex_arr,
            edge_indexes: out_edge_indexes,
            face_indexes: out_face_indexes
        };
        const select_map = Object.create(null);
        const len = selected_indexes.length;
        for (let i = 0; i < len; ++i) {
            const v_uid = selected_indexes[i];
            const v = working_mesh.getVertex(v_uid);
            select_map[v_uid] = true;
            out_vertex_arr.push({
                uid: v_uid,
                rx: v.rx,
                ry: v.ry,
                dx: v.dx,
                dy: v.dy,
            });
        }

        const mesh_details = working_mesh.getCurrentMeshDetails();
        const { edge_indexes, face_indexes } = mesh_details;

        for (let i = 0; i < edge_indexes.length; i += 2) {
            const es1 = edge_indexes[i];
            const es2 = edge_indexes[i + 1];
            if (select_map[es1] !== undefined && select_map[es2] !== undefined) {
                out_edge_indexes.push(es1);
                out_edge_indexes.push(es2);
            }
        }
        for (let i = 0; i < face_indexes.length; ++i) {
            const f = face_indexes[i];
            if ( select_map[f.a] !== undefined &&
                 select_map[f.b] !== undefined &&
                 select_map[f.c] !== undefined ) {
                out_face_indexes.push({
                    a: f.a, b: f.b, c: f.c
                });
            }
        }

        return selected_data;

    }

    // Merges in a set of vertexes, edges and faces. If the vertexes/faces
    // or edges are already present then does nothing.
    function mergeInData(data) {

        selectNone();

        const in_vertex_arr = data.vertex_arr;
        const in_edge_indexes = data.edge_indexes;
//        const in_face_indexes = data.face_indexes;

        if (in_vertex_arr.length === 0) {
            return 0;
        }

        const placed_v_uids = Object.create(null);

        const len = in_vertex_arr.length;
        for (let i = 0; i < len; ++i) {
            const v = in_vertex_arr[i];
            const new_v_uid = addVertex(v.rx, v.ry);
            placed_v_uids[v.uid] = new_v_uid;
            selected_indexes.push(new_v_uid);
        }

        const len2 = in_edge_indexes.length;
        for (let i = 0; i < len2; i += 2) {
            const es1 = placed_v_uids[in_edge_indexes[i]];
            const es2 = placed_v_uids[in_edge_indexes[i + 1]];
            addEdge(es1, es2);
        }

        return in_vertex_arr.length;

    }

    // function getAllSelectedVertexes() {
    //     const selected_map = Object.create(null);
    //     const len = selected_indexes.length;
    //     for (let i = 0; i < len; ++i) {
    //         const v_uid = selected_indexes[i];
    //         const v = working_mesh.getVertex(v_uid);
    //         selected_map[v_uid] = {
    //             rx: v.rx,
    //             ry: v.ry,
    //             dx: v.dx,
    //             dy: v.dy,
    //         };
    //     }
    //     return selected_map;
    // }

    function isSameSelected(cmp_indexes) {
        if (cmp_indexes.length !== selected_indexes.length) {
            return false;
        }
        return doUidsMatch(getAllSelectedIndexes(), cmp_indexes);
    }

    function areAllVertexesSelected() {
        const mesh_details = getCurrentMeshDetails();
        return (mesh_details.vertex_arr.length === selected_indexes.length);
    }

    function createWeightedSelection(radius) {
        return working_mesh.createWeightedSelection(
                                            getAllSelectedIndexes(), radius);
    }


    function LineSegVertDist(distance, csegi, vertex) {
        return { distance, csegi, vertex };
    }


    // Builds weights on every vertex to how near they are to waypoints on
    // the given curve.
    function calcVertexDeformsForCurve(curved_2d_line) {

        curve_deform_points =
                    curved_2d_line.createCurvePoints(curve_influence_detail);
        curve_deform_line_influences.length = 0;

        if (curve_deform_points.length > 1) {

            const mesh_details = working_mesh.getCurrentMeshDetails();
            const vertex_arr = mesh_details.vertex_arr;

            // Map filled with (max) 4 closest line segments for each vertex.
            const vweight_map = Object.create(null);
            const mlen = vertex_arr.length;
            for (let n = 0; n < mlen; ++n) {
                const mesh_v = vertex_arr[n];
                const vuid = mesh_v.uid;
                vweight_map[vuid] = {
                    distances: [],
                };
            }

            let v1 = curve_deform_points[0];
            for (let i = 1; i < curve_deform_points.length; ++i) {
                const v2 = curve_deform_points[i];

                // Line is from v1 to v2,

                // For each vertex in the mesh,
                // PENDING: Do we need a heuristic here to reduce the scan
                //   size?
                for (let n = 0; n < mlen; ++n) {
                    const mesh_v = vertex_arr[n];
                    const vuid = mesh_v.uid;
                    const distance =
                        minimumDistanceSqPointToLine(
                            mesh_v.rx, mesh_v.ry, v1.x, v1.y, v2.x, v2.y);
                    const cwi = vweight_map[vuid];

                    const distance_arr = cwi.distances;
                    if (distance_arr.length < 1) {
                        distance_arr.push(
                                    LineSegVertDist(distance, i - 1, mesh_v) );
                    }
                    else {
                        let insert = false;
                        let greatest_i = -1;
                        let greatest_d = -1;
                        for (let p = 0; p < distance_arr.length; ++p) {
                            const idist = distance_arr[p].distance;
                            if (idist > greatest_d) {
                                greatest_d = idist;
                                greatest_i = p;
                            }
                            if (distance < idist) {
                                insert = true;
                            }
                        }
                        if (insert === true) {
                            // Replace the item in the list with the greatest
                            // distance.
                            distance_arr[greatest_i] =
                                    LineSegVertDist(distance, i - 1, mesh_v);
                        }
                    }

                }

                v1 = v2;
            }

            // Now for each line segment we attach vertex and their weights,

            for (let vuid in vweight_map) {
                const distances = vweight_map[vuid].distances;

                distances.sort((o1, o2) => o1.distance - o2.distance);

                // PENDING: Proper weighting algorithm,

                // Pick the smallest distance,
                const { distance, csegi, vertex } = distances[0];

                let infl = curve_deform_line_influences[csegi];
                if (infl === undefined) {
                    infl = [];
                    curve_deform_line_influences[csegi] = infl;
                }
                infl.push({
                    vertex,
                    weight: 1,
                    distance
                });

            }

        }

    }

    function deformMeshToCurve(curved_2d_line) {

        // For pose deform,
        const pose_deform_points =
                    curved_2d_line.createCurvePoints(curve_influence_detail);

        const vertex_translates = Object.create(null);
        function addVertexTranslate(vuid, vertex, angle, tx, ty, origin_x, origin_y) {
            let ob = vertex_translates[vuid];
            if (ob === undefined) {
                ob = [];
                vertex_translates[vuid] = ob;
            }
            ob.push({
                vuid, vertex, angle, tx, ty, origin_x, origin_y
            });
        }

        const len = curve_deform_line_influences.length;
        for (let i = 0; i < len; ++i) {
            const infl = curve_deform_line_influences[i];
            if (infl !== undefined) {
                // 'infl' is an array of vertexes and weights
                for (let n = 0; n < infl.length; ++n) {
                    const { vertex, weight } = infl[n];
                    const vuid = vertex.uid;

                    const orig_cdp_s = curve_deform_points[i];
                    const orig_cdp_e = curve_deform_points[i + 1];
                    const ix1 = orig_cdp_s.x;
                    const iy1 = orig_cdp_s.y;
                    const now_cdp_s = pose_deform_points[i];
                    const now_cdp_e = pose_deform_points[i + 1];
                    const ix2 = now_cdp_s.x;
                    const iy2 = now_cdp_s.y;

                    // The translation,
                    const tx = (ix2 - ix1) * weight;
                    const ty = (iy2 - iy1) * weight;

                    // The rotation,

                    // Angle of original line,
                    const orig_angle = Math.atan2(
                                orig_cdp_e.x - orig_cdp_s.x,
                                orig_cdp_e.y - orig_cdp_s.y );
                    const new_angle = Math.atan2(
                                now_cdp_e.x - now_cdp_s.x,
                                now_cdp_e.y - now_cdp_s.y );

                    const angle = (orig_angle - new_angle) * weight;

                    addVertexTranslate(vuid, vertex, angle,
                                        tx, ty, orig_cdp_s.x, orig_cdp_s.y);

                }
            }
        }

        // Do the translations,
        for (let vuid in vertex_translates) {
            const ob = vertex_translates[vuid];
            const { vertex } = ob[0];
            let work_x = vertex.rx;
            let work_y = vertex.ry;
            for (let i = 0; i < ob.length; ++i) {
                const { angle, tx, ty, origin_x, origin_y } = ob[i];
                const temp_x = work_x;
                const temp_y = work_y;
                work_x = (Math.cos(angle) * (temp_x - origin_x)) -
                            (Math.sin(angle) * (temp_y - origin_y)) + origin_x;
                work_y = (Math.sin(angle) * (temp_x - origin_x)) +
                            (Math.cos(angle) * (temp_y - origin_y)) + origin_y;
                work_x += tx;
                work_y += ty;
            }
            moveSingleVertex(vuid, work_x, work_y);
        }

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
        if (mode === 'edit') {
            pc_mat2.opacity = 1;
        }
        else {
            pc_mat2.opacity = 0.50;
        }
        geometry.verticesNeedUpdate = true;
//        geometry.needsUpdate = true;
        const points = new THREE.Points( geometry, pc_mat2 );
        points.position.z = 313;

        geometry.computeBoundingSphere();

        return points;
    }

    function createFacesOb() {

        const geometry = working_mesh.createTHREEFacesGeometry();

        const geo = new THREE.WireframeGeometry(geometry);
        const mat = new THREE.LineBasicMaterial( {
            color: 0x0404040,
            // Can't use another value. Win32 only supports 1 px line
            // width
            linewidth: 1
        });
        mat.transparent = true;
        mat.opacity = 0.10;
        const wireframe_mesh = new THREE.LineSegments( geo, mat );
        wireframe_mesh.position.z = 311;

        const faceg = new THREE.Object3D();
        if (mode === 'edit') {
            const material2 = new THREE.MeshBasicMaterial( {
                color: 0x0000080,
            } );
            material2.transparent = true;
            material2.opacity = 0.15;

            const area_mesh = new THREE.Mesh(geometry, material2);
            area_mesh.position.z = 310;

            faceg.add(area_mesh);
        }
        faceg.add(wireframe_mesh);

        return faceg;
    }


    function createEdgesOb() {

        if (mode === 'edit') {

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
        else {
            return new THREE.Object3D();
        }
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

    function createDeformerControlOb() {

        // const curve_ob = Curved2DLine();
        // curve_ob.addVertexPoint(-100, 0, -100, 350);
        // curve_ob.addVertexPoint( 100, 0,  100, 350);

        const deform_ob = new THREE.Object3D();
        const lines = curved_deformer_line.createTHREECurvedLine();
        lines.position.z = 318;
        const vert_points1 = curved_deformer_line.createTHREEVertexPointsOb(false);
        vert_points1.position.z = 319;
        const vert_points2 = curved_deformer_line.createTHREEVertexPointsOb(true);
        vert_points2.position.z = 319;
        const control_points1 = curved_deformer_line.createTHREEControlPointsOb(false);
        control_points1.position.z = 320;
        const control_points2 = curved_deformer_line.createTHREEControlPointsOb(true);
        control_points2.position.z = 320;

        deform_ob.add(lines);
        deform_ob.add(vert_points1);
        deform_ob.add(vert_points2);
        deform_ob.add(control_points1);
        deform_ob.add(control_points2);

        return deform_ob;

    }




    // Exported API,
    return {

        setMode,
        getMode,

        loadFrom,
        saveTo,
        clear,
        getCurrentMeshDetails,
        getCurvedDeformerLine,

        nearestIndexTo,

        addVertex,
        addEdge,
//        computeFacesFromSelected,

        moveSingleVertex,
        translateWeightedVertexes,
        rotateWeightedVertexes,
        scaleWeightedVertexes,
        mirrorVertexes,

        deleteSelectedVertices,
        resetToRest,

        removeSelectVertices,
        toggleSelectVertices,
        selectVertex,
        selectArea,
        selectAll,
        selectNone,

        calcVertexDeformsForCurve,
        deformMeshToCurve,

        getPrimarySelectVertex,
        getAllSelectedIndexes,
        getAllSelectedData,
        mergeInData,
        isSameSelected,
        areAllVertexesSelected,

        createWeightedSelection,

        createFacesOb,
        createEdgesOb,
        createUnselectedPointsOb,
        createSelectedPointsOb,
        createPrimarySelectedPointsOb,
        createDeformerControlOb,

    };

}

module.exports = MeshEditor;
