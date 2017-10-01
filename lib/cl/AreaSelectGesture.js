"use strict";

const THREE = require('three');

function AreaSelectGesture() {

    let is_active = false;
    const waypoints = [];
    let cur_3dobject;


    function start(x, y) {
        cur_3dobject = undefined;
        is_active = true;
        waypoints.length = 0;
        waypoints.push( [x, y] );
    }

    function complete() {
        // Close loop,
        cur_3dobject = undefined;
        waypoints.push( waypoints[0] );
        is_active = false;
    }

    function moveTo(x, y) {
        const lastp = waypoints.length - 1;
        const dx = x - waypoints[lastp][0];
        const dy = y - waypoints[lastp][1];
        if (dx > 6 || dx < -6 || dy > 6 || dy < -6) {
            cur_3dobject = undefined;
            waypoints.push( [x, y] );
        }
    }

    function clear() {
        cur_3dobject = undefined;
        waypoints.length = 0;
    }

    function isActive() {
        return is_active;
    }

    function createThreeEdgesOb() {
        if (cur_3dobject !== undefined) {
            return cur_3dobject;
        }

        if (waypoints.length === 0) {
            return undefined;
        }

        // Create the edges mesh,
        const geometry = new THREE.Geometry();
        const len = waypoints.length;
        const verts = geometry.vertices;
        for (let n = 0; n < len - 1; ++n) {
            const ep1 = waypoints[n + 0];
            const ep2 = waypoints[n + 1];

            verts.push( new THREE.Vector3(ep1[0], ep1[1], 0),
                        new THREE.Vector3(ep2[0], ep2[1], 0) );
        }

        geometry.computeBoundingSphere();
        geometry.computeLineDistances();

        const line_mat = new THREE.LineDashedMaterial( {
            color: 0x03f3f3f,
            dashSize: 4,
            scale: 0.7,

        } );
        line_mat.transparent = true;
        line_mat.opacity = 0.80;
        const lines = new THREE.LineSegments(geometry, line_mat);
        lines.position.z = 320;

        cur_3dobject = lines;
        return cur_3dobject;
    }

    function getPolygon() {
        return waypoints;
    }



    return {
        start,
        complete,
        moveTo,
        clear,
        isActive,

        createThreeEdgesOb,
        getPolygon
    };

}

module.exports = AreaSelectGesture;
