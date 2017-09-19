"use strict";

const Split = require('split.js');

const local_store = require('./LocalStore.js')();

function EditorPanel(window, document) {

    function init() {

        const ui_central_content = document.querySelector('#ui_central_content');
        const ui_timeline_content = document.querySelector('#ui_timeline_content');

        function layoutResizeHandler() {

            const cc_width = ui_central_content.clientWidth;
            const cc_height = ui_central_content.clientHeight;

            const tc_width = ui_timeline_content.clientWidth;
            const tc_height = ui_timeline_content.clientHeight;

        }

        window.addEventListener("resize", layoutResizeHandler, false);

        const layoutk1_sizes = local_store.load('layoutk1_sizes', [10, 10, 80]);
        const layoutk2_sizes = local_store.load('layoutk2_sizes', [80, 20]);

        console.log(layoutk1_sizes);
        console.log(layoutk2_sizes);

        const lk1_split =
                Split(['#left_panel1', '#left_panel2', '#central_panel'], {
            gutterSize: 8,
            cursor: 'col-resize',
            sizes: layoutk1_sizes,
            minSize: [100, 100, 240],
            snapOffset: 0,
            onDrag: layoutResizeHandler,
            onDragEnd: () => local_store.save('layoutk1_sizes', lk1_split.getSizes())
        });

        const lk2_split =
                Split(['#ui_central_content', '#ui_timeline_content'], {
            direction: 'vertical',
            gutterSize: 8,
            cursor: 'row-resize',
            sizes: layoutk2_sizes,
            minSize: [240, 8],
            snapOffset: 0,
            onDrag: layoutResizeHandler,
            onDragEnd: () => local_store.save('layoutk2_sizes', lk2_split.getSizes())
        });


        // ---- Electron Specifics ----
        // Set the menu in the UI,

        const { remote, shell } = require('electron');
        const { Menu, dialog } = remote;

        function openModelAction() {
            const current_window = remote.getCurrentWindow();
            dialog.showOpenDialog(current_window, {
                properties: ['openDirectory']
            }, (file_paths) => {
                console.log("SELECTED %o", file_paths);
            });
        }


        const template = [
          {
              label: 'File',
              submenu: [
                  { label: 'New Model', role: 'new' },
                  { label: 'Open Model', click: openModelAction },
                  { type: 'separator' },
                  { label: 'Save', role: 'save' },
                  { label: 'Save As', role: 'save as' },
                  { type: 'separator' },
                  { label: 'Settings' },
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


    // Exported API
    return {
        init
    };

}

module.exports = EditorPanel;
