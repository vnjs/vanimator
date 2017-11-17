"use strict";


// Creates a lattice from the current curve.

module.exports = function createLatticeFromCurve(editor, resolution, width) {

    // Sanity checks,
    if (resolution <= 0) {
        // PENDING: Turn this into an error dialog,
        console.error("resolution <= 0");
        return;
    }
    if (width <= 2) {
        // PENDING: Turn this into an error dialog,
        console.error("width <= 2");
        return;
    }

    const ss = editor.getSerializedState();

    // Get the current editing curve,
    const mesh_editor = editor.getMeshEditor();
    // Check mode,
    const current_mode = mesh_editor.getMode();
    if (current_mode === 'edit') {

        // Is there a curve?
        const curved_deformer_line = mesh_editor.getCurvedDeformerLine();

        // Create the curve points at the given resolution,
        const curve_points = curved_deformer_line.createCurvePoints(resolution);

        // If there are points to create lattice from,
        if (curve_points.length > 0) {

            // Checkpoint for UNDO
            editor.checkpointHistory();

            console.log(curve_points);

            let last_mid_point_uid;
            let last_mid_v;
            let last_bot_uid;
            let last_top_uid;

            curve_points.forEach((point) => {
                const px = point.x;
                const py = point.y;
                const prev_mp = last_mid_point_uid;
                const prev_mp_v = last_mid_v;
                last_mid_point_uid = mesh_editor.addVertex(px, py);
                last_mid_v = { x: px, y: py };

                if (prev_mp !== undefined) {

                    const prev_bot_uid = last_bot_uid;
                    const prev_top_uid = last_top_uid;

                    // Put a point at the midpoint,
                    const mpx = (px - prev_mp_v.x) / 2;
                    const mpy = (py - prev_mp_v.y) / 2;
                    const nang = Math.atan2(mpx, mpy);
                    const bpx = (prev_mp_v.x + mpx) +
                                    (Math.sin(nang + (Math.PI / 2)) * width);
                    const bpy = (prev_mp_v.y + mpy) +
                                    (Math.cos(nang + (Math.PI / 2)) * width);
                    last_bot_uid = mesh_editor.addVertex(bpx, bpy);
                    const tpx = (prev_mp_v.x + mpx) +
                                    (Math.sin(nang - (Math.PI / 2)) * width);
                    const tpy = (prev_mp_v.y + mpy) +
                                    (Math.cos(nang - (Math.PI / 2)) * width);
                    last_top_uid = mesh_editor.addVertex(tpx, tpy);

                    mesh_editor.addEdge(prev_mp, last_mid_point_uid);
                    mesh_editor.addEdge(prev_mp, last_bot_uid);
                    mesh_editor.addEdge(prev_mp, last_top_uid);
                    mesh_editor.addEdge(last_mid_point_uid, last_bot_uid);
                    mesh_editor.addEdge(last_mid_point_uid, last_top_uid);
                    if (prev_bot_uid !== undefined) {
                        mesh_editor.addEdge(prev_bot_uid, last_bot_uid);
                        mesh_editor.addEdge(prev_top_uid, last_top_uid);
                    }

                }
            });

            editor.fullRefresh();

        }
        else {
            // PENDING: Turn this into an error dialog,
            console.error('No curve to create lattice from.');
        }

    }
    else {
        // PENDING: Turn this into an error dialog,
        console.error('Not in EDIT mode.');
    }

};
