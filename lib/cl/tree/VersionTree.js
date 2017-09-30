"use strict";

function VersionTree(in_root) {

    let root = (in_root === undefined) ? {} : in_root;

    function nodeOb(key, value, left, right) {
        return {
            key, value, left, right
        };
    }

    // function copyNode(node) {
    //     return nodeOb(node.key, node.value, node.left, node.right);
    // }


    function keyCmp(key1, key2) {
        if (key1 < key2) {
            return -1;
        }
        else if (key1 > key2) {
            return 1;
        }
        else {
            return 0;
        }
    }

    function update(node, key, value) {
        const c = keyCmp(key, node.key);
        if (c < 0) {
            if (node.left === undefined) {
                return nodeOb(node.key, node.value,
                                nodeOb(key, value), node.right);
            }
            return nodeOb(node.key, node.value,
                            update(node.left, key, value), node.right);
        }
        else if (c > 0) {
            if (node.right === undefined) {
                return nodeOb(node.key, node.value,
                                node.left, nodeOb(key, value));
            }
            return nodeOb(node.key, node.value,
                            node.left, update(node.right, key, value));
        }
        else {
            // Found the node with the key,
            return nodeOb(key, value, node.left, node.right);
        }
    }

    function fetch(node, key) {
        if (node === undefined) {
            return;
        }
        const c = keyCmp(key, node.key);
        if (c < 0) {
            return fetch(node.left, key);
        }
        else if (c > 0) {
            return fetch(node.right, key);
        }
        else {
            // Found it!
            return node.value;
        }
    }

    function removeMinNode(node, kv) {
        if (node.left !== undefined) {
            return nodeOb(node.key, node.value,
                        removeMinNode(node.left, kv), node.right);
        }
        kv.key = node.key;
        kv.value = node.value;
        return node.right;
    }


    function wipe(node, key) {
        if (node === undefined) {
            return;
        }
        const c = keyCmp(key, node.key);
        if (c < 0) {
            return nodeOb(node.key, node.value,
                            wipe(node.left, key), node.right);
        }
        else if (c > 0) {
            return nodeOb(node.key, node.value,
                            node.left, wipe(node.right, key));
        }
        else {
            // Found it!
            // If the node has no children,
            const lnode = node.left;
            const rnode = node.right;

            if (rnode !== undefined) {
                if (lnode === undefined) {
                    return rnode;
                }
                // Remove the minimum node on the right branch and create a
                // new node with this key/value pair in place of the removed
                // entry.
                const kv = {};
                const new_r = removeMinNode(rnode, kv);
                return nodeOb(kv.key, kv.value, lnode, new_r);
            }
            else {
                return lnode;
            }

        }
    }

    function set(key, value) {
        if (root === undefined) {
            root = nodeOb(key, value);
            return;
        }
        else {
            // Add or change the value in the tree,
            root = update(root, key, value);
        }
        return value;
    }

    function get(key) {
        return fetch(root, key);
    }

    function remove(key) {
        root = wipe(root, key);
    }


    function visit(node, f) {
        if (node === undefined) {
            return;
        }
        visit(node.left, f);
        f(node);
        visit(node.right, f);
    }

    function fSet(f) {
        const set = [];
        visit(root, (node) => set.push( f(node) ));
        return set;
    }

    function keySet() {
        return fSet( (node) => node.key );
    }

    function entrySet() {
        return fSet( (node) => {
            return { key: node.key, value: node.value };
        } );
    }

    function copy() {
        return VersionTree(root);
    }

    function layoutSorted(entries, min, max) {
        if (min >= max) {
            return;
        }
        const count = max - min;
        if (count === 1) {
            const ent = entries[min];
            return nodeOb(ent.key, ent.value);
        }
        else if (count === 2) {
            const ent1 = entries[min];
            const ent2 = entries[min + 1];
            return nodeOb(ent1.key, ent1.value,
                            undefined, nodeOb(ent2.key, ent2.value));
        }

        // Pick the mid entry,
        const mid = ((max + min) / 2) | 0;
        const ent = entries[mid];

        const lnode = layoutSorted(entries, min, mid);
        const rnode = layoutSorted(entries, mid + 1, max);

        return nodeOb(ent.key, ent.value, lnode, rnode);

    }

    function balance() {
        // Sorted set of all keys,
        const entries = entrySet();
        root = layoutSorted(entries, 0, entries.length);
    }


    function asObject() {
        const ob = {};
        visit(root, (node) => {
            ob[node.key] = node.value;
        });
        return ob;
    }

    function fromObject(in_ob) {
        for (let key in in_ob) {
            set(key, in_ob[key]);
        }
        balance();
    }



    function debug() {
        console.log(root);
        let str = '';
        visit(root, (node) => {
            str += node.key;
            str += ' = ';
            str += node.value;
            str += '\n';
        });
        return str;
    }


    return {
        set,
        get,
        remove,

        copy,
        balance,
        entrySet,
        keySet,
        debug,

        asObject,
        fromObject,
    };

}

module.exports = VersionTree;
