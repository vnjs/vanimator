"use strict";

const { remote, shell } = require('electron');
const { Menu, dialog } = remote;

const ORAImport = require('./ORAImport.js');
const VMODFormat = require('./VMODFormat.js');



function CLElectron(ui_main) {

    const ora_importer = ORAImport();

    function doImport(filename, callback) {
        // Lock the UI while we process the imported file,
        ui_main.lockUIForLoad();
//        console.log("IMPORT: ", filename);
        // Assume the file is an .ora
        ora_importer.importFile(filename, (err, vmod_object) => {
            // Unlock the UI,
            ui_main.unlockUIForLoad();
            return callback(err, vmod_object);
        });
    }



    function importLocalFile(filename) {
        doImport(filename, (err, vmod_object) => {
            // And notify,
            if (err === undefined) {
                ui_main.notify('import_vmod', vmod_object);
            }
            else {
                ui_main.notifyError('import_vmod', err);
            }
        });
    }

    function mergeLocalFile(filename) {
        doImport(filename, (err, vmod_object) => {
            // And notify,
            if (err === undefined) {
                ui_main.notify('merge_vmod', vmod_object);
            }
            else {
                ui_main.notifyError('merge_vmod', err);
            }
        });
    }


    function openVMODFile(filename) {
        ui_main.lockUIForLoad();
        const vmod = VMODFormat();
        vmod.load(filename, (err, serialized_state) => {
            // Unlock the UI,
            ui_main.unlockUIForLoad();
            // Notify UI,
            if (err === undefined) {
                ui_main.notify('load_vmod', serialized_state);
            }
            else {
                ui_main.notifyError('load_vmod', err);
            }
        });
    }

    function saveVMODFile(filename) {
        // PENDING: Check if file exists and if so, if user minds if the file
        //   is overwritten.

        // Lock the UI while we process the imported file,
        ui_main.lockUIForLoad();
        const vmod = VMODFormat();
        vmod.save(ui_main.getSerializedState(), filename, (err) => {
            // Unlock the UI,
            ui_main.unlockUIForLoad();
            // Notify UI,
            if (err === undefined) {
                ui_main.notify('save_vmod');
            }
            else {
                ui_main.notifyError('save_vmod', err);
            }
        });

    }


    function openModelAction() {
        const current_window = remote.getCurrentWindow();
        dialog.showOpenDialog(current_window, {
            title: 'Open VAnimator Model',
            properties: ['openFile'],
            filters: [
                { name: 'VAnimator Format', extensions: ['vmod'] },
                { name: 'All Files', extensions: ['*'] },
            ]
        }, (file_paths) => {
            if (file_paths !== undefined && file_paths.length === 1) {
                openVMODFile(file_paths[0]);
            }
        });
    }

    function saveModelAction() {
        const current_window = remote.getCurrentWindow();
        dialog.showSaveDialog(current_window, {
            title: 'Save VAnimator Model',
            filters: [
                { name: 'VAnimator Format', extensions: ['vmod'] },
                { name: 'All Files', extensions: ['*'] },
            ]
        }, (file_to_save) => {
            if (file_to_save !== undefined) {
                saveVMODFile(file_to_save);
            }
        });
    }

    function importModalAction() {
        const current_window = remote.getCurrentWindow();
        dialog.showOpenDialog(current_window, {
            title: 'Import From',
            buttonLabel: 'Import',
            properties: ['openFile'],
            filters: [
                { name: 'OpenRaster Format', extensions: ['ora'] },
                { name: 'All Files', extensions: ['*'] },
            ]
        }, (file_paths) => {
            if (file_paths !== undefined && file_paths.length === 1) {
                importLocalFile(file_paths[0]);
            }
        });
    }

    function mergeModalAction() {
        const current_window = remote.getCurrentWindow();
        dialog.showOpenDialog(current_window, {
            title: 'Merge From',
            buttonLabel: 'Merge',
            properties: ['openFile'],
            filters: [
                { name: 'OpenRaster Format', extensions: ['ora'] },
                { name: 'All Files', extensions: ['*'] },
            ]
        }, (file_paths) => {
            if (file_paths !== undefined && file_paths.length === 1) {
                mergeLocalFile(file_paths[0]);
            }
        });
    }


    function undoAction(evt) {
        ui_main.notify('global_undo');
    }

    function redoAction(evt) {
        ui_main.notify('global_redo');
    }

    // function cutAction(evt) {
    //     ui_main.notify('global_cut', evt);
    // }
    // function copyAction(evt) {
    //     ui_main.notify('global_copy', evt);
    // }
    // function pasteAction(evt) {
    //     ui_main.notify('global_paste', evt);
    // }

    function addLayerGroupAction(evt) {
        ui_main.notify('add_layer_group');
    }

    function removeLayerAction(evt) {
        ui_main.notify('remove_layer');
    }

    function addMeshAction(evt) {
        ui_main.notify('add_mesh');
    }

    function removeMeshAction(evt) {
        ui_main.notify('remove_mesh');
    }

    function propertiesMeshAction(evt) {
        ui_main.notify('properties_mesh');
    }

    function addDeformerAction(evt) {
        ui_main.notify('add_deformer');
    }

    function removeDeformerAction(evt) {
        ui_main.notify('remove_deformer');
    }

    function addModelActionAction(evt) {
        ui_main.notify('add_action');
    }

    function removeModelActionAction(evt) {
        ui_main.notify('remove_action');
    }

    function attachMeshMorphToActionAction(evt) {
        ui_main.notify('attach_mesh_morph_to_action');
    }

    function attachDeformTransformToActionAction(evt) {
        ui_main.notify('attach_deform_transform_to_action');
    }

    function attachLayerOpacityToActionAction(evt) {
        ui_main.notify('attach_layer_opacitty_to_action');
    }

    function createLatticeAction(evt) {
        ui_main.notify('create_lattice_action');
    }


    // Initialize,
    function init() {

        const template = [
          {
              label: 'File',
              submenu: [
                  { label: 'New Model', role: 'new' },
                  { label: 'Open Model', click: openModelAction },
                  { label: 'Import', click: importModalAction },
                  { label: 'Merge', click: mergeModalAction },
                  { type: 'separator' },
                  { label: 'Settings' },
                  { type: 'separator' },
                  { label: 'Save', role: 'save' },
                  { label: 'Save As', role: 'save as', click: saveModelAction },
                  { type: 'separator' },
                  { label: 'Exit', role: 'close' },
              ]
          },
          {
            label: 'Edit',
            submenu: [
              { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: undoAction },
              { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: redoAction },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
//              { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: cutAction },
//              { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: copyAction },
//              { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: pasteAction },
              { role: 'delete' },
              { role: 'selectall' }
            ]
          },
          {
            label: 'View',
            submenu: [
              { role: 'reload' },
              { role: 'forcereload' },
              { role: 'toggledevtools' },
              { type: 'separator' },
              { role: 'resetzoom' },
              { role: 'zoomin' },
              { role: 'zoomout' },
              { type: 'separator' },
              { role: 'togglefullscreen' }
            ]
          },

          {
            label: 'Art',
            submenu: [
              { label: 'Add Layer Group', click: addLayerGroupAction },
              { label: 'Remove Layer', click: removeLayerAction },
            ]
          },
          {
            label: 'Mesh',
            submenu: [
              { label: 'Add Mesh', click: addMeshAction },
              { label: 'Remove Mesh', click: removeMeshAction },
              { label: 'Mesh Properties', click: propertiesMeshAction },
            ]
          },
          {
            label: 'Deformer',
            submenu: [
              { label: 'Add Deformer', click: addDeformerAction },
              { label: 'Remove Deformer', click: removeDeformerAction },
            ]
          },
          {
            label: 'Actions',
            submenu: [
              { label: 'Add Action', click: addModelActionAction },
              { label: 'Remove Action', click: removeModelActionAction },
              { type: 'separator' },
              { label: 'Attach Morph', click: attachMeshMorphToActionAction },
              { label: 'Attach Transform', click: attachDeformTransformToActionAction },
              { label: 'Attach Layer Opacity', click: attachLayerOpacityToActionAction },

            ]
          },
          {
            label: 'Curve',
            submenu: [
              { label: 'Create Lattice', click: createLatticeAction },
            ]
          },


          {
            role: 'help',
            submenu: [
              {
                label: 'Learn More',
                click () {
                    shell.openExternal('https://electron.atom.io');
                }
              }
            ]
          }
        ];


        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);

    }
    init();


    return {
        importLocalFile,
    };

}

module.exports = CLElectron;
