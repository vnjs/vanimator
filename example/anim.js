"use strict";

/* global window, document, requestAnimationFrame */

const VAnimViewer = require('../lib/viewer/VAnimViewer.js');



let sample_model_target;

const last_animation_target = Object.create(null);
const animation_targets = Object.create(null);



function getLastTimeAction(action_name) {
    let lat = last_animation_target[action_name];
    if (lat === undefined) {
        lat = {};
        last_animation_target[action_name] = lat;
    }
    return lat;
}

function setLastTimeAction(action_name, time, value) {
    const lat = getLastTimeAction(action_name);
    lat.time = time;
    lat.value = value;
}



const jitter_mes = [
    0.0018719360194504,
    0.0085427736297915,
    0.0089587110462406,
    -0.0091572255916694,
    0.0026593332330973,
    -0.0041746954033965,
    0.0071379176420802,
    -0.0074924437596893,
    -0.0096538908591745,
    -0.003530764185605,
    0.0097916367742194,
    0.0062589257379337,
    -0.0087246275780372,
    -0.00073795661830248,
    0.006069630177724,
    0.00065450962197711,
    -0.0054716418289913,
    -0.0020802203156428,
    -0.0028227655556159,
    -0.0041246565497129,
  ];


function interpolateAction(action_name, last_time, time, last_value, new_value) {
    if (last_value === undefined) {
        return new_value;
    }
    const dt = (time - last_time);
    const dv = (new_value - last_value);

    let dmult = 0.01;

    if ( action_name === 'Iris L X' ||
         action_name === 'Iris R X' ) {

        const jitter_seed = (time / 560) | 0;
        return new_value + (jitter_mes[jitter_seed % jitter_mes.length] * 8);
    }
    else if ( action_name === 'Iris L Y' ||
              action_name === 'Iris R Y' ) {

        const jitter_seed = ((time + (560 * 5)) / 760) | 0;
        return new_value + (jitter_mes[jitter_seed % jitter_mes.length] * 8);
    }
    else if ( action_name.startsWith('Close Eye') ) {
        dmult = 0.025;
//        return new_value;
    }
    else if ( action_name.startsWith('Head Twist') ) {
        // If it's a long twist,
//        console.log((dv / dt));
        if (Math.abs(dv / dt) > 0.02) {
//            console.log("Close eyes!");
            // Really hacky!
            animation_targets['Close Eye L'] = 1;
            animation_targets['Close Eye R'] = 1;
        }
    }

    const tdv = dt * dmult;

    let nv;
    if (dv > 0) {
        nv = (last_value + (dv * tdv));
        if (nv > new_value) {
            return new_value;
        }
    }
    else {
        nv = (last_value + (dv * tdv));
        if (nv < new_value) {
            return new_value;
        }
    }
    return nv;

}



const UPDATE_FPS = 80;

function RenderLoop(viewer) {

    let last_render_time = 0;


    function renderCall(time) {
        requestAnimationFrame(renderCall);

        if (time - last_render_time < (1000 / UPDATE_FPS)) {
            return;
        }

        last_render_time = time;

        // Calculate animation morphs,
        if (sample_model_target !== undefined) {

            for (let action_name in animation_targets) {
                const last = getLastTimeAction(action_name);
                const last_value = last.value;
                const last_time = last.time;
                const new_value = animation_targets[action_name];
                if (last_value === undefined || last_value !== new_value) {

                    const int_value = interpolateAction(
                                    action_name, last_time, time, last_value, new_value);

                    setLastTimeAction(action_name, time, int_value);
                    sample_model_target.setActionValue(action_name, int_value);
                }
            }

            // Refresh the pose from the actions we set,
            sample_model_target.refreshPoseFromActions();

            // const limit = 4000;
            // const f = (time % limit);
            // let o;
            // if (f < (limit / 2)) {
            //     o = ((f / (limit / 2)) * 2) - 1;
            // }
            // else {
            //     o = ((((limit / 2) - f) / (limit / 2)) * 2) + 1;
            // }
            //
            // // Update morphs,
            // sample_model_target.setActionValue('Head Twist', o);
        }

//        viewer.updateCamera(600, 900, 1);
        viewer.renderAll();

    }


    function start() {
        requestAnimationFrame(renderCall);
    }

    return {
        start
    };
}



function cap(v) {
    if (v < -1) {
        return -1;
    }
    else if (v > 1) {
        return 1;
    }
    return v;
}
function capb(v) {
    if (v < 0) {
        return 0;
    }
    else if (v > 1) {
        return 1;
    }
    return v;
}
function capv(v, min, max) {
    if (v < min) {
        return min;
    }
    else if (v > max) {
        return max;
    }
    return v;
}



function inputUpdate(rpx, rpy) {

    const left_eye_x = cap((rpx - 69) * 0.0020);
    const right_eye_x = cap((rpx - -79) * 0.0020);

    const left_eye_y = cap((rpy - -143) * 0.0040);
    const right_eye_y = cap((rpy - -143) * 0.0040);


    const head_twist = cap( rpx * 0.0020 );


    const eye_close = capv((rpy - -133) * 0.0040, 0, 0.4);








    animation_targets['Head Twist'] = head_twist;
    animation_targets['Iris L X'] = left_eye_x;
    animation_targets['Iris R X'] = right_eye_x;
    animation_targets['Iris L Y'] = left_eye_y;
    animation_targets['Iris R Y'] = right_eye_y;

    animation_targets['Close Eye L'] = eye_close;
    animation_targets['Close Eye R'] = eye_close;

}



function mousePositionHandler(evt) {

    // Mouse position relative to window,
    const client_x = evt.clientX;
    const client_y = evt.clientY;

    const win_width = window.outerWidth;
    const win_height = window.outerHeight;

    const rpx = client_x - (win_width / 2);
    const rpy = client_y - (900 / 2);

    inputUpdate(rpx, rpy);

}

function touchMoveHandler(evt) {

    // stop touch event
    evt.stopPropagation();
    evt.preventDefault();

    const client_x = evt.touches[0].clientX;
    const client_y = evt.touches[0].clientY;

    const win_width = window.outerWidth;
    const win_height = window.outerHeight;

    const rpx = client_x - (win_width / 2);
    const rpy = client_y - (900 / 2);

    inputUpdate(rpx, rpy);

}






function loaded() {

    const viewer = VAnimViewer.createViewer(600, 900);

    // Load our test VMOD file,
    viewer.loadVMOD('sample_01.vmod', (err, model_target) => {
        if (err) {
            console.error(err);
            return;
        }
        sample_model_target = model_target;

        console.log(sample_model_target.getActionNames());
    });


    const main_el = document.getElementById('main');
    main_el.appendChild(viewer.domElement);


    animation_targets['Head Twist'] = 0;
    animation_targets['Brows Concern'] = 0;
    animation_targets['Brows Anger'] = 0;


    // The render loop,
    const render_loop = RenderLoop(viewer);
    render_loop.start();

}




window.addEventListener('load', loaded);
window.addEventListener('mousemove', mousePositionHandler);
window.addEventListener('touchmove', touchMoveHandler);
