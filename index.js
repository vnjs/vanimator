"use strict";

const { app, BrowserWindow, Menu } = require('electron');

const WindowStateKeeper = require('electron-window-state');

const path = require('path');
const url = require('url');

let win;
let window_state;

function createWindow() {

    window_state = WindowStateKeeper({
        defaultWidth: 1000,
        defaultHeight: 800
    });

    win = new BrowserWindow({
        x: window_state.x,
        y: window_state.y,
        width: window_state.width,
        height: window_state.height
    });

    window_state.manage(win);

    // Set up the application index page,
    const local_index = path.join(__dirname, 'web', 'index.html');
    win.loadURL(url.format({
        pathname: local_index,
        protocol: 'file:',
        slashes: true
    }));

//    win.webContents.openDevTools();

    win.on('closed', () => {
        win = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
        // HACKY: Wait 2 seconds before unmanaging the window state. If we don't
        //   put in the 'wait' then the state doesn't preserve!
        setTimeout(() => {
            window_state.unmanage();
        }, 2000);
    }
});

app.on('activate', () => {
    if (win === null) {
        createWindow();
    }
});

// Set application menu,
Menu.setApplicationMenu(Menu.buildFromTemplate([]));
