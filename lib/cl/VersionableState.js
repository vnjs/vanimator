"use strict";

const VersionTree = require('./tree/VersionTree.js');

const materialized_state_symbol = Symbol('VersionTree State Symbol');

// A set of mutable property states that can have version checkpoints. Allows
// for state changes to be reverted in the case of an undo or redo action.

function VersionableState(in_map) {

    let tree = VersionTree();
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

        function push(i, ob) {
            const iarr = getOrdinal().slice(0);
            iarr.push(i);
            setOrdinal(iarr);
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

        function remove(i) {
            throw Error('PENDING');
        }

        function setOrdinal(arr) {
            tree.set(key + '[]', arr);
        }

        function getOrdinal() {
            return tree.get(key + '[]');
        }

        function getLength() {
            const arr_ref = getOrdinal();
            return arr_ref.length;
        }

        function isDefined() {
            return getOrdinal() !== undefined;
        }

        function forEach(f) {
            const ordinals = getOrdinal();
            for (let i = 0; i < ordinals.length; ++i) {
                f( get( ordinals[i] ), i );
            }
        }

        function find(f) {
            const ordinals = getOrdinal();
            for (let i = 0; i < ordinals.length; ++i) {
                const item = get( ordinals[i] );
                if ( f( item, i ) ) {
                    return item;
                }
            }
            return undefined;
        }

        return {
            push,
            get,
            remove,
            setOrdinal,
            getOrdinal,
            getLength,
            isDefined,
            forEach,
            find
        };

    }



    function load(vs_in) {
        tree = vs_in.getTree();
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
        tree.set(key + '[]', []);
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


    function createMemento() {
        const memento = {};
        memento[materialized_state_symbol] = tree;
        return memento;
    }

    function revertFromMemento(memento) {
        const mem_tree = memento[materialized_state_symbol];
        if (mem_tree !== undefined) {
            tree = mem_tree;
        }
        throw Error('No state found in memento');
    }

    function getTree() {
        return tree;
    }



    return {
        load,

        set,
        get,
        remove,
        defineArray,
        getArray,

        debug,
        toJSON,

        createMemento,
        revertFromMemento,

        getTree,
    };

}

module.exports = VersionableState;
