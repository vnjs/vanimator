"use strict";

// Fetch polyfill,
require('whatwg-fetch');
/* global fetch */

const JSZip = require('jszip');

const VersionableState = require('../cl/VersionableState.js');



function isBinaryKey(key) {
    const pdelim = key.lastIndexOf('.');
    return ( (pdelim === -1 && key.startsWith('$')) ||
             (pdelim >= 0 && key.charAt(pdelim + 1) === '$') );
}

function deserializeContent(zip, vmod_json, callback) {

    const bin_to_revive = [];

    function reviver(key, value) {
        if (isBinaryKey(key)) {
            const val_data = value.data;
            const rd = {
                type: value.type,
                size: value.size,
            };
            const i = parseInt(val_data.substring(3), 10);
            bin_to_revive[i] = rd;
            return rd;
        }
        return value;
    }
    const serialized_data = JSON.parse(vmod_json, reviver);

    // Load the binary data,
    let i = -1;
    function next() {
        ++i;
        if (i >= bin_to_revive.length) {
            return callback(undefined, VersionableState(serialized_data));
        }

        const fname = 'bin' + i;

        const rd = bin_to_revive[i];
        const array_type = rd.type;
        const array_size = rd.size;

        if (array_type === 'Uint8Array') {

            zip.file(fname).async('uint8array').then((data) => {

                rd.data = data;

                // Go to next binary data object,
                next();

            }).catch(callback);

        }
        else {
            return callback(Error('Unknown array type: ' + array_type));
        }

    }
    next();

}


// Loads from JSZip API,

function loadJSZip(zip, callback) {

    function handleError(err) {
        callback(err);
    }

    zip.file('version.txt').async('string').then((version_content) => {
        // Check version,
        if (version_content === 'VMOD-1.0') {

            zip.file('vmod.json').async('string').then((vmod_json) => {

                deserializeContent(zip, vmod_json, callback);

            }).catch(handleError);

        }
        else {
            handleError(Error(
                    'Unable to handle .vmod version: ' + version_content));
        }
    }).catch(handleError);

}


// Loads VMOD using fetch API,

function load(url, callback) {

    function handleError(err) {
        callback(err);
    }

    const opts = {
        method: 'GET',

    };
    fetch(url, opts).then((response) => {
        if (response.ok) {

            response.arrayBuffer().then((arrayBuffer) => {

                JSZip.loadAsync(arrayBuffer).then((zip) => {

                    loadJSZip(zip, callback);

                }).catch(handleError);

            }).catch(handleError);

        }
        else {
            callback(Error('Response indicates error'));
        }
    }).catch(handleError);

}


module.exports = {
    load
};
