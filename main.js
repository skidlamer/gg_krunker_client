require('v8-compile-cache');
const electron = require('electron');
const { app, BrowserWindow, globalShortcut, ipcMain } = electron;
const path = require('path');
const localShortcut = require('electron-localshortcut');
const Store = require('electron-store');
const log = require('electron-log');
Object.assign(console, log.functions);
class Main {
  constructor() {
    this.config = new Store();
    this.windows = {};
    try {
      this.initialize();
    }
    catch(e) {
      console.trace(e.stack);
    }
  }
  commandline() {
    //app.commandLine.appendSwitch('DISABLE_V8_COMPILE_CACHE', 1);
    if (this.config.get('unlimitedFPS', true)) {
      app.commandLine.appendSwitch('disable-frame-rate-limit');
    }
    app.commandLine.appendSwitch('enable-quic');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('enable-lazy-image-loading');
  }
  postMessage() {
    ipcMain.on('prompt', (event, message, defaultValue) => {
        this.windows.prompt = new BrowserWindow({
            width: 480,
            height: 240,
            center: true,
            show: false,
            frame: false,
            resizable: false,
            transparent: true,
            webPreferences: {
                nodeIntegration: true
            }
        });
        this.windows.prompt.loadFile('prompt.html');
        this.windows.prompt.removeMenu();
        this.windows.prompt.once('ready-to-show', () => {
          this.windows.prompt.show();
          this.windows.prompt.webContents.send('prompt-data', message, defaultValue);
        });

        let returnValue = null;
        ipcMain.on('prompt-return', (event, value) => returnValue = value);
        this.windows.prompt.on('closed', () => {
            event.returnValue = returnValue;
        });
    });

    ipcMain.handle('set-bounds', (event, bounds) => {
        BrowserWindow.fromWebContents(event.sender).setBounds(bounds);
    });
  }
  initialize() {
    this.commandline();
    app.whenReady().then(() => {
      this.postMessage();
      console.info('Krunker@ %s{ Electron: %s, Node: %s, Chromium: %s }', app.getVersion(), process.versions.electron, process.versions.node, process.versions.chrome);
      this.createMainWindow();
    });
    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
    app.on('window-all-closed', function () {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('quit', () => app.quit());
    app.once('before-quit', () => {
      localShortcut.unregisterAll();
      globalShortcut.unregisterAll();
      this.windows.game.removeAllListeners('close');
      for(let window in this.windows) {
        this.windows[window].close();
     }
    });
  }
  createMainWindow() {
    // Create the browser window.
    this.windows.game = new BrowserWindow({
      width: 1280,
      height: 720,
      center: true,
      webPreferences: {
        enableRemoteModule: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    const contents = this.windows.game.webContents;
    const chunk = '(KHTML, like Gecko)';
    contents.setUserAgent(contents.getUserAgent().split(chunk)[0].concat(chunk,' ','Chrome/90.0.4430.212 Safari/537.36 Edg/90.0.818.66'));
    this.windows.game.loadURL('https://krunker.io/');
    this.windows.game.removeMenu();
    if (this.config.get('fullscreen', false))
      this.windows.game.setFullScreen(true);
    this.windows.game.once('closed', () => {
      this.windows.game = null;
    });
    let isGame = (url) => /^(https?:\/\/)?(www\.)?(.+)(krunker\.io|127\.0\.0\.1:8080)(|\/|\/\?game=.+)$/.test(url);
    contents.on('dom-ready', () => {
      if (isGame(contents.getURL())) {
        localShortcut.register('F6', () => this.windows.game.loadURL('https://krunker.io/'));
      }
    });
    localShortcut.register('Esc', () => contents.send('esc'));
    localShortcut.register('Alt+F4', () => app.quit());
    localShortcut.register('F5', () => contents.reloadIgnoringCache());
    localShortcut.register('F5', () => contents.reload());
    localShortcut.register('F11', (full = !this.windows.game.isFullScreen()) => {
      this.windows.game.setFullScreen(full);
      this.config.set('fullscreen', full);
    });
    localShortcut.register('F12', () => {
      contents.isDevToolsOpened()  
      ? contents.closeDevTools() 
      : contents.openDevTools({ mode: 'undocked' });
    });
  }
}
const main = new Main();
