"use strict";

const StreamZip = require('node-stream-zip');
const xmlStringParse = require('xml2js').parseString;
const PNG = require('pngjs').PNG;

const uuidv1 = require('uuid/v1');

const stream_utils = require('./StreamUtils.js');
const VersionableState = require('./VersionableState.js');
const MeshEditor = require('./MeshEditor.js');



const CONVERT_MULTIPLY_TEXTURES = false;


// Pulls image data out of a ZIP file,

function ZipImageReader(zip, errorHandler) {

    function getImage(filename, callback) {
        zip.stream(filename, (err, stream) => {
            if (err) {
                return callback(err);
            }
            const png_o = new PNG({
                filterType: 4
            });
            stream.pipe(png_o).on('parsed', () => {
                return callback(undefined, png_o);
            });
        });
    }

    return {
        getImage,
    };
}

function ORAImport() {

    function processPNGPixels(out, png_data) {

        // Trim the raw PNG data into the smallest square that contains pixels
        // with alpha > 0

        const width = png_data.width;
        const height = png_data.height;

        const raw_data = png_data.data;

        if (width * height * 4 !== raw_data.length) {
            throw Error("Invalid PNG data buffer size");
        }

        // Scan all the pixels, discover the min/max coords of the image,
        let min_x = width + 1;
        let max_x = -1;
        let min_y = height + 1;
        let max_y = -1;

        let x = 0;
        let y = 0;
        const len = raw_data.length;
        for (let n = 0; n < len; n += 4) {
            const alpha = raw_data.readUInt8(n + 3);
            if (alpha > 0) {
                if (x < min_x) {
                    min_x = x;
                }
                if (x >= max_x) {
                    max_x = x + 1;
                }
                if (y < min_y) {
                    min_y = y;
                }
                if (y >= max_y) {
                    max_y = y + 1;
                }
            }
            ++x;
            if (x >= width) {
                x = 0;
                ++y;
            }
        }

        // Turn into a power of 2 sized texture image.
        let pixels;
        let power = 0;

        let texture_type;

        if (min_x > max_x) {
            // Empty image!
            out.width = 0;
            out.height = 0;
            out.x = 0;
            out.y = 0;
            pixels = new Uint8Array(0);
        }
        else {
            max_x += 32;
            max_y += 32;
            min_x -= 32;
            min_y -= 32;

            const real_wid = max_x - min_x;
            const real_hei = max_y - min_y;

            const largest_dim = Math.max(real_wid, real_hei);
            power = 1;
            while (power < largest_dim) {
                power *= 2;
            }

            out.width = max_x - min_x;
            out.height = max_y - min_y;
            out.x = min_x;
            out.y = min_y;

            // If the blend type for this layer is multiply then the texture
            // type is RGB instead of RGBA,


            if (CONVERT_MULTIPLY_TEXTURES === true && out.blend === 'svg:multiply') {
                texture_type = 'RGB';

                pixels = new Uint8Array(power * power * 3);
                // Fill as white.
                pixels.fill(0x0FF);
                let n = 0;
                const next_row_offset = (power - real_wid) * 3;
                // Copy the pixels,
                for (let y = min_y; y < max_y; ++y) {
                    let sp = ((y * width) + min_x) * 4;
                    // Can we do this with some sort of scan line copy instead?
                    for (let x = min_x; x < max_x; ++x) {

                        if (sp < 0 || sp >= len) {

                            // Outside data range,
                            pixels[n + 0] = 0x0FF;
                            pixels[n + 1] = 0x0FF;
                            pixels[n + 2] = 0x0FF;

                        }
                        else {

                            const alpha_blend = raw_data.readUInt8(sp + 3);

                            let r = raw_data.readUInt8(sp + 0);
                            let g = raw_data.readUInt8(sp + 1);
                            let b = raw_data.readUInt8(sp + 2);

                            // For multiply we blend pixels to white,
                            r = ((255 - alpha_blend) + ((r * alpha_blend) / 255)) | 0;
                            g = ((255 - alpha_blend) + ((g * alpha_blend) / 255)) | 0;
                            b = ((255 - alpha_blend) + ((b * alpha_blend) / 255)) | 0;

                            pixels[n + 0] = r;
                            pixels[n + 1] = g;
                            pixels[n + 2] = b;

                        }

                        n += 3;
                        sp += 4;

                    }
                    n += next_row_offset;
                }

            }

            // If blend type is erase, we convert texture to alpha format,

            else if (out.blend === 'krita:erase') {
                texture_type = 'Alpha';

                pixels = new Uint8Array(power * power * 1);
                // Fill with black,
                pixels.fill(0x0);
                let n = 0;
                const next_row_offset = (power - real_wid) * 1;
                // Copy the pixels,
                for (let y = min_y; y < max_y; ++y) {
                    let sp = ((y * width) + min_x) * 4;
                    // Can we do this with some sort of scan line copy instead?
                    for (let x = min_x; x < max_x; ++x) {

                        if (sp < 0 || sp >= len) {

                            // Outside data range,
                            pixels[n + 0] = 0;

                        }
                        else {

                            const alpha_blend = raw_data.readUInt8(sp + 3);
                            pixels[n + 0] = alpha_blend;

                        }

                        n += 1;
                        sp += 4;

                    }
                    n += next_row_offset;
                }

            }

            else {
                texture_type = 'RGBA';

                pixels = new Uint8Array(power * power * 4);
                pixels.fill(0x0);
                let n = 0;
                const next_row_offset = (power - real_wid) * 4;
                // Copy the pixels,
                for (let y = min_y; y < max_y; ++y) {
                    let sp = ((y * width) + min_x) * 4;
                    // Can we do this with some sort of scan line copy instead?
                    for (let x = min_x; x < max_x; ++x) {

                        if (sp < 0 || sp >= len) {

                            // Outside data range,
                            pixels[n + 0] = 0x0;
                            pixels[n + 1] = 0x0;
                            pixels[n + 2] = 0x0;
                            pixels[n + 3] = 0x0;

                        }
                        else {

                            pixels[n + 0] = raw_data.readUInt8(sp + 0);
                            pixels[n + 1] = raw_data.readUInt8(sp + 1);
                            pixels[n + 2] = raw_data.readUInt8(sp + 2);
                            pixels[n + 3] = raw_data.readUInt8(sp + 3);

                        }

                        n += 4;
                        sp += 4;

                    }
                    n += next_row_offset;
                }

            }

        }

        // Record the raw pixel and sizing information in the vmod_object,
        out.$raw_texture_pixels = { type:'Uint8Array', data: pixels };
        out.raw_texture_type = texture_type;
        out.extra_details = {
            version: 1,
            raw_texture_power: power
        };

    }


    function importStackTree(image_reader, serialized_state, stack, path, callback) {

        const texture_layers = serialized_state.getArray('texture_layers');

        const img_width = serialized_state.get('img_width');
        const img_height = serialized_state.get('img_height');

        const children = stack.$$;
        // Children are either stack or layer,
        const len = children.length;
        let i = -1;
        function next(err) {
            if (err) {
                return callback(err);
            }
            ++i;
            if (i >= len) {
                return callback();
            }
            const child = children[i];
            const child_name = child['#name'];

            const child_blend = child.$['composite-op'];
            const child_lname = child.$['name'];
            const child_opacity = child.$['opacity'];
            const child_visibility = child.$['visibility'];

            const uid = uuidv1();

            const lob = {
                uid: uid,
                name: child_lname,
                blend: child_blend,
                opacity: parseFloat(child_opacity),
                visible: child_visibility === 'visible',
                x: 0,
                y: 0,
            };

            if (child_name === 'stack') {
                const np = path.concat( [ uid ] );
                lob.type = 'group';
                lob.path = path;

                texture_layers.push(lob.uid, lob);

                importStackTree(image_reader, serialized_state, child, np, next);
            }
            else if (child_name === 'layer') {
                const child_src = child.$['src'];
                image_reader.getImage(child_src, (err, pixel_data) => {
                    if (err) {
                        return callback(err);
                    }

                    lob.type = 'layer';
                    lob.path = path;

                    // Trim the image,
                    try {
                        processPNGPixels(lob, pixel_data);
                        lob.x = lob.x - (img_width / 2);
                        lob.y = -lob.y + (img_height / 2);
                    }
                    catch (e) {
                        return callback(e);
                    }

                    texture_layers.push(lob.uid, lob);

                    // Go to next,
                    return next();
                });
            }
            else {
                return callback(Error('Unknown child type: ' + child_name));
            }
        }
        next(undefined);
    }




    function postProcessState(ss) {
        console.log("POST PROCESS!");

//        const img_width = ss.get('img_width');
//        const img_height = ss.get('img_height');

        const mesh_editor = MeshEditor();
        const texture_layers = ss.getArray('texture_layers');

        texture_layers.forEach((layer) => {

            const layer_uid = layer.get('uid');
            const layer_type = layer.get('type');
            const top_left_x = layer.get('x'); // - (img_width / 2);
            const top_left_y = layer.get('y'); // + (img_height / 2);
            const layer_width = layer.get('width');
            const layer_height = layer.get('height');

            const vertex_density = 48;
            const half_vert_density = (vertex_density / 2) | 0;
            const edge_out = vertex_density + half_vert_density;

            // Create a default mesh for the texture,
            if (layer_type === 'layer') {
                mesh_editor.loadFrom(ss, layer_uid);

                const topy = top_left_y + edge_out;
                const bottomy = top_left_y - layer_height - edge_out;
                const leftx = top_left_x - edge_out;
                const rightx = top_left_x + layer_width + edge_out;

                const verts = [];

                let alt = 0;
                const wid_count = ((rightx - leftx) / vertex_density) | 0;
                for (let y = topy; y > bottomy; y -= vertex_density) {
                    const half_ex = ((alt % 2) === 0) ? half_vert_density : 0;
                    for (let x = leftx + half_ex; x < rightx + half_ex; x += vertex_density) {
                        verts.push( { x, y } );
                        mesh_editor.addVertex(x, y);
                    }
                    ++alt;
                }

                // Connect the edges,
                let tx = 0;
                alt = 0;
                for (let i = 0; i < verts.length; ++i) {
                    if (tx < wid_count) {
                        mesh_editor.addEdge(i, i + 1);
                    }
                    if ((i + wid_count) + 1 < verts.length) {
                        mesh_editor.addEdge(i, (i + wid_count) + 1);
                    }
                    if (alt === 0) {
                        if (tx < wid_count) {
                            if ((i + wid_count) + 2 < verts.length) {
                                mesh_editor.addEdge(i, (i + wid_count) + 2);
                            }
                        }
                    }
                    if (alt !== 0) {
                        if (tx > 0) {
                            if ((i + wid_count) < verts.length) {
                                mesh_editor.addEdge(i, (i + wid_count));
                            }
                        }
                    }
                    if (tx === wid_count) {
                        alt = (alt + 1) % 2;
                    }

                    tx = (tx + 1) % (wid_count + 1);
                }

                mesh_editor.saveTo(ss, layer_uid);
            }
        });
    }






    function convertOraToVmod(image_reader, xj, callback) {
        // Process the xj object,
        const image_attr = xj.image.$;
        const ver = image_attr.version;
        const img_width = image_attr.w;
        const img_height = image_attr.h;
        const img_xres = image_attr.xres;
        const img_yres = image_attr.yres;

        const serialized_state = VersionableState();
        serialized_state.set('img_width', img_width);
        serialized_state.set('img_height', img_height);
        serialized_state.set('img_xres', img_xres);
        serialized_state.set('img_yres', img_yres);

        // Create some initial empty objects.
        serialized_state.defineArray('texture_layers');
        serialized_state.defineArray('meshes');
        serialized_state.defineArray('deformers');

        // The root stack,
        const root_stack = xj.image.stack[0];

        importStackTree(image_reader, serialized_state,
                            root_stack, [ 'Art' ], (err) => {
            if (err) {
                return callback(err);
            }

//            postProcessState(serialized_state, mesh_editor);
            return callback(undefined, serialized_state);
        });

    }


    function processOraFormat(zip, errorHandler, successHandler) {
        zip.stream('mimetype', stream_utils.processStreamOutputString(
                                    errorHandler, (mime_content) => {
            // PENDING: Version details?
            // console.log("MIME:");
            // console.log(mime_content);
            zip.stream('stack.xml', stream_utils.processStreamOutputString(
                                        errorHandler, (xml_content) => {
                const xml_options = {
                    explicitChildren:true,
                    preserveChildrenOrder:true
                };
                xmlStringParse(xml_content, xml_options, (err, xj) => {
                    if (err) {
                        return errorHandler(err);
                    }
                    const image_reader = ZipImageReader(zip, errorHandler);
                    convertOraToVmod(image_reader, xj, (err, serialized_state) => {
                        if (err) {
                            return errorHandler(err);
                        }
                        return successHandler(serialized_state);
                    });
                });
            }));
        }));
    }


    function importFile(filename, callback) {
        function handleError(err) {
            return callback(err);
        }

        // .ora file is a zip file,
        const zip = new StreamZip({
            file: filename,
            storeEntries: true
        });
        zip.on('error', handleError);
        zip.on('ready', () => {
            processOraFormat(zip, handleError, (vmod_object) => {
                callback(undefined, vmod_object);
            });
        });
        zip.on('entry', (entry) => {
            console.log("> %s", entry.name);
        });
    }



    return {
        importFile
    };


}

module.exports = ORAImport;
