"use strict";

const fs = require("fs");
const packer = require('zip-stream');
const StreamZip = require('node-stream-zip');

const stream_utils = require('./StreamUtils.js');
const VersionableState = require('./VersionableState.js');

// Persistence functions for the .vmod file format.
// VMOD file format is a .zip file with specific file content.

function VMODFormat() {

    function isBinaryKey(key) {
        const pdelim = key.lastIndexOf('.');
        return ( (pdelim === -1 && key.startsWith('$')) ||
                 (pdelim >= 0 && key.charAt(pdelim + 1) === '$') );
    }


    // Convert the serialized state to version 1,
    function convertToVersion1(ss) {
        const layers = ss.getArray('texture_layers');
        layers.forEach((layer_ob) => {
            const extra_details = layer_ob.get('extra_details');
            if (extra_details === undefined) {
                console.log("CONVERTING TO VERSION 1");
                const ed = {
                    version: 1,
                };
                const raw_texture_power = layer_ob.get('raw_texture_power');
                if (raw_texture_power !== undefined) {
                    ed.raw_texture_power = raw_texture_power;
                }
                const mesh_uid_for_layer = layer_ob.get('mesh_uid_for_layer');
                if (mesh_uid_for_layer !== undefined) {
                    ed.mesh_uid_for_layer = mesh_uid_for_layer;
                }
                layer_ob.set('extra_details', ed);
                layer_ob.remove('raw_texture_power');
                layer_ob.remove('mesh_uid_for_layer');
            }
        });

        // Convert morph targets from array to map,
        const morph_targets = ss.getArray('morph_targets');
        morph_targets.forEach((morph_target_ob) => {
            const target_verts = morph_target_ob.get('target_verts');
            // Convert it if it's an array,
            if (Array.isArray(target_verts) === true) {
                const target_verts_map = Object.create(null);
                target_verts.forEach((vert) => {
                    target_verts_map[vert.uid] = {
                        dx: vert.dx,
                        dy: vert.dy
                    };
                });
                morph_target_ob.set('target_verts', target_verts_map);
            }
        });

        // // Fix mesh_uid_for_layer,
        // const meshes = ss.getArray('meshes');
        // meshes.forEach((mesh_ob, i, mesh_uid) => {
        //     const layers_set = mesh_ob.get('layers_set');
        //     layers_set.forEach((layer_uid) => {
        //         const layer_ob = layers.get(layer_uid);
        //         layer_ob.setInObject(
        //                     'extra_details', 'mesh_uid_for_layer', mesh_uid);
        //     });
        // });

    }


    function deserializeContent(zip, vmod_json, callback) {

        const bin_to_revive = [];

        function reviver(key, value) {
            if (isBinaryKey(key)) {
                console.log("KEY: ", key);
                console.log("VALUE: ", value);
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
            zip.stream(fname, (err, stream) => {
                if (err) {
                    return callback(err);
                }

                const rd = bin_to_revive[i];

                let error_handled = false;

                stream.on("end", () => {
                    if (!error_handled) {
                        delete rd.size;
                        return next();
                    }
                });
                stream.on("error", (err) => {
                    if (!error_handled) {
                        error_handled = true;
                        return callback(err);
                    }
                });

                // Allocate the array,
                const array_type = rd.type;
                const array_size = rd.size;
                if (array_type === 'Uint8Array') {
                    let p = 0;
                    const data = new Uint8Array(array_size);
                    rd.data = data;
                    stream.on("data", (chunk) => {
                        // Chunk will be a buffer,
                        // Copy chunk content into the array,
                        for (let n = 0; n < chunk.length; ++n) {
                            data[p] = chunk.readUInt8(n);
                            ++p;
                        }
                    });
                }
                else if (!error_handled) {
                    error_handled = true;
                    return callback(Error('Unknown array type: ' + array_type));
                }

            });

        }
        next();

    }


    function processVMODFormat(zip, errorHandler, successHandler) {

        zip.stream('version.txt', stream_utils.processStreamOutputString(
                                    errorHandler, (version_content) => {
            // Check version,
            if (version_content === 'VMOD-1.0') {
                // The JSON data,
                zip.stream('vmod.json', stream_utils.processStreamOutputString(
                                            errorHandler, (vmod_json) => {
                    deserializeContent(zip, vmod_json, (err, serialized_data) => {
                        convertToVersion1(serialized_data);
                        if (err) {
                            return errorHandler(err);
                        }
                        else {
                            return successHandler(serialized_data);
                        }
                    });
                }));
            }
            else {
                errorHandler(Error(
                        'Unable to handle .vmod version: ' + version_content));
            }
        }));
    }


    function load(file_location, callback) {

        function handleError(err) {
            return callback(err);
        }

        const zip = new StreamZip({
            file: file_location,
            storeEntries: true
        });
        zip.on('error', handleError);
        zip.on('ready', () => {
            processVMODFormat(zip, handleError, (serialized_object) => {
                callback(undefined, serialized_object);
            });
        });
    }


    function serializeBinaryData(archive, bin_arr, callback) {
        let i = -1;
        function next() {
            ++i;
            if (i >= bin_arr.length) {
                // Finished,
                return callback();
            }
            const binary_data = bin_arr[i];
            const buf = new Buffer(binary_data);
            archive.entry( buf, { name: 'bin' + i }, (err, entry) => {
                if (err) {
                    return callback(err);
                }
                // Go to next,
                return next();
            } );
        }
        next();
    }

    // Saves the vmod file, overwritting any file that already exists at the
    // location. (Please confirm before overwriting the file before this call
    // is made)

    function save(serialized_object, file_location, callback) {
        const archive = new packer();

        const dest_file_stream = fs.createWriteStream(file_location);

        archive.on('error', (err) => {
            return callback(err);
        });

        archive.pipe(dest_file_stream);

        let id = 0;
        const bin_arr = [];

        function replacer(key, value) {
            if (isBinaryKey(key)) {
                const val_type = value.type;
                const val_data = value.data;
                if (val_type === 'Uint8Array') {
                    bin_arr[id] = val_data;
                    const nval = {
                        type: val_type,
                        size: val_data.length,
                        data: 'bin' + id
                    };
                    ++id;
                    return nval;
                }
            }
            return value;
        }

        archive.entry('VMOD-1.0', { name: 'version.txt' }, (err, entry) => {
            if (err) {
                return callback(err);
            }

            // Write the VMOD data as a JSON,
//            const format_string = JSON.stringify(serialized_object, replacer, 2);
            const format_string = serialized_object.toJSON(replacer, 2);

            archive.entry(format_string, { name: 'vmod.json' }, (err, entry) => {
                if (err) {
                    return callback(err);
                }

                // Serialize the binary data,
                serializeBinaryData(archive, bin_arr, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    console.log("FINISH AND CALLBACK");
                    archive.finish();
                    return callback();
                });

            });

        });

    }


    return {
        load,
        save
    };

}

module.exports = VMODFormat;
