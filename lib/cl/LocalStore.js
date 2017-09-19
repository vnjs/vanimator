"use strict";

/* globals localStorage */

function LocalStore() {

    function load(key, default_val) {
        const item = localStorage.getItem('uo.' + key);
        if (item) {
            return JSON.parse(item);
        }
        return default_val;
    }

    function save(key, ob) {
        localStorage.setItem('uo.' + key, JSON.stringify(ob));
    }

    return {
        load,
        save,
    };
}

module.exports = LocalStore;
