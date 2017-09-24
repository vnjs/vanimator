"use strict";

function EventHandler(target) {

    const listeners = {};

    function addEventListener(type, callback) {
        if (!(type in listeners)) {
            listeners[type] = [];
        }
        listeners[type].push(callback);
    }

    function removeEventListener(type, callback) {
        if (!(type in listeners)) {
            return;
        }
        const stack = listeners[type];
        for (let i = 0, l = stack.length; i < l; ++i) {
            if (stack[i] === callback) {
                stack.splice(i, 1);
                return;
            }
        }
    }

    function dispatchEvent(event) {
        if (!(event.type in listeners)) {
            return true;
        }
        const stack = listeners[event.type];
        event.target = target;
        for (let i = 0, l = stack.length; i < l; ++i) {
            stack[i].call(target, event);
        }
        return !event.defaultPrevented;
    }


    // Exported API,
    return {
        addEventListener,
        removeEventListener,
        dispatchEvent
    };

}

module.exports = EventHandler;
