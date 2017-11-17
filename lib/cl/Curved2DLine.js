"use strict";

const path = require('path');
const THREE = require('three');

const three_loader = new THREE.TextureLoader();
const p = path.join(__dirname, '../../assets/select_dot.png');
const vertex_dot_tex = three_loader.load( p );

const uuidv1 = require('uuid/v1');

const { pointInsidePolygon } = require('./GeometryHelper.js')();
const TransformPoints = require('./TransformPoints.js');
const AreaManager = require('./AreaManager.js');

const { doUidsMatch } = require('./Utils.js');

// A connected curved line is represented by a set of vertex points and a
// control point for each vertex.
// Provides various operations for controling the line interactively.

function Curved2DLine() {

    let current_mode = 'rest';

    let rest_points = [];
    let active_points = [];

    let selected_uids = [];


    function Curved2DPoint(x, y, preuid) {
        const uid = preuid + uuidv1();
        return { uid, x, y };
    }


    function setMode(mode) {
        current_mode = mode;
    }

    function getMode() {
        return current_mode;
    }

    function pointCopy(p) {
        return { uid:p.uid, x:p.x, y:p.y };
    }

    function pointsCopy(parr) {
        const out = [];
        if (parr === undefined) {
            return out;
        }
        parr.forEach((p) => {
            out.push(pointCopy(p));
        });
        return out;
    }


    function loadFromMesh(ss, mesh_uid) {
        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        const curve_details = mesh_ob.get('curve_details');
        if (curve_details === undefined) {
            rest_points = [];
            active_points = [];
            selected_uids = [];
        }
        else {
            rest_points = pointsCopy(curve_details.rest_points);
            active_points = pointsCopy(curve_details.active_points);
            selected_uids = curve_details.selected_uids.slice(0);
        }
    }

    function saveToMesh(ss, mesh_uid) {
        const meshes = ss.getArray('meshes');
        const mesh_ob = meshes.get(mesh_uid);
        const curve_details = {
            rest_points: pointsCopy(rest_points),
            active_points: pointsCopy(active_points),
            selected_uids: selected_uids.slice(0)
        };
        mesh_ob.set('curve_details', curve_details);
    }


    function addVertexPoint(x, y, cx, cy) {
        // If no control points,
        const p = Curved2DPoint(x, y, '');
        if (cx === undefined) {

            if (rest_points.length === 0) {
                rest_points.push( p );
                rest_points.push( Curved2DPoint(x, y, '!') );
            }
            else {
                const previ = rest_points.length - 2;
                const prev = rest_points[previ];
                const prev_c = rest_points[previ + 1];

                // 25% difference between this and previous,
                const dx = (x - prev.x) * 0.45;
                const dy = (y - prev.y) * 0.45;

                if (rest_points.length > 2) {
//                    const prev_dx = prev_c.x - prev.x;
//                    const prev_dy = prev_c.y - prev.y;

                    // Set the previous constrol point,
                    prev_c.x = prev.x - dx;
                    prev_c.y = prev.y - dy;
                    rest_points.push(prev);
                    rest_points.push(
                            Curved2DPoint(prev.x + dx, prev.y + dy, '!') );
                }
                else {
                    // Set the previous constrol point,
                    prev_c.x = prev.x + dx;
                    prev_c.y = prev.y + dy;
                }
                rest_points.push( p );
                rest_points.push( Curved2DPoint(x - dx, y - dy, '!') );

            }
        }
        else {
            // If it's not the first,
            if (rest_points.length > 2) {
                const previ = rest_points.length - 2;
                const prev = rest_points[previ];
                rest_points.push(prev);
                const prev_c = rest_points[previ + 1];
                rest_points.push( Curved2DPoint(
                        prev.x - (prev_c.x - prev.x),
                        prev.y - (prev_c.y - prev.y), '!'));
            }
            rest_points.push(p);
            rest_points.push( Curved2DPoint(cx, cy, '!') );
        }
        active_points = pointsCopy(rest_points);
        return p.uid;
    }

    function removeVertexPoints(uids) {
        let count = 0;
        for (let i = rest_points.length - 2; i >= 0; i -= 2) {
            if (uids.indexOf(rest_points[i].uid) >= 0) {
                rest_points.splice(i, 2);
                ++count;
            }
        }
        active_points = pointsCopy(rest_points);
        return count;
    }

    function removeVertexPoint(uid) {
        const count = removeVertexPoints([ uid ]);
        if (count >= 1) {
            return uid;
        }
        return undefined;
    }

    function resetToRest(uids) {
        for (let i = 0; i < active_points.length; ++i) {
            const ap = active_points[i];
            if (uids.contains(ap.uid)) {
                active_points[i] = pointCopy(rest_points[i]);
            }
        }
    }



    function addPointToWeightedMap(weighted_vs, p) {
        weighted_vs[p.uid] = {
            x: p.x, y: p.y, weight: 1
        };
    }

    function pointsOfMode() {
        const mode = current_mode;
        if (mode === 'active') {
            return active_points;
        }
        else if (mode === 'rest') {
            return rest_points;
        }
        else {
            throw Error('Unknown mode: ' + mode);
        }
    }


    function createWeightedSelection(radius) {
        const weighted_vs = Object.create(null);

        const points = pointsOfMode();

        const len = points.length;
        for (let i = 0; i < len; ++i) {
            const p = points[i];
            const puid = p.uid;
            // If this point is selected,
            if (selected_uids.indexOf(puid) >= 0) {
                // If it's not a control point,
                if (!isControlPoint(puid)) {
                    addPointToWeightedMap(weighted_vs, points[i + 1]);
                }
                addPointToWeightedMap(weighted_vs, p);
            }
        }

        return {
            weighted_vs
        };
    }


    function selectNone() {
        selected_uids.length = 0;
    }

    function selectPoint(uid) {
        selected_uids.push(uid);
    }

    function selectAll() {
        selectNone();
        rest_points.forEach((p) => {
            selectPoint(p.uid);
        });
    }

    function allVertexUidWithin(polygon) {
        const out = [];
        const points = pointsOfMode();
        const len = points.length;
        for (let i = 0; i < len; ++i) {
            const v = points[i];
            if (pointInsidePolygon(
                            getVectorX(v), getVectorY(v), polygon) === true) {
                out.push(v.uid);
            }
        }
        return out;
    }

    function selectArea(area_select_gesture) {
        const polygon = area_select_gesture.getPolygon();
        const uids = allVertexUidWithin(polygon);
        uids.forEach((uid) => {
            if (selected_uids.indexOf(uid) < 0) {
                selected_uids.push(uid);
            }
        });
    }

    function getAllSelectedIndexes() {
        const out = [];
        const len = selected_uids.length;
        for (let i = 0; i < len; ++i) {
            out.push(selected_uids[i]);
        }
        return out;
    }

    function isSameSelected(cmp_indexes) {
        if (cmp_indexes.length !== selected_uids.length) {
            return false;
        }
        return doUidsMatch(getAllSelectedIndexes(), cmp_indexes);
    }




    function areAllVertexesSelected() {
        return rest_points.length === selected_uids.length;
    }



    function isControlPoint(uid) {
        return uid.startsWith('!');
    }


    function getVectorX(v) {
        return v.x;
    }

    function getVectorY(v) {
        return v.y;
    }

    // Returns the nearest vertex point uid to the given x/y coordinate within
    // the given radius. Returns either reference to control or vertex point.
    const area_manager = AreaManager(getVectorX, getVectorY);
    function nearestPointUidTo(x, y, radius) {
        const points = pointsOfMode();
        const mached_uid =
                    area_manager.nearestPointUidTo(points, x, y, radius);
        if (mached_uid === undefined) {
            return undefined;
        }
        if (points.length === 2 && isControlPoint(mached_uid)) {
            return points[0].uid;
        }
        return mached_uid;
    }

    function movePointTo(uid, x, y) {
        const points = pointsOfMode();
        // If it's a control point,
        const len = points.length;
        if (isControlPoint(uid)) {
            for (let i = 1; i < len; i += 2) {
                const p = points[i];
                if (p.uid === uid) {
                    p.x = x;
                    p.y = y;
                    if (points === rest_points) {
                        active_points[i] = pointCopy(p);
                    }
                    return;
                }
            }
        }
        else {
            let change_count = 0;
            for (let i = 0; i < len; i += 2) {
                const p = points[i];
                if (p.uid === uid) {
                    p.x = x;
                    p.y = y;
                    if (points === rest_points) {
                        active_points[i] = pointCopy(p);
                    }
                    ++change_count;
                    if (i === 0 || change_count === 2) {
                        return;
                    }
                }
            }
        }
    }


    function pob( x, y ) {
        return { x, y };
    }
    function getSinglePoint(uid) {
        const points = pointsOfMode();
        const len = rest_points.length;
        if (isControlPoint(uid)) {
            for (let i = 1; i < len; i += 2) {
                const p = points[i];
                if (p.uid === uid) {
                    return pob(p.x, p.y);
                }
            }
        }
        else {
            for (let i = 0; i < len; i += 2) {
                const p = points[i];
                if (p.uid === uid) {
                    return pob(p.x, p.y);
                }
            }
        }
    }


    const points_transformer = TransformPoints(getSinglePoint, movePointTo);
    const translateWeightedVertexes = points_transformer.translateWeightedPoints;
    const rotateWeightedVertexes = points_transformer.rotateWeightedPoints;
    const scaleWeightedVertexes = points_transformer.scaleWeightedPoints;
    const mirrorVertexes = points_transformer.mirrorVertexes;


    // Returns an array of 2d vertexes detailing waypoints along the curve.
    // The 'detail' variable is how many waypoints should be in each segment
    // of the curve.

    function createCurvePoints(detail) {
        const curve = createTHREECurvePath();
        return curve.getPoints(detail);
    }


    // Returns a curve path from the given points,

    function createTHREECurvePath() {
        const points = pointsOfMode();
        const curve = new THREE.CurvePath();
        if (points.length > 2) {
            for (let i = 0; i < points.length; i += 4) {
                const ps = points[i];
                const cs = points[i + 1];
                const pe = points[i + 2];
                const ce = points[i + 3];

                const curve_part = new THREE.CubicBezierCurve(
                    new THREE.Vector2( ps.x, ps.y ),
                    new THREE.Vector2( cs.x, cs.y ),
                    new THREE.Vector2( ce.x, ce.y ),
                    new THREE.Vector2( pe.x, pe.y )
                );
                curve.add(curve_part);
            }
        }
        return curve;
    }


    function createTHREEControlPointsOb(selected) {
        const points = pointsOfMode();
        const geometry = new THREE.Geometry();

        const control_verts = [];
        if (points.length > 2) {
            for (let i = 1; i < points.length; i += 2) {
                const v = points[i];
                const is_v_selected = selected_uids.indexOf(v.uid) >= 0;
                if ( (selected && is_v_selected) ||
                     (!selected && !is_v_selected) ) {
                    control_verts.push(new THREE.Vector3(v.x, v.y, 0));
                }
            }
        }
        geometry.vertices = control_verts;

        const size = 6;
        const color = selected ? 0x0f03070 : 0x0f0f030;

        const pc_mat2 = new THREE.PointsMaterial({
            size: size,
            sizeAttenuation: false,
            transparent: true,
            map: vertex_dot_tex,
            color: color,
        });
        pc_mat2.opacity = 1;
        geometry.verticesNeedUpdate = true;
//        geometry.needsUpdate = true;
        const out_points = new THREE.Points( geometry, pc_mat2 );

        geometry.computeBoundingSphere();

        return out_points;
    }


    function createTHREEVertexPointsOb(selected) {
        const points = pointsOfMode();
        const geometry = new THREE.Geometry();

        const verts = [];
        if (points.length > 0) {
            const v = points[0];
            const is_v_selected = selected_uids.indexOf(v.uid) >= 0;
            if ( (selected && is_v_selected) ||
                 (!selected && !is_v_selected) ) {
                verts.push(new THREE.Vector3(v.x, v.y, 0));
            }
            for (let i = 2; i < points.length; i += 4) {
                const v = points[i];
                const is_v_selected = selected_uids.indexOf(v.uid) >= 0;
                if ( (selected && is_v_selected) ||
                     (!selected && !is_v_selected) ) {
                    verts.push(new THREE.Vector3(v.x, v.y, 0));
                }
            }
        }
        geometry.vertices = verts;

        const size = 8;
        const color = selected ? 0x0f03070 : 0x0f0f030;

        const pc_mat2 = new THREE.PointsMaterial({
            size: size,
            sizeAttenuation: false,
            transparent: true,
            map: vertex_dot_tex,
            color: color,
        });
        pc_mat2.opacity = 1;
        geometry.verticesNeedUpdate = true;
//        geometry.needsUpdate = true;
        const out_points = new THREE.Points( geometry, pc_mat2 );

        geometry.computeBoundingSphere();

        return out_points;
    }


    function createTHREECurvedLine() {

        // Create points along the curve
        const out_points = createCurvePoints( 50 );
        const geometry = new THREE.Geometry();
        for ( let i = 0, l = out_points.length; i < l; ++i ) {
            const point = out_points[ i ];
            geometry.vertices.push( new THREE.Vector3( point.x, point.y, 0 ) );
        }
//        const geometry = new THREE.BufferGeometry().setFromPoints( out_points );

        const material = new THREE.LineBasicMaterial( {
            transparent: true,
            color : 0x0aaaa88,
        } );

        // Blend mode that attempts to make the line visible across multiple
        // gradients of background,
        material.blending = THREE.CustomBlending;
        material.blendSrc = THREE.OneMinusDstColorFactor;
        material.blendSrcAlpha = THREE.OneFactor;
        material.blendDst = THREE.ZeroFactor;
        material.blendDstAlpha = THREE.ZeroFactor;
        material.blendEquation = THREE.SubtractEquation;

        return new THREE.Line( geometry, material );
    }





    return {

        setMode,
        getMode,

        loadFromMesh,
        saveToMesh,

        addVertexPoint,
        removeVertexPoints,
        removeVertexPoint,

        resetToRest,

        createWeightedSelection,
        selectAll,
        selectNone,
        selectPoint,
        selectArea,
        isSameSelected,
        getAllSelectedIndexes,
        areAllVertexesSelected,

        nearestPointUidTo,
        movePointTo,
        isControlPoint,

        translateWeightedVertexes,
        rotateWeightedVertexes,
        scaleWeightedVertexes,
        mirrorVertexes,

        createCurvePoints,

        createTHREEControlPointsOb,
        createTHREEVertexPointsOb,
        createTHREECurvedLine

    };

}

module.exports = Curved2DLine;
