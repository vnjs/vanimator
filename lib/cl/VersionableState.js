"use strict";

// A set of mutable property states that can have version checkpoints. Allows
// for state changes to be reverted in the case of an undo or redo action.

function VersionableState(in_map) {

    const map = (in_map === undefined) ? {} : in_map;


    function vobject(parent_key) {

        function get(key) {
            return map[parent_key + '.' + key];
        }

        function set(key, value) {
            map[parent_key + '.' + key] = value;
        }

        function remove(key) {
            delete map[parent_key + '.' + key];
        }

        return {
            get,
            set,
            remove
        };

    }


    function varray(key) {

        const length_key = key + '.length';

        function push(ob) {
            const i = getLength();
            map[length_key] = i + 1;
            const out = get(i);
            if (ob !== undefined) {
                for (let k in ob) {
                    out.set(k, ob[k]);
                }
            }
            return out;
        }

        function get(i) {
            return vobject(key + '[' + i + ']');
        }

        function getLength() {
            const len = map[length_key];
            if (len === undefined) {
                return 0;
            }
            return len;
        }

        return {
            push,
            get,
            remove,
            getLength
        };

    }


    function set(key, value) {
        map[key] = value;
    }

    function get(key) {
        return map[key];
    }

    function remove(key) {
        delete map[key];
    }

    function defineArray(key) {
    }

    function getArray(key) {
        return varray(key);
    }


    function debug() {
        console.log(map);
    }

    function toJSON(replacer, spacing) {
        return JSON.stringify(map, replacer, spacing);
    }


    return {
        set,
        get,
        remove,
        defineArray,
        getArray,

        debug,
        toJSON,
    };

}

module.exports = VersionableState;
