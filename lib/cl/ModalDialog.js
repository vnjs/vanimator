"use strict";

// Manipulates the editor DOM to show modal forms in the UI.

function ModalDialog(window, document) {

    const modal_overlay = document.getElementById('modal_overlay');

    let current_form;


    function simpleTextLayout(form_ob) {
        return function layout(modal_overlay) {

            const inner = document.createElement('div');
            inner.className = 'modal_content';

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


            inner.appendChild(input);

            modal_overlay.appendChild(inner);

            // HACK: Couldn't find a way to get focus on this easily...
            setTimeout(() => {
                input.focus();
            }, 0);

        };
    }





    function setForm(form_ob) {

        // Is it a simple text dialog?
        if (form_ob.type === 'simple_text') {
            current_form = form_ob;
            if (current_form.cancel === undefined) {
                current_form.cancel = function cancel() {};
            }
            current_form.layout = simpleTextLayout(current_form);
        }
        else {
            current_form = form_ob;
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
