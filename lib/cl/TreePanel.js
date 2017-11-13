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


    let mouse_down_uid;



    function uidOfEventTarget(evt) {
        const target = evt.target;
        if (target) {
            let uid = target.vanim_layer_uid;
            if (uid === undefined) {
                uid = target.parentNode.vanim_layer_uid;
            }
            return uid;
        }
        return undefined;
    }


    tree_view_root.addEventListener('mouseup', (evt) => {
//        console.log("MOUSE UP!");
        if (mouse_down_uid !== undefined) {
            if (mouse_down_uid === uidOfEventTarget(evt)) {
                // Select this,
                deselectAll();
                selectUIDs(mouse_down_uid);
                // Dispatch select,
                const evt = {
                    type: 'select',
                    selected_elements
                };
                event_handler.dispatchEvent(evt);
            }
        }
        evt.preventDefault();
        return false;
    }, false);

    tree_view_root.addEventListener('mousedown', (evt) => {
//        console.log("MOUSE DOWN!");
        mouse_down_uid = uidOfEventTarget(evt);
        return false;
    }, false);

    tree_view_root.addEventListener('drop', (evt) => {
//        console.log("DROP!");
        const vstr = evt.dataTransfer.getData('ventry');
        if (vstr !== undefined) {
            const ventry = JSON.parse(vstr);

            const target_uid = uidOfEventTarget(evt);
            if (target_uid !== undefined) {

                // Make a drop event,
                const event = {
                    type: 'drop',
                    drop_data: ventry,
                    drop_target_uid: target_uid
                };

                event_handler.dispatchEvent(event);

            }

            evt.preventDefault();
            return false;
        }
    });

    // Handle drag over on the tree view,
    tree_view_root.addEventListener('dragover', (evt) => {
        evt.preventDefault();
        return false;
    });



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

    function isGroupOpen(group_key) {
        return open_groups[group_key] === true;
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
            if (isGroupOpen(target.vanim_pathkey)) {
                closeGroup(target.vanim_pathkey);
            }
            else {
                openGroup(target.vanim_pathkey);
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

        const lmap = Object.create(null);

        function getLevelElement(path) {
            const path_key = toPathKey(path);
            let de = lmap[path_key];
            if (de === undefined) {
                de = document.createElement('ul');
                de.className = 'list-tree noselect';
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
                if (isGroupOpen(ck)) {
                    ++open_count;
                }
            }
            const open_path = (open_count === path.length);

            if (open_path) {
                if (entry.type === 'leaf') {
                    const li = document.createElement('li');
                    if (selected_elements.indexOf(uid) >= 0) {
                        li.className = 'entry selected noselect';
                    }
                    else {
                        li.className = 'entry noselect';
                    }
                    const title_ele = createBranchTitleElement(entry.name, uid, 'node noselect');
                    if (entry.draggable === true) {
                        title_ele.draggable = "true";
                        title_ele.addEventListener("dragstart", (evt) => {
                            evt.dataTransfer.setData("ventry", JSON.stringify(entry));
                        });
                    }
                    li.appendChild(title_ele);
                    de.appendChild(li);
                }
                else if (entry.type === 'branch') {
                    // Append a child,
                    const branch_key = path.concat(uid);
                    const bde = getLevelElement(branch_key);

                    if (selected_elements.indexOf(uid) >= 0) {
                        bde.classList.add('selected');
                    }

                    const li = document.createElement('li');
                    li.appendChild(bde);
                    let classes = 'node noselect';
                    if (isGroupOpen(bde.vanim_pathkey)) {
                        classes += ' list-open';
                    }
                    else {
                        classes += ' list-close';
                    }
                    const title_ele = createBranchTitleElement(entry.name, uid, classes);
                    if (entry.draggable === true) {
                        title_ele.draggable = "true";
                        title_ele.addEventListener("dragstart", (evt) => {
                            evt.dataTransfer.setData("ventry", JSON.stringify(entry));
                        });
                    }
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
