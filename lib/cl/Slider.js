"use strict";

/* globals document */

function Slider(min_range_value, max_range_value, initial_range_value) {

    const domElement = document.createElement('div');
    const range_element = document.createElement('div');
    const input_element = document.createElement('div');

    range_element.className = 'noselect slider-range';
    input_element.className = 'noselect slider-input';

    const rinput = document.createElement('input');
    const ninput = document.createElement('input');

    rinput.min = min_range_value;
    rinput.max = max_range_value;
    rinput.value = initial_range_value;
    rinput.type = 'range';
    ninput.min = min_range_value;
    ninput.max = max_range_value;
    ninput.value = initial_range_value;
    ninput.type = 'number';

    range_element.appendChild(rinput);
    input_element.appendChild(ninput);

    domElement.appendChild(range_element);
    domElement.appendChild(input_element);

    enable();

    rinput.addEventListener('input', () => {
        ninput.value = rinput.value;
    }, false);
    ninput.addEventListener('input', () => {
        rinput.value = ninput.value;
    }, false);


    function disable() {
        rinput.disabled = true;
        ninput.disabled = true;
        ninput.value = '-';
    }
    function enable() {
        rinput.disabled = false;
        ninput.disabled = false;
    }

    function setValue(val) {
        rinput.value = val;
        ninput.value = val;
    }

    function getValue() {
        const val = rinput.value;
        if (typeof val === 'string') {
            return parseFloat(val);
        }
        return val;
    }

    function addEventListener(type, event_handler, b) {
        rinput.addEventListener(type, event_handler, b);
        ninput.addEventListener(type, event_handler, b);
    }

    return {
        domElement,
        disable,
        enable,
        setValue,
        getValue,
        addEventListener,
    };

}

module.exports = Slider;
