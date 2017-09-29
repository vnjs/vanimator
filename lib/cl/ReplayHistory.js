"use strict";

// A history object that keeps a record of state changes together with reversal
// operations. Used for implementing Undo/Redo operations.

function ReplayHistory(max_history_items) {

    if (max_history_items < 4) {
        max_history_items = 4;
    }

    // Doubly linked list,
    let start;
    let end;

    let current;

    let current_count = 0;



    function item(data) {
        return {
            data: data,
            next: undefined,
            prev: undefined,
        };
    }

    function countItems() {
        if (start === undefined) {
            return 0;
        }
        else {
            let count = 1;
            let i = start;
            while (i.next !== undefined) {
                ++count;
                i = i.next;
            }
            return count;
        }
    }


    function append(data) {
        if (current === undefined) {
            start = item(data);
            end = start;
            current = end;
            current_count = 1;
        }
        else {
            const at_end = (current === end);
            const ni = item(data);
            current.next = ni;
            ni.prev = current;
            end = ni;
            current = ni;
            if (at_end) {
                ++current_count;
            }
            else {
                current_count = countItems();
            }
        }

        if (current_count > max_history_items) {
            start = start.next;
            --current_count;
        }

    }


    function recordOperation(name, forward, reverse) {
        append({
            name, forward, reverse
        });
    }

    function undo() {
        if (current === undefined) {
            return false;
        }
        else {
            current.data.reverse();
            current = current.prev;
            return true;
        }
    }

    function redo() {
        if (current === undefined) {
            if (start === undefined) {
                return false;
            }
            else {
                current = start;
                current.data.forward();
                return true;
            }
        }
        else if (current.next === undefined) {
            return false;
        }
        else {
            current = current.next;
            current.data.forward();
            return true;
        }
    }

    function clear() {
        current_count = 0;
        start = undefined;
        end = undefined;
        current = undefined;
    }



    return {
        recordOperation,
        undo,
        redo,
        clear
    };

}

module.exports = ReplayHistory;
