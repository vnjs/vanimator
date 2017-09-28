"use strict";

const { remote, shell } = require('electron');
const { Menu, dialog } = remote;

const ORAImport = require('./ORAImport.js');
const VMODFormat = require('./VMODFormat.js');



function CLElectron(ui_main) {

    const ora_importer = ORAImport();

    function importLocalFile(filename) {
        // Lock the UI while we process the imported file,
        ui_main.lockUIForLoad();
//        console.log("IMPORT: ", filename);
        // Assume the file is an .ora
        ora_importer.importFile(filename, (err, vmod_object) => {
            // Unlock the UI,
            ui_main.unlockUIForLoad();
            // And notify,
            if (err === undefined) {
                ui_main.notify('import_vmod', vmod_object);
            }
            else {
                ui_main.notifyError('import_vmod', err);
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

    // Initialize,
    function init() {

        const template = [
          {
              label: 'File',
              submenu: [
                  { label: 'New Model', role: 'new' },
                  { label: 'Open Model', click: openModelAction },
                  { label: 'Import', click: importModalAction },
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
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'pasteandmatchstyle' },
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
