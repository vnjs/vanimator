"use strict";

const MouseEventHandler = require('./MouseEventHandler.js');

/* global document */




function Controller1D(uid, name) {

    const domElement = document.createElement('div');
    domElement.className = 'noselect actions-list-controller-1d';

    const center_line_el = document.createElement('div');
    center_line_el.className = 'noselect controller-center-line';
    domElement.appendChild(center_line_el);

    const ctrl_button_tray_el = document.createElement('div');
    ctrl_button_tray_el.className = 'noselect controller-button-tray';
    domElement.appendChild(ctrl_button_tray_el);

    const ctrl_button_el = document.createElement('div');
    ctrl_button_el.className = 'noselect controller-button';
    ctrl_button_tray_el.appendChild(ctrl_button_el);



    function calcPercent(evt) {
        const offx = evt.x;
        const rect = domElement.getBoundingClientRect();

        // Remove margins from width,
        const act_width = rect.width - 20;
        let percent_pos = ((offx - 10) / act_width) * 100;

        if (percent_pos < 0) {
            percent_pos = 0;
        }
        if (percent_pos > 100) {
            percent_pos = 100;
        }

        ctrl_button_el.style.left = percent_pos + '%';

    }



    const doc_mouse_handler = MouseEventHandler();
    doc_mouse_handler.captureMouseEvents(domElement, (evt) => {
        if (evt.type === 'mousedown') {
            domElement.focus();
        }
        else {
            calcPercent(evt);
//            console.log("CAPTURED! ", evt);
        }
    });





    domElement.tabIndex = 0;


    // domElement.addEventListener('mousedown', (evt) => {
    //     domElement.focus();
    //     evt.preventDefault();
    // }, false);
    // domElement.addEventListener('mouseup', (evt) => {
    //     evt.preventDefault();
    // }, false);
    // domElement.addEventListener('mousemove', (evt) => {
    //     calcPercent(evt);
    //     evt.preventDefault();
    // }, false);




    return {
        domElement
    };

}






function ActionsListPanel(editor) {

    const domElement = document.createElement('div');
    domElement.className = 'actions-list-panel';


    const control_elements = [];



    // Set up the panel,
    refresh();


    function refresh() {

        control_elements.length = 0;

        // Clear the dom element,
        domElement.innerHTML = '';

        const menu_ui = document.createElement('div');
        menu_ui.className = 'actions-list-menu';

        // Append the top menu ui,
        domElement.appendChild(menu_ui);

        const ss = editor.getSerializedState();
        const actions = ss.getArray('actions');
        if (actions.isDefined()) {
            // Append all the actions,
            actions.forEach((action) => {
                const uid = action.get('uid');
                const name = action.get('name');
                const type = action.get('type');

                console.log("ACTIONS: %s", name);

                const action_el = document.createElement('div');

                if (type.startsWith('1d ')) {
                    action_el.className = 'actions-list-item-1d';
                }
                else if (type.startsWith('2d ')) {
                    action_el.className = 'actions-list-item-2d';
                }

                const name_el = document.createElement('div');
                name_el.className = 'noselect actions-list-item-name';
                name_el.textContent = name;

                const c1d = Controller1D(uid, name);

                control_elements.push({
                    uid, name, c_el: c1d
                });

                action_el.appendChild(name_el);
                action_el.appendChild(c1d.domElement);

                domElement.appendChild(action_el);

            });
        }


        console.log("REFRESH: ", control_elements);

    }



    return {
        domElement,
        refresh
    };

}

module.exports = ActionsListPanel;
