"use strict";

/* globals requestAnimationFrame */

const THREE = require('three');
const Split = require('split.js');
const local_store = require('./LocalStore.js')();

function EditorPanel(window, document) {

    let ui_central_content;
    let ui_timeline_content;

    let scene;
    let camera;
    let renderer;
    let view_width = 100;
    let view_height = 100;

    function layoutResizeHandler() {

        view_width = ui_central_content.clientWidth;
        view_height = ui_central_content.clientHeight;

        const tc_width = ui_timeline_content.clientWidth;
        const tc_height = ui_timeline_content.clientHeight;

        // Resize the view panel,
        renderer.setSize(view_width, view_height);
        camera = new THREE.OrthographicCamera(
                            view_width / -2, view_width / 2,
                            view_height / 2, view_height / -2,
                            1, 1000 );
        camera.position.z = 500;

    }

    function layout() {

        ui_central_content = document.querySelector('#ui_central_content');
        ui_timeline_content = document.querySelector('#ui_timeline_content');

        // Load split pane state from local storage,
        const layoutk1_sizes = local_store.load('layoutk1_sizes', [10, 10, 80]);
        const layoutk2_sizes = local_store.load('layoutk2_sizes', [80, 20]);

        // Create split layout,
        const lk1_split =
                Split(['#control_panel1', '#control_panel2', '#central_panel'], {
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

        // Set view port,
        ui_central_content.appendChild(renderer.domElement);

    }

    let test_cube;

    function renderCall(time) {
        requestAnimationFrame(renderCall);
        renderer.render(scene, camera);

        test_cube.rotation.x = time * 0.0018;
        test_cube.rotation.y = time * 0.0009;
    }

    // Initialize the UI

    function init() {

        // Create the three js scene,
        scene = new THREE.Scene();

        const geometry = new THREE.BoxGeometry( 90, 90, 90 );
        const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
        test_cube = new THREE.Mesh( geometry, material );
        scene.add( test_cube );

        renderer = new THREE.WebGLRenderer({
            alpha: true
        });
        renderer.setSize(view_width, view_height);
        renderer.setClearColor(0x0ffffff, 0);

        window.addEventListener("resize", layoutResizeHandler, false);

        // Layout the UI split panes,
        layout();

        // Dispatch a resize event to layout the components,
        layoutResizeHandler();

        // Add renderCall into animation loop,
        requestAnimationFrame(renderCall);

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
