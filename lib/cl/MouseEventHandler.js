"use strict";

/* global document */

// Hooks into the browser's mouse handling system to generate sensible mouse
// movement events.


let captureFunction;

function globalMouseEvent(evt) {
    let ret_val = true;
    if (captureFunction !== undefined) {
        ret_val = captureFunction(evt);
    }
    if (evt.type === 'mouseup') {
        captureFunction = undefined;
    }
    return ret_val;
}

// For detection of mouse events outside of window pane,
document.addEventListener("click", globalMouseEvent, false);
document.addEventListener("mousedown", globalMouseEvent, false);
document.addEventListener("mousemove", globalMouseEvent, false);
document.addEventListener("mouseup", globalMouseEvent, false);



function MouseEventHandler() {

    let mousedown = false;
    let md_target;

    let md_screen_x, md_screen_y;
    let md_at_x, md_at_y;

    let cur_target;
    let cur_screen_x, cur_screen_y;
    let cur_at_x, cur_at_y;


    const listeners = [];

    // Fires custom event that's dispatched to listeners,
    function fire(evt) {
        const len = listeners.length;
        for (let i = 0; i < len; ++i) {
            const listener = listeners[i];
            if (listener.target === evt.target) {
                listener.notifier(evt);
            }
        }
    }

    function doDocumentMouseEvent(evt) {
        const evt_type = evt.type;

        const difx = evt.screenX - md_screen_x;
        const dify = evt.screenY - md_screen_y;
        const computed_x = md_at_x + difx;
        const computed_y = md_at_y + dify;

        if (mousedown === true && evt_type === 'mouseup') {

            // Fire event,
            fire({
                type: evt_type,
                target: md_target,
                x: computed_x,
                y: computed_y,
                button: evt.button,
                shiftKey: evt.shiftKey,
                altKey: evt.altKey,
                ctrlKey: evt.ctrlKey
            });

            mousedown = false;
            md_target = undefined;

        }
        else if (evt_type === 'mousemove') {

            // Fire event,
            fire({
                type: evt_type,
                target: md_target,
                x: computed_x,
                y: computed_y,
                dx: difx,
                dy: dify,
                button: evt.button,
                shiftKey: evt.shiftKey,
                altKey: evt.altKey,
                ctrlKey: evt.ctrlKey
            });

        }
    }

    function startMouseMoveCaptureEvents() {

        mousedown = true;

        captureFunction = doDocumentMouseEvent;

        md_screen_x = cur_screen_x;
        md_screen_y = cur_screen_y;
        md_at_x = cur_at_x;
        md_at_y = cur_at_y;
        md_target = cur_target;

    }

    function captureMouseEvents(dom_element, listener) {

        function doCapturedMouseEvent(evt) {
            const type = evt.type;

            cur_screen_x = evt.screenX;
            cur_screen_y = evt.screenY;
            cur_at_x = evt.offsetX;
            cur_at_y = evt.offsetY;
            cur_target = evt.target;

            if (type === 'mousedown' && mousedown === false) {

                startMouseMoveCaptureEvents();

                // Fire event,
                fire({
                    type: type,
                    target: md_target,
                    x: md_at_x,
                    y: md_at_y,
                    button: evt.button,
                    shiftKey: evt.shiftKey,
                    altKey: evt.altKey,
                    ctrlKey: evt.ctrlKey
                });

            }

            // Prevent default operations from this event,
            evt.preventDefault();
        }

//        dom_element.addEventListener("click", doCapturedMouseEvent, false);
        dom_element.addEventListener("mousedown", doCapturedMouseEvent, false);
//        dom_element.addEventListener("mouseenter", doCapturedMouseEvent, false);
//        dom_element.addEventListener("mouseleave", doCapturedMouseEvent, false);
        dom_element.addEventListener("mousemove", doCapturedMouseEvent, false);
//        dom_element.addEventListener("mouseover", doCapturedMouseEvent, false);
//        dom_element.addEventListener("mouseout", doCapturedMouseEvent, false);
        dom_element.addEventListener("mouseup", doCapturedMouseEvent, false);

        listeners.push({
            target: dom_element,
            notifier: listener,
        });

    }




    // // For detection of mouse events outside of window pane,
    // document.addEventListener("click", doDocumentMouseEvent, false);
    // document.addEventListener("mousedown", doDocumentMouseEvent, false);
    // document.addEventListener("mousemove", doDocumentMouseEvent, false);
    // document.addEventListener("mouseup", doDocumentMouseEvent, false);

    return {
        startMouseMoveCaptureEvents,
        captureMouseEvents,
    };

}

module.exports = MouseEventHandler;
