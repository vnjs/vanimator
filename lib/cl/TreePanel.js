"use strict";

/* globals document */

const EventHandler = require('./EventHandler.js');

// Composes a tree layout in the DOM

function TreePanel(getModel) {

    const event_handler = EventHandler();

//    const ENTRY_HEIGHT = 20;

    const selected_elements = [];

    const index_to_dom = [];

    const domElement = document.createElement('div');
    const tree_view_left_options = document.createElement('div');
    const tree_view_root = document.createElement('div');

    domElement.appendChild(tree_view_left_options);
    domElement.appendChild(tree_view_root);

    domElement.className = 'tree-view-base';
    tree_view_left_options.className = 'tree-view-left-options';
    tree_view_root.className = 'tree-view-root';

    tree_view_root.addEventListener('mousedown', (evt) => {
        const target = evt.target;
        if (target) {

            let down_on_uid = target.vanim_layer_uid;
            if (down_on_uid === undefined) {
                down_on_uid = target.parentNode.vanim_layer_uid;
            }
            if (down_on_uid !== undefined) {
                // Select this,
                deselectAll();
                selectUIDs(down_on_uid);

                // Dispatch select,
                const evt = {
                    type: 'select',
                    selected_elements
                };
                event_handler.dispatchEvent(evt);

            }
        }
        evt.preventDefault();
    }, false);

    const open_groups = {
        "": true
    };

    let controlRefreshFunc;


    function openGroup(group_key) {
        open_groups[group_key] = true;
    }

    function closeGroup(group_key) {
        delete open_groups[group_key];
    }

    function setControlRefresh(func) {
        controlRefreshFunc = func;
    }


    function modelIndexToElement(model_i) {
        return index_to_dom[model_i];
    }

    function deselectAll() {
        for (let i = 0; i < selected_elements.length; ++i) {
            const ele = modelIndexToElement(selected_elements[i]);
            ele.parentNode.classList.remove('selected');
        }
        selected_elements.length = 0;
    }

    function selectUIDs(uids) {
        if (!Array.isArray(uids)) {
            uids = [ uids ];
        }
        uids.forEach((uid) => {
            if (selected_elements.indexOf(uid) < 0) {
                selected_elements.push(uid);
                const ele = modelIndexToElement(uid);
                ele.parentNode.classList.add('selected');
            }
        });
    }

    function toPathKey(path) {
        return path.join('.');
    }


    function createBranchTitleElement(title, layer_uid, classes) {
        const title_dom = document.createElement('div');
        title_dom.className = classes;
        title_dom.textContent = title;
        title_dom.vanim_layer_uid = layer_uid;
        index_to_dom[layer_uid] = title_dom;
        return title_dom;
    }

    function createControlElement(layer_uid) {
        const control_div = document.createElement('div');
        control_div.className = 'tree-left-control-bar';

        if (controlRefreshFunc !== undefined) {
            controlRefreshFunc(control_div, layer_uid);
        }

        return control_div;
    }


    function handleBranchElementClick(evt) {
        if (evt.offsetX < 2) {
            const target = evt.target.parentNode;
            const ct = open_groups[target.vanim_pathkey];
            if (ct === true) {
                delete open_groups[target.vanim_pathkey];
            }
            else {
                open_groups[target.vanim_pathkey] = true;
            }
            refresh();
            evt.preventDefault();
        }
    }
    function handleBranchElementMouseDown(evt) {
        if (evt.offsetX < 2) {
            evt.preventDefault();
            evt.stopPropagation();
        }
    }

    function refresh() {
        const model = getModel();
        const len = model.length;

        // Clear index to dom,
        index_to_dom.length = 0;

        const lmap = {};

        function getLevelElement(path) {
            const path_key = toPathKey(path);
            let de = lmap[path_key];
            if (de === undefined) {
                de = document.createElement('ul');
                de.className = 'list-tree';
                de.vanim_pathkey = path_key;
                lmap[path_key] = de;
            }
            return de;
        }

        tree_view_left_options.innerHTML = '';
        tree_view_root.innerHTML = '';

        for (let i = 0; i < len; ++i) {
            const entry = model[i];
            const uid = entry.uid;
            const path = entry.path;

            const de = getLevelElement(path);

            let open_count = 0;
            let ck = '';
            for (let n = 0; n < path.length; ++n) {
                if (n > 0) {
                    ck += '.' + path[n];
                }
                else {
                    ck += path[n];
                }
                if (open_groups[ck] === true) {
                    ++open_count;
                }
            }
            const open_path = (open_count === path.length);

            if (open_path) {
                if (entry.type === 'leaf') {
                    const li = document.createElement('li');
                    if (selected_elements.indexOf(uid) >= 0) {
                        li.className = 'entry selected';
                    }
                    else {
                        li.className = 'entry';
                    }
                    const title_ele = createBranchTitleElement(entry.name, uid, 'node noselect');
                    li.appendChild(title_ele);
                    de.appendChild(li);
                }
                else if (entry.type === 'branch') {
                    // Append a child,
                    const branch_key = path.concat(entry.name);
                    const bde = getLevelElement(branch_key);

                    if (selected_elements.indexOf(uid) >= 0) {
                        bde.classList.add('selected');
                    }

                    const li = document.createElement('li');
                    li.appendChild(bde);
                    let classes = 'node noselect';
                    if (open_groups[bde.vanim_pathkey] === true) {
                        classes += ' list-open';
                    }
                    else {
                        classes += ' list-close';
                    }
                    const title_ele = createBranchTitleElement(entry.name, uid, classes);
                    title_ele.addEventListener('click', handleBranchElementClick, false);
                    title_ele.addEventListener('mousedown', handleBranchElementMouseDown, false);
                    bde.appendChild(title_ele);
                    de.appendChild(li);
                }
                else {
                    throw Error('Unknown entry type');
                }

                tree_view_left_options.appendChild(createControlElement(uid));

            }
        }

        const root = lmap[''];
        if (root) {
            tree_view_root.appendChild(root);
        }

    }

    refresh();

    return {

        domElement,
        setControlRefresh,
        openGroup,
        closeGroup,

        selectUIDs,
        deselectAll,
        refresh,

        addEventListener: event_handler.addEventListener,
        removeEventListener: event_handler.removeEventListener
    };

}

module.exports = TreePanel;
