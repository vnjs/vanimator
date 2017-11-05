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

    const points = [];

    const selected_uids = [];


    function Curved2DPoint(x, y, preuid) {
        const uid = preuid + uuidv1();
        return { uid, x, y };
    }

    function addVertexPoint(x, y, cx, cy) {
        // If no control points,
        const p = Curved2DPoint(x, y, '');
        if (cx === undefined) {

            if (points.length === 0) {
                points.push( p );
                points.push( Curved2DPoint(x, y, '!') );
            }
            else {
                const previ = points.length - 2;
                const prev = points[previ];
                const prev_c = points[previ + 1];

                // 25% difference between this and previous,
                const dx = (x - prev.x) * 0.45;
                const dy = (y - prev.y) * 0.45;

                if (points.length > 2) {
//                    const prev_dx = prev_c.x - prev.x;
//                    const prev_dy = prev_c.y - prev.y;

                    // Set the previous constrol point,
                    prev_c.x = prev.x - dx;
                    prev_c.y = prev.y - dy;
                    points.push(prev);
                    points.push( Curved2DPoint(prev.x + dx, prev.y + dy, '!') );
                }
                else {
                    // Set the previous constrol point,
                    prev_c.x = prev.x + dx;
                    prev_c.y = prev.y + dy;
                }
                points.push( p );
                points.push( Curved2DPoint(x - dx, y - dy, '!') );

            }
        }
        else {
            // If it's not the first,
            if (points.length > 2) {
                const previ = points.length - 2;
                const prev = points[previ];
                points.push(prev);
                const prev_c = points[previ + 1];
                points.push( Curved2DPoint(
                        prev.x - (prev_c.x - prev.x),
                        prev.y - (prev_c.y - prev.y), '!'));
            }
            points.push(p);
            points.push(Curved2DPoint(cx, cy, '!'));
        }
        return p.uid;
    }

    function removeVertexPoints(uids) {
        let count = 0;
        for (let i = points.length - 2; i >= 0; i -= 2) {
            if (uids.indexOf(points[i].uid) >= 0) {
                points.splice(i, 2);
                ++count;
            }
        }
        return count;
    }

    function removeVertexPoint(uid) {
        const count = removeVertexPoints([ uid ]);
        if (count >= 1) {
            return uid;
        }
        return undefined;
    }


    function addPointToWeightedMap(weighted_vs, p) {
        weighted_vs[p.uid] = {
            x: p.x, y: p.y, weight: 1
        };
    }

    function createWeightedSelection(radius) {
        const weighted_vs = {};

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
        points.forEach((p) => {
            selectPoint(p.uid);
        });
    }

    function allVertexUidWithin(polygon) {
        const out = [];
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
        return points.length === selected_uids.length;
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
        // If it's a control point,
        const len = points.length;
        if (isControlPoint(uid)) {
            for (let i = 1; i < len; i += 2) {
                const p = points[i];
                if (p.uid === uid) {
                    p.x = x;
                    p.y = y;
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
                    ++change_count;
                    if (i === 0 || change_count === 2) {
                        return;
                    }
                }
            }
        }
    }


    const points_transformer = TransformPoints(movePointTo);
    const translateWeightedVertexes = points_transformer.translateWeightedPoints;
    const rotateWeightedVertexes = points_transformer.rotateWeightedPoints;
    const scaleWeightedVertexes = points_transformer.scaleWeightedPoints;


    function createTHREEControlPointsOb(selected) {
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

        // Create points along the curve
        const out_points = curve.getPoints( 50 );
        const geometry = new THREE.Geometry();
        for ( let i = 0, l = out_points.length; i < l; ++i ) {
            const point = out_points[ i ];
            geometry.vertices.push( new THREE.Vector3( point.x, point.y, 0 ) );
        }
//        const geometry = new THREE.BufferGeometry().setFromPoints( out_points );

        const material = new THREE.LineBasicMaterial( { color : 0x0ffff90 } );

        return new THREE.Line( geometry, material );
    }





    return {
        addVertexPoint,
        removeVertexPoints,
        removeVertexPoint,

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

        createTHREEControlPointsOb,
        createTHREEVertexPointsOb,
        createTHREECurvedLine
    };

}

module.exports = Curved2DLine;
