"use strict";

const VersionTree = require('./tree/VersionTree.js');

const materialized_state_symbol = Symbol('VersionTree State Symbol');

// A set of mutable property states that can have version checkpoints. Allows
// for state changes to be reverted in the case of an undo or redo action.


// Returns a shallow clone of the object at the given key,
function generalGetClonedObject(key, get) {
    const ob = get(key);
    if (ob === undefined) {
        return ob;
    }
    // Shallow clone,
    const clone = {};
    for (let prop in ob) {
        clone[prop] = ob[prop];
    }
    return clone;
}

function generalGetFromObject(key, prop, get) {
    const ob = get(key);
    if (ob !== undefined) {
        return ob[prop];
    }
    return undefined;
}

function generalSetInObject(key, prop, val, get, set) {
    const ob = generalGetClonedObject(key, get);
    if (ob !== undefined) {
        ob[prop] = val;
        set(key, ob);
        return;
    }
    throw Error('key/prop not found: ' + key + '["' + prop + '"]');
}

function generalDeleteInObject(key, prop, get, set) {
    const ob = generalGetClonedObject(key, get);
    if (ob !== undefined) {
        delete ob[prop];
        set(key, ob);
    }
}


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

        // Returns a shallow clone of the object at the given key,
        function getClonedObject(key) {
            return generalGetClonedObject(key, get);
        }

        function getFromObject(key, prop) {
            return generalGetFromObject(key, prop, get);
        }

        function setInObject(key, prop, val) {
            return generalSetInObject(key, prop, val, get, set);
        }

        function deleteInObject(key, prop) {
            generalDeleteInObject(key, prop, get, set);
        }

        return {
            get,
            set,
            remove,
            getClonedObject,
            getFromObject,
            setInObject,
            deleteInObject,
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
            const iarr = getOrdinal().slice(0);
            const p = iarr.indexOf(i);
            if (p >= 0) {
                iarr.splice(p, 1);
                setOrdinal(iarr);
                const rk = key + '[' + i + '].';
                const keys = tree.keySet();
                keys.forEach((k) => {
                    if (k.startsWith(rk)) {
                        tree.remove(k);
                    }
                });
            }
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
                const key = ordinals[i];
                f( get( key ), i, key );
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

    // Returns a shallow clone of the object at the given key,
    function getClonedObject(key) {
        return generalGetClonedObject(key, get);
    }

    function getFromObject(key, prop) {
        return generalGetFromObject(key, prop, get);
    }

    function setInObject(key, prop, val) {
        return generalSetInObject(key, prop, val, get, set);
    }

    function deleteInObject(key, prop) {
        generalDeleteInObject(key, prop, get, set);
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
        memento[materialized_state_symbol] = tree.copy();
        return memento;
    }

    function revertFromMemento(memento) {
        const mem_tree = memento[materialized_state_symbol];
        if (mem_tree !== undefined) {
            tree = mem_tree.copy();
        }
        else {
            throw Error('No state found in memento');
        }
    }

    function getTree() {
        return tree;
    }



    return {
        load,

        set,
        get,
        remove,
        getClonedObject,
        setInObject,
        getFromObject,
        deleteInObject,
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
