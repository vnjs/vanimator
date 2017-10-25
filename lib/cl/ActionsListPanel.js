"use strict";

/* global document */

const MouseEventHandler = require('./MouseEventHandler.js');
const EventHandler = require('./EventHandler.js');




function Controller1D(event_handler, uid, name, type) {

    let current_v = 0;


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



    function setCurrentV(v) {
        current_v = v;
    }

    function setValue(v) {
        setCurrentV(v);
        let zeroonerange;
        if (type === '1d -1 1') {
            zeroonerange = (v + 1) / 2;
        }
        else if (type === '1d 0 1') {
            zeroonerange = v / 1;
        }
        else {
            zeroonerange = v / 1;
        }
        const percent_pos = zeroonerange * 100;
        ctrl_button_el.style.left = percent_pos + '%';
    }

    function getValue() {
        return current_v;
    }

    function calcPercent(evt) {
        const offx = evt.x;
        const rect = domElement.getBoundingClientRect();

        // Remove margins from width,
        const act_width = rect.width - 20;
        let zeroonerange = (offx - 10) / act_width;

        if (zeroonerange < 0) {
            zeroonerange = 0;
        }
        else if (zeroonerange > 1) {
            zeroonerange = 1;
        }

        if (type === '1d -1 1') {
            setCurrentV((zeroonerange * 2) - 1);
        }
        else if (type === '1d 0 1') {
            setCurrentV(zeroonerange);
        }
        else {
            setCurrentV(zeroonerange);
        }

        const percent_pos = zeroonerange * 100;
        ctrl_button_el.style.left = percent_pos + '%';

    }

    setValue(0);

    const doc_mouse_handler = MouseEventHandler();
    doc_mouse_handler.captureMouseEvents(domElement, (evt) => {
        if (evt.type === 'mousedown') {
            domElement.focus();
        }
        calcPercent(evt);

        if (evt.type === 'mousemove') {
            // Fire control change event,
            const event = {
                type: 'controlmove',
                uid: uid,
                name: name,
                value: current_v
            };
            event_handler.dispatchEvent(event);
        }
        else if (evt.type === 'mouseup') {
            // Fire control change event,
            const event = {
                type: 'controlchange',
                uid: uid,
                name: name,
                value: current_v
            };
            event_handler.dispatchEvent(event);
        }

    });

    domElement.tabIndex = 0;

    return {
        domElement,
        setValue,
        getValue
    };

}






function ActionsListPanel(editor) {

    const event_handler = EventHandler();


    const domElement = document.createElement('div');
    domElement.className = 'actions-list-panel';


    const control_elements = [];
    let cur_selected_uid;


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

                let value = action.get('value');
                if (value === undefined) {
                    value = 0;
                }

                const action_el = document.createElement('div');

                if (type.startsWith('1d ')) {
                    action_el.className = 'actions-list-item-1d';
                }
                else if (type.startsWith('2d ')) {
                    action_el.className = 'actions-list-item-2d';
                }

                if ( cur_selected_uid !== undefined &&
                     cur_selected_uid === uid ) {
                    action_el.classList.add('actions-list-selected');
                }

                action_el.vanim_action_uid = uid;

                action_el.addEventListener( 'mousedown',
                            handleItemSelect(action_el, uid, name), false );

                const name_el = document.createElement('div');
                name_el.className = 'noselect actions-list-item-name';
                name_el.textContent = name;

                // Create the controller and set the value of it from the
                // actions.
                const c1d = Controller1D(event_handler, uid, name, type);
                c1d.setValue(value);

                control_elements.push({
                    uid, name,
                    c_el: c1d,
                    action_el
                });

                action_el.appendChild(name_el);
                action_el.appendChild(c1d.domElement);

                domElement.appendChild(action_el);

            });
        }

    }

    function getActionElement(uid) {
        for (let i = 0; i < control_elements.length; ++i) {
            const cel = control_elements[i];
            if (cel.uid === uid) {
                return cel;
            }
        }
    }

    function handleItemSelect(element, uid, name) {
        return (evt) => {
            if (cur_selected_uid !== undefined) {
                const cel = getActionElement(cur_selected_uid);
                const action_el = cel.action_el;
                action_el.classList.remove('actions-list-selected');
                const event = {
                    type: 'controlunselect',
                    uid: cur_selected_uid,
                    name: cel.name,
                };
                event_handler.dispatchEvent(event);
            }
            element.classList.add('actions-list-selected');
            const event = {
                type: 'controlselect',
                uid: uid,
                name: name,
            };
            event_handler.dispatchEvent(event);
            cur_selected_uid = uid;
        };
    }



    return {

        domElement,
        refresh,

        addEventListener: event_handler.addEventListener,
        removeEventListener: event_handler.removeEventListener

    };

}

module.exports = ActionsListPanel;
