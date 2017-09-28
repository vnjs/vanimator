"use strict";

/* global document */

// Hooks into the browser's mouse handling system to generate sensible mouse
// movement events.

function MouseEventHandler() {

    let mousedown = false;
    let md_target;

    let md_screen_x, md_screen_y;
    let md_at_x, md_at_y;

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
        if (mousedown === true) {
            const evt_type = evt.type;

            const difx = evt.screenX - md_screen_x;
            const dify = evt.screenY - md_screen_y;
            const computed_x = md_at_x + difx;
            const computed_y = md_at_y + dify;

            if (evt_type === 'mousemove') {

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

            }
            else if (evt_type === 'mouseup') {

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
        }
    }

    function captureMouseEvents(dom_element, listener) {

        function doCapturedMouseEvent(evt) {
            const type = evt.type;
            if (type === 'mousedown') {
                mousedown = true;

                md_screen_x = evt.screenX;
                md_screen_y = evt.screenY;
                md_at_x = evt.offsetX;
                md_at_y = evt.offsetY;
                md_target = evt.target;

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
//        dom_element.addEventListener("mousemove", doCapturedMouseEvent, false);
//        dom_element.addEventListener("mouseover", doCapturedMouseEvent, false);
//        dom_element.addEventListener("mouseout", doCapturedMouseEvent, false);
        dom_element.addEventListener("mouseup", doCapturedMouseEvent, false);

        listeners.push({
            target: dom_element,
            notifier: listener,
        });

    }




    // For detection of mouse events outside of window pane,
    document.addEventListener("click", doDocumentMouseEvent, false);
    document.addEventListener("mousedown", doDocumentMouseEvent, false);
    document.addEventListener("mousemove", doDocumentMouseEvent, false);
    document.addEventListener("mouseup", doDocumentMouseEvent, false);

    return {
        captureMouseEvents,
    };

}

module.exports = MouseEventHandler;
