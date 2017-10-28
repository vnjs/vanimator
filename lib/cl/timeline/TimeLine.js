"use strict";

const MouseEventHandler = require('../MouseEventHandler.js');
const EventHandler = require('../EventHandler.js');

/* global document */


function createTimeLineButton(icon_class, label) {
    const btn_el = document.createElement('button');
    btn_el.type = 'button';
    btn_el.className = 'timeline-button';
    const bcontent = document.createElement('div');
    bcontent.className = icon_class;
    btn_el.appendChild(bcontent);
    btn_el.appendChild(document.createTextNode(label));

    function setDisabled(disabled) {
        if (disabled === true) {
            btn_el.disabled = 'disabled';
        }
        else {
            btn_el.disabled = undefined;
        }
    }

    return {
        setDisabled,
        domElement: btn_el
    };
}


function TimeLine(options) {

    const event_handler = EventHandler();

    let canvas_el;
    let timeline_body_el;
    let ctx;

    let needs_repaint = true;

    let current_time_point = 0;

    const margin_x = 150;
    const margin_y = 17;

    let is_dragging = false;

    let current_data;

    let view_x = 0;
    let view_y = 0;
    let scale_x = 1.15;

    let has_data = false;

    // Pixel limits of (unscaled) timeline
    let left_limit;
    let right_limit;
    // Key/value pairs to add to the events generated from this time line.
    let event_info;

    let timeline_model;

    let insert_keyframe_btn;
//    let remove_keyframe_btn;


    // DOM element,
    const domElement = document.createElement('div');
    domElement.className = 'timeline-main';

    function init() {

        const timeline_controls = document.createElement('div');
        timeline_controls.className = 'noselect timeline-controls';
        timeline_body_el = document.createElement('div');
        timeline_body_el.className = 'noselect timeline-body';

        canvas_el = document.createElement('canvas');
        canvas_el.className = 'noselect timeline-canvas';
        canvas_el.width = '500';
        canvas_el.height = '50';

        ctx = canvas_el.getContext('2d');

        timeline_body_el.appendChild(canvas_el);

        insert_keyframe_btn = createTimeLineButton('timeline-insert-keyframe-icon', 'Insert');
//        remove_keyframe_btn = createTimeLineButton('timeline-remove-keyframe-icon', 'Remove');

        insert_keyframe_btn.setDisabled(true);
//        remove_keyframe_btn.setDisabled(true);

        timeline_controls.appendChild(insert_keyframe_btn.domElement);
//        timeline_controls.appendChild(remove_keyframe_btn.domElement);

        domElement.appendChild(timeline_controls);
        domElement.appendChild(timeline_body_el);

        const drop_handler = options.getDropHandler();

        canvas_el.addEventListener('drop', (evt) => {
            if (drop_handler !== undefined) {
                drop_handler.handleDrop(evt);
                return false;
            }
        }, false);

        // Handle drag over on the tree view,
        canvas_el.addEventListener('dragover', (evt) => {
            if (drop_handler !== undefined) {
                if (drop_handler.canDrop()) {
                    evt.preventDefault();
                    return false;
                }
            }
        }, false);

        insert_keyframe_btn.domElement.addEventListener('click', (evt) => {
            insertKeyFrameAction();
        }, false);

        const doc_mouse_handler = MouseEventHandler();
        doc_mouse_handler.captureMouseEvents(canvas_el, (evt) => {

            if (!has_data) {
                return;
            }

            if (evt.type === 'mousedown') {
                // If we just captured the focus then don't start drag,
                if (document.activeElement !== canvas_el) {
                    canvas_el.focus();
                }
                else {
                    is_dragging = true;
                }
            }

            // Start drag only when the cursor moved 8 pixels
            if (!is_dragging && evt.type === 'mousemove' && Math.abs(evt.dx) > 8) {
                is_dragging = true;
            }

            if (is_dragging) {
//                calcPercent(evt);

                const px_range = (right_limit[1] - left_limit[1]) * scale_x;
                const zo = ((evt.x - margin_x) + view_x) / px_range;
                let current_v =
                        ((right_limit[0] - left_limit[0]) * zo) + left_limit[0];

                const lowerv = left_limit[0];
                const upperv = right_limit[0];
                if (current_v < lowerv) {
                    current_v = lowerv;
                }
                else if (current_v > upperv) {
                    current_v = upperv;
                }

                const event = {
                    type: 'controlmove',
                    value: current_v
                };
                for (let k in event_info) {
                    event[k] = event_info[k];
                }

                if (evt.type === 'mousemove') {
                    // Fire control change event,
                    event.type = 'timemove';
                    event_handler.dispatchEvent(event);
                }
                else if (evt.type === 'mouseup') {
                    is_dragging = false;
                    // Fire control change event,
                    event.type = 'timechange';
                    event_handler.dispatchEvent(event);
                }

                updateCurrentTimePoint(current_v);

            }

        });

        canvas_el.tabIndex = 0;

    }
    init();


    function layoutFromResize() {

        const tl_width = timeline_body_el.clientWidth;
        const tl_height = timeline_body_el.clientHeight;
        canvas_el.width = tl_width;
        canvas_el.height = tl_height;

        needs_repaint = true;

//        console.log("TimeLine setSize(%s, %s)", tl_width, tl_height);
    }


    function insertKeyFrameAction() {
        options.insertKeyFrameAction();
        needs_repaint = true;
    }


    function getCurrentDimensions() {
        return {
            width: canvas_el.scrollWidth,
            height: canvas_el.scrollHeight
        };
    }



    function updateCurrentTimePoint(time_point) {
        needs_repaint = true;
        current_time_point = time_point;
    }

    function clear() {
        has_data = false;
        needs_repaint = true;
        current_data = undefined;

        insert_keyframe_btn.setDisabled(true);
//        remove_keyframe_btn.setDisabled(true);

        layout();
    }

    function setupFor(setup) {
        has_data = true;
        needs_repaint = true;
        current_data = setup;

        insert_keyframe_btn.setDisabled(false);
//        remove_keyframe_btn.setDisabled(false);

        const init_vals = options.setupFor(setup);
        left_limit = init_vals.left_limit;
        right_limit = init_vals.right_limit;
        current_time_point = init_vals.current_time_point;

        event_info = init_vals.event_info;

        layout();
    }

    function getCurrentData() {
        return current_data;
    }

    function getCurrentTimePoint() {
        return current_time_point;
    }


    function layout() {
        timeline_model = options.getModel();
    }


    function refresh() {
        needs_repaint = true;

        // Layout,

        layout();
    }



    function renderTLMark(x, label) {
        ctx.beginPath();
        ctx.moveTo(x, margin_y);
        ctx.lineTo(x, margin_y - 5);
        ctx.stroke();

        if (label !== undefined) {
            ctx.font = "13px sans-serif";
            ctx.fillText(label, x, margin_y - 5);
        }

    }



    function renderTimeXAxis() {

        const cur_dim = getCurrentDimensions();

        ctx.fillStyle = 'rgb(69,69,69)';
        ctx.fillRect(0, 0, cur_dim.width, margin_y);
        ctx.strokeStyle = 'rgb(43,43,43)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, margin_y);
        ctx.lineTo(cur_dim.width, margin_y);
        ctx.stroke();

        if (!has_data) {
            return;
        }

        const left_limit_pixel = left_limit[1] * scale_x;
        const right_limit_pixel = right_limit[1] * scale_x;

        const end_x = margin_x + right_limit_pixel;

        ctx.strokeStyle = 'rgb(122,122,122)';
        ctx.beginPath();
        ctx.moveTo(margin_x, margin_y);
        ctx.lineTo(end_x, margin_y);
        ctx.stroke();
        ctx.fillStyle = 'rgb(192,192,192)';

        const from = left_limit[0];
        const to = right_limit[0];

        // What's a sensible extent for each value.

        const scales = [
            0.01,
            0.05,
            0.1,
            0.5,
            1,
            2,
            5,
            10,
            15,
            20,
            25,
            50,
            100,
            150,
            200,
            250,
            500,
            1000
        ];

        // Each view pixel travels x across the range.
        let pixel_ratio = (to - from) / (right_limit_pixel - left_limit_pixel);

        const sv = (40 * pixel_ratio);
        let ms;
        for (let i = 0; i < scales.length; ++i) {
            ms = scales[i];
            if (ms > sv) {
                break;
            }
        }
        const per_pixel = (ms / pixel_ratio);
        const per_value = ms;


//        console.log("per_pixel = %s", per_pixel);
//        console.log("per_value = %s", per_value);

        const len = parseInt(
            ((right_limit_pixel - left_limit_pixel) / per_pixel).toFixed(), 10);

        for (let i = 0; i <= len; ++i) {
            const px = i * per_pixel;
            const v = (i * per_value) + from;

            let v_out;
            if (ms < 0.1) {
                v_out = v.toFixed(2);
            }
            else if (ms < 1) {
                v_out = v.toFixed(1);
            }
            else {
                v_out = v.toFixed(0);
            }
            renderTLMark(margin_x + (px - view_x), v_out);
        }





        // Visible section,
        renderTLMark(margin_x + (left_limit_pixel - view_x));
        renderTLMark(margin_x + (right_limit_pixel - view_x));

    }

    function renderElementsMargin() {
        if (!has_data) {
            return;
        }
        // PENDING: Render left margin list,
    }


    function timeValueToX(time_point) {
        const left_limit_pixel = left_limit[1] * scale_x;
        const right_limit_pixel = right_limit[1] * scale_x;
        const px_range = (right_limit_pixel - left_limit_pixel);
        const val_range = right_limit[0] - left_limit[0];
        const r = (time_point - left_limit[0]) / val_range;
        const x = ((r * px_range) + left_limit_pixel) + margin_x;
        return x;
    }


    function renderCurrentTimePoint() {
        if (!has_data) {
            return;
        }

        const x = timeValueToX(current_time_point);
        const cur_dim = getCurrentDimensions();

        ctx.strokeStyle = 'rgb(222,122,122)';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cur_dim.height);
        ctx.stroke();


    }

    function drawFKShape(x, y, s) {
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.lineTo(x, y + (s * 1.1));
        ctx.lineTo(x + s, y);
        ctx.lineTo(x, y - (s * 1.1));
        ctx.fill();
    }


    function renderKeyFrameTarget(x, y) {
        ctx.fillStyle = 'rgb(0, 0, 0)';
        drawFKShape(x, y + 16, 8);
        ctx.fillStyle = 'rgb(180, 180, 90)';
        drawFKShape(x, y + 16, 7);
    }

    function renderRows() {
        if (timeline_model !== undefined) {
            const row_data = timeline_model.row_data;
            const len = row_data.length;

            const cur_dim = getCurrentDimensions();

            ctx.fillStyle = 'rgb(192,192,192)';
            ctx.strokeStyle = 'rgb(46,46,46)';
            ctx.font = "15px sans-serif";

            const time_x_coords = [];
            function computeX(row_frame) {

                const time_point = row_frame.time;

                const left_limit_pixel = left_limit[1] * scale_x;
                const right_limit_pixel = right_limit[1] * scale_x;
                const px_range = (right_limit_pixel - left_limit_pixel);
                const val_range = right_limit[0] - left_limit[0];
                const r = (time_point - left_limit[0]) / val_range;
                const x = ((r * px_range) + left_limit_pixel) + margin_x;
                time_x_coords.push( timeValueToX(row_frame.time) );
            }

            for (let i = 0; i < len; ++i) {
                const row = row_data[i];

                const row_type = row.type;
                const row_name = row.name;
                const row_frames = row.frames;

                const y = (i * 32) + margin_y;

                // Calculate time points,
                time_x_coords.length = 0;
                row_frames.forEach(computeX);

                ctx.font = "10px sans-serif";
                ctx.fillText(row_type, 5, y + 11);
                ctx.font = "15px sans-serif";
                ctx.fillText(row_name, 5, y + 28);
                ctx.beginPath();
                ctx.moveTo(0, y + 32);
                ctx.lineTo(cur_dim.width, y + 32);
                ctx.stroke();

                // Defer row render operation,
                options.renderRow(row, i, time_x_coords, y);

                for (let n = 0; n < row_frames.length; ++n) {
                    // Draw a marker,
                    const x = time_x_coords[n];
                    renderKeyFrameTarget(x, y);
                }


//                console.log('RENDERING: %s (%s)', row_name, row_frames.length);

            }
        }
    }



    // Render call for the canvas. This should be called every request
    // animation frame,

    function renderCall() {
        // Repaint?
        if (needs_repaint === true) {
            needs_repaint = false;

            ctx.clearRect(0, 0, canvas_el.width, canvas_el.height);

            renderTimeXAxis();
            renderElementsMargin();

            renderRows();

            renderCurrentTimePoint();

        }
    }





    const inst = {
        domElement,
        layoutFromResize,
        clear,
        setupFor,
        updateCurrentTimePoint,
        refresh,
        renderCall,

        getCurrentData,
        getCurrentTimePoint,

        addEventListener: event_handler.addEventListener,
        removeEventListener: event_handler.removeEventListener

    };
    options.setTimeLine(inst);
    return inst;

}

module.exports = TimeLine;
