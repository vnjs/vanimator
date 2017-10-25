"use strict";

/* global document */

function TimeLine() {

    let canvas_el;
    let timeline_body_el;
    let ctx;

    let needs_repaint = true;

    let view_x = 0;
    let view_y = 0;
    let scale_x = 1.25;

    let has_data = false;

    // Pixel limits of (unscaled) timeline
    let left_limit;
    let right_limit;



    // DOM element,
    const domElement = document.createElement('div');
    domElement.className = 'timeline-main';

    function init() {

        const timeline_controls = document.createElement('div');
        timeline_controls.className = 'timeline-controls';
        timeline_body_el = document.createElement('div');
        timeline_body_el.className = 'timeline-body';

        canvas_el = document.createElement('canvas');
        canvas_el.className = 'timeline-canvas';
        canvas_el.width = '500';
        canvas_el.height = '50';

        ctx = canvas_el.getContext('2d');

        timeline_body_el.appendChild(canvas_el);

        domElement.appendChild(timeline_controls);
        domElement.appendChild(timeline_body_el);

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


    function setupWithData(options) {
        needs_repaint = true;

        if (options === undefined) {
            has_data = false;
            return;
        }
        has_data = true;
        left_limit =  [ -1,    0 ];
        right_limit = [  1, 1000 ];

    }






    function getCurrentDimensions() {
        return {
            width: canvas_el.scrollWidth,
            height: canvas_el.scrollHeight
        };
    }



    function refresh() {

    }



    function renderTLMark(x, label) {
        ctx.beginPath();
        ctx.moveTo(x, 17);
        ctx.lineTo(x, 12);
        ctx.stroke();

        if (label !== undefined) {
            ctx.font = "13px sans-serif";
            ctx.fillText(label, x, 12);
        }

    }



    function renderTimeXAxis() {

        const cur_dim = getCurrentDimensions();

        const margin_x = 150;

        ctx.fillStyle = 'rgb(69,69,69)';
        ctx.fillRect(0, 0, cur_dim.width, 17);
        ctx.strokeStyle = 'rgb(43,43,43)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 17);
        ctx.lineTo(cur_dim.width, 17);
        ctx.stroke();

        if (!has_data) {
            return;
        }

        const left_limit_pixel = left_limit[1] * scale_x;
        const right_limit_pixel = right_limit[1] * scale_x;

        const end_x = margin_x + right_limit_pixel;

        ctx.strokeStyle = 'rgb(122,122,122)';
        ctx.beginPath();
        ctx.moveTo(margin_x, 17);
        ctx.lineTo(end_x, 17);
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
            console.log(v);
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




    // Render call for the canvas. This should be called every request
    // animation frame,

    function renderCall() {
        // Repaint?
        if (needs_repaint === true) {
            needs_repaint = false;

            ctx.clearRect(0, 0, canvas_el.width, canvas_el.height);

            renderTimeXAxis();
            renderElementsMargin();

        }
    }





    return {
        domElement,
        layoutFromResize,
        setupWithData,
        refresh,
        renderCall,
    };

}

module.exports = TimeLine;
