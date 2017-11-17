"use strict";

// A history object that keeps a record of state changes together with reversal
// operations. Used for implementing Undo/Redo operations.

function ReplayHistory(ss, max_history_items) {

    if (max_history_items === undefined) {
        max_history_items = 64;
    }

    if (max_history_items < 4) {
        max_history_items = 4;
    }

    const memento_history = [];
    let current_version = -1;

    let current_top_memento;
    let at_top = true;

    function checkpoint() {
        if (at_top === false) {
            --current_version;
        }
        if (current_version + 1 < memento_history.length) {
            memento_history.length = current_version + 1;
        }
        memento_history.push(ss.createMemento());
        ++current_version;
        // Don't let history get too large,
        if (current_version > max_history_items + 5) {
            memento_history.splice(0, 5);
            current_version -= 5;
        }
        current_top_memento = undefined;
        at_top = true;
    }

    function undo() {
        if (memento_history.length === 0) {
            return false;
        }
        if (at_top === true) {
            current_top_memento = ss.createMemento();
            at_top = false;
            ss.revertFromMemento( memento_history[current_version] );
            return true;
        }
        else if (current_version > 0) {
            --current_version;
            ss.revertFromMemento( memento_history[current_version] );
            return true;
        }
        return false;
    }

    function redo() {
        if (current_version < memento_history.length - 1) {
            ++current_version;
            ss.revertFromMemento( memento_history[current_version] );
            return true;
        }
        else if (at_top === false) {
            ss.revertFromMemento(current_top_memento);
            current_top_memento = undefined;
            at_top = true;
            return true;
        }
        return false;
    }

    function removeTop() {
        if (memento_history.length > 0) {
            memento_history.splice(-1, 1);
            --current_version;
        }
    }

    function clear() {
        memento_history.length = 0;
        current_version = -1;
        at_top = true;
        current_top_memento = undefined;
    }

    return {
        checkpoint,
        undo,
        redo,
        removeTop,
        clear,
    };

}

module.exports = ReplayHistory;
