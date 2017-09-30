"use strict";

const VersionTree = require('./tree/VersionTree.js');

// A set of mutable property states that can have version checkpoints. Allows
// for state changes to be reverted in the case of an undo or redo action.

function VersionableState(in_map) {

    const tree = VersionTree();
    if (in_map !== undefined) {
        tree.fromObject(in_map);
    }


    function vobject(parent_key) {

        function get(key) {
            return tree.get(parent_key + '.' + key);
        }

        function set(key, value) {
            tree.set(parent_key + '.' + key, value);
        }

        function remove(key) {
            tree.remove(parent_key + '.' + key);
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
            tree.set(length_key, i + 1);
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
            const len = tree.get(length_key);
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
        tree.set(key, value);
    }

    function get(key) {
        return tree.get(key);
    }

    function remove(key) {
        tree.remove(key);
    }

    function defineArray(key) {
    }

    function getArray(key) {
        return varray(key);
    }


    function debug() {
        console.log(tree.debug());
    }

    function toJSON(replacer, spacing) {
        return JSON.stringify(tree.asObject(), replacer, spacing);
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
