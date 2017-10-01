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

    function checkpoint() {
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
    }

    function undo() {
        if (current_version > 0) {
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
        return false;
    }

    function clear() {
        memento_history.length = 0;
        current_version = -1;
    }

    return {
        checkpoint,
        undo,
        redo,
        clear
    };

}

module.exports = ReplayHistory;
