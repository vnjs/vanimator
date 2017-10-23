"use strict";

// Manipulates the editor DOM to show modal forms in the UI.

function ModalDialog(window, document) {

    const modal_overlay = document.getElementById('modal_overlay');

    let current_form;



    function addTextInput(modal_overlay, form_ob, inner) {

        if (form_ob.title !== undefined) {
            const title = document.createElement('div');
            title.className = 'dialog-title';
            title.textContent = form_ob.title;
            inner.appendChild(title);
        }

        const initial_value = form_ob.initial_value;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'simple_text_input_id';
        input.className = 'simple-text-input';
        input.value = initial_value === undefined ? '' : initial_value;

        inner.appendChild(input);

        // HACK: Couldn't find a way to get focus on this easily...
        setTimeout(() => {
            input.focus();
        }, 0);

        return input;

    }


    function simpleTextLayout(form_ob) {
        return function layout(modal_overlay) {

            const inner = document.createElement('div');
            inner.className = 'modal_content';

            const input = addTextInput(modal_overlay, form_ob, inner);

            input.addEventListener('keypress', (evt) => {
                // If ENTER pressed,
                if (evt.keyCode === 13) {
                    evt.preventDefault();
                    form_ob.fields = {
                        value: input.value
                    };
                    accept();
                }
            });

            modal_overlay.appendChild(inner);

        };
    }


    function newActionLayout(form_ob) {
        return function layout(modal_overlay) {

            const inner = document.createElement('div');
            inner.className = 'modal_content';

            const input = addTextInput(modal_overlay, form_ob, inner);

            function opt(type, title) {
                return { type, title };
            }

            const select_el = document.createElement('select');
            const options = [
                opt('1d -1 1', 'Min: -1 Max: 1'),
                opt('1d 0 1',  'Min: 0 Max: 1')
            ];
            options.forEach((option) => {
                const opt_el = document.createElement('option');
                opt_el.value = option.type;
                opt_el.textContent = option.title;
                select_el.appendChild(opt_el);
            });

            const t2 = document.createElement('div');
            t2.className = 'dialog-title';
            t2.textContent = 'Action Range:';

            inner.appendChild(t2);
            inner.appendChild(select_el);

            function submitCmd(evt) {
                // If ENTER pressed,
                if (evt.keyCode === 13) {
                    evt.preventDefault();
                    form_ob.fields = {
                        value: input.value,
                        type: select_el.value
                    };
                    accept();
                }
            }

            input.addEventListener('keypress', submitCmd);
            select_el.addEventListener('keypress', submitCmd);

            modal_overlay.appendChild(inner);

        };
    }






    function setForm(form_ob) {

        current_form = form_ob;

        // Is it a simple text dialog?
        if (form_ob.type === 'simple_text') {
            if (current_form.cancel === undefined) {
                current_form.cancel = function cancel() {};
            }
            current_form.layout = simpleTextLayout(current_form);
        }
        else if (form_ob.type === 'new_action_form') {
            if (current_form.cancel === undefined) {
                current_form.cancel = function cancel() {};
            }
            current_form.layout = newActionLayout(current_form);
        }

        // Layout the dialog,
        current_form.layout(modal_overlay);

    }

    function show() {
        modal_overlay.style.display = "block";
    }

    function hide() {
        modal_overlay.style.display = "none";
        modal_overlay.innerHTML = '';
    }

    function accept() {
        hide();
        const cform = current_form;
        current_form = undefined;
        // Callback on the form,
        if (cform.accept !== undefined) {
            cform.accept(cform);
        }
    }

    function cancel() {
        hide();
        const cform = current_form;
        current_form = undefined;
        // Callback on the form,
        if (cform.close !== undefined) {
            cform.close();
        }
    }

    window.addEventListener('click', (evt) => {
        if (evt.target === modal_overlay) {
            cancel();
        }
    }, false);
    document.addEventListener('keydown', (evt) => {
        if (current_form === undefined) {
            return;
        }
        // If ESCAPE key pressed,
        if (evt.keyCode === 27) {
            cancel();
        }
    }, false);


    return {
        setForm,
        show,
        accept,
        cancel,
    };

}

module.exports = ModalDialog;
