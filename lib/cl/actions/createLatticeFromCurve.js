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

            curve_points.forEach((point) => {
                const px = point.x;
                const py = point.y;
                const prev_mp = last_mid_point_uid;
                last_mid_point_uid = mesh_editor.addVertex(px, py);

                if (prev_mp !== undefined) {
                    mesh_editor.addEdge(prev_mp, last_mid_point_uid);
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
