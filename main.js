require('v8-compile-cache');
const electron = require('electron');
const { app, BrowserWindow, globalShortcut, ipcMain, Menu, protocol } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const localShortcut = require('electron-localshortcut');
const Store = require('electron-store'), config = new Store();
const log = require('electron-log');
Object.assign(console, log.functions);
class Main {
  constructor() {
    this.windows = {};
    try {
      this.initialize();
    }
    catch (e) {
      console.trace(e.stack);
    }
  }
  commandline() {
    //app.commandLine.appendSwitch('DISABLE_V8_COMPILE_CACHE', 1);
    if (!config.get('acceleratedCanvas', true)) {
      app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
    }
    if (config.get('unlimitedFPS', true)) {
      if (os.cpus()[0].model.indexOf("AMD") > -1) app.commandLine.appendSwitch('enable-zero-copy');
      app.commandLine.appendSwitch('disable-frame-rate-limit');
      app.commandLine.appendSwitch('disable-gpu-vsync');
    }
    let angleBackend = config.get('angleBackend', 'default');
    if (angleBackend !== "default") app.commandLine.appendSwitch("use-angle", angleBackend);
    let colorProfile = config.get('colorProfile', 'default');
    if (colorProfile !== "default") app.commandLine.appendSwitch("force-color-profile", colorProfile);
    app.commandLine.appendSwitch('enable-quic');
    app.commandLine.appendSwitch('enable-lazy-image-loading');
    app.commandLine.appendSwitch('enable-force-dark');
    app.commandLine.appendSwitch('block-insecure-private-network-requests', 'Disabled');
    let yargs = require("yargs");
    yargs.parse(
      String(config.get("chromiumFlags", "")),
      (_, argv) => Object.entries(argv).slice(1, -1).forEach(entry => app.commandLine.appendSwitch(entry[0], entry[1]))
    );
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
    protocol.registerSchemesAsPrivileged([{
      scheme: "res-swap",
      privileges: {
        secure: true,
        corsEnabled: true
      }
    }]);

    if (process.platform == 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([{
        label: "Application",
        submenu: [
          { label: "About Application", selector: "orderFrontStandardAboutPanel:" },
          { type: "separator" },
          { label: "Quit", accelerator: "Command+Q", click: _ => app.quit() }
        ]
      }, {
        label: "Edit",
        submenu: [
          { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
          { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
          { type: "separator" },
          { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
          { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
          { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
          { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
        ]
      }]));
    }

    app.whenReady().then(() => {
      console.info('Krunker@ %s{ Electron: %s, Node: %s, Chromium: %s }', app.getVersion(), process.versions.electron, process.versions.node, process.versions.chrome);
      protocol.registerFileProtocol("res-swap", (request, callback) => callback(decodeURI(request.url.replace(/^res-swap:/, ""))));
      this.postMessage();
      this.directories();
      if (config.get('enableResourceSwap', false)) {
        this.resourceSwapper();
      }
      if (config.get('enableResourceDump', false)) {
        this.resourceDumper();
      }
      this.createSplashWindow();
    });
    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createSplashWindow();
    });
    app.on('window-all-closed', function () {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('quit', () => app.quit());
    app.once('before-quit', () => {
      localShortcut.unregisterAll();
      globalShortcut.unregisterAll();
      this.windows.game.removeAllListeners('close');
      for (let window in this.windows) {
        this.windows[window].close();
      }
    });
  }
  createSplashWindow() {
    this.windows.splash = new BrowserWindow({
      width: 650,
      height: 370,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      center: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: true
      }
    });
    const contents = this.windows.splash.webContents;
    this.windows.splash.loadFile(path.join(__dirname, 'splash.html'));
    this.windows.splash.removeMenu();
    this.windows.splash.setFullScreen(true);
    contents.once('did-finish-load', () => this.createMainWindow());
  };
  createMainWindow() {
    this.windows.game = new BrowserWindow({
      width: 1280,
      height: 720,
      center: true,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        enableRemoteModule: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    const contents = this.windows.game.webContents;
    const chunk = '(KHTML, like Gecko)';
    contents.setUserAgent(contents.getUserAgent().split(chunk)[0].concat(chunk, ' ', 'Chrome/90.0.4430.212 Safari/537.36 Edg/90.0.818.66'));
    this.windows.game.loadURL('https://krunker.io/');
    this.windows.game.removeMenu();
    if (config.get('fullscreen', false))
      this.windows.game.setFullScreen(true);
    this.windows.game.once('closed', () => {
      this.windows.game = null;
    });
    let isGame = (url) => /^(https?:\/\/)?(www\.)?(.+)(krunker\.io|127\.0\.0\.1:8080)(|\/|\/\?game=.+)$/.test(url);
    contents.on('did-finish-load', () => {
      this.windows.splash.destroy();
      this.windows.game.show();
      if (isGame(contents.getURL())) {
        localShortcut.register('F6', () => this.windows.game.loadURL('https://krunker.io/'));
      }
    });
    localShortcut.register('Esc', () => contents.send('esc'));
    localShortcut.register('Ctrl+F4', () => app.quit());
    localShortcut.register('Ctrl+F5', () => contents.reloadIgnoringCache());
    localShortcut.register('Ctrl+F6', () => this.windows.game.loadURL('https://browserfps.com/'));
    localShortcut.register('F5', () => contents.reload());
    localShortcut.register('F11', (full = !this.windows.game.isFullScreen()) => {
      this.windows.game.setFullScreen(full);
      config.set('fullscreen', full);
    });
    localShortcut.register('F12', () => {
      contents.isDevToolsOpened()
        ? contents.closeDevTools()
        : contents.openDevTools({ mode: 'undocked' });
    });
  }

  directories() {
    const documents = app.getPath('documents');
    const swapDir = path.join(documents, 'GG-Client', ' Resources', 'Swap');
    const dumpDir = path.join(documents, 'GG-Client', ' Resources', 'Dump');
    const scriptsDir = path.join(documents, 'GG-Client', ' Scripts');
    [swapDir, dumpDir, scriptsDir].forEach(dir => { 
      if (!fs.existsSync(dir)) try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { console.error(e) };
    })
  }

  resourceSwapper() {
    // Resource Swapper
    const documents = app.getPath('documents');
    const swapDir = path.join(documents, 'GG-Client', ' Resources', 'Swap');
    if (!fs.existsSync(swapDir)) try { fs.mkdirSync(swapDir, { recursive: true }) } catch (e) { console.error(e) };
    let swap = { filter: { urls: [] }, files: {} };
    const allFilesSync = (dir, fileList = []) => {
      fs.readdirSync(dir).forEach(file => {
        const filePath = consts.joinPath(dir, file);
        let useAssets = !(/KrunkerResourceSwapper\\(css|docs|img|libs|pkg|sound)/.test(dir));
        if (fs.statSync(filePath).isDirectory()) {
          allFilesSync(filePath);
        } else {
          let krunk = '*://' + (useAssets ? 'assets.' : '') + 'krunker.io' + filePath.replace(swapDir, '').replace(/\\/g, '/') + '*';
          swap.filter.urls.push(krunk);
          swap.files[krunk.replace(/\*/g, '')] = url.format({
            pathname: filePath,
            protocol: 'res-swap:',
            slashes: true
          });
        }
      });
    };
    allFilesSync(swapDir);
    if (swap.filter.urls.length) {
      session.defaultSession.webRequest.onBeforeRequest(swap.filter, (details, callback) => {
        let redirect = swap.files[details.url.replace(/https|http|(\?.*)|(#.*)/gi, '')] || details.url;
        callback({ cancel: false, redirectURL: redirect });
        console.log('Redirecting ', details.url, 'to', redirect);
        //console.log('onBeforeRequest details', details);
      });
    }
  }

  resourceDumper() {
    // Resource Dumper
    const documents = app.getPath('documents');
    const dumpDir = path.join(documents, 'GG-Client', ' Resources', 'Dump');
    if (!fs.existsSync(dumpDir)) try { fs.mkdirSync(dumpDir, { recursive: true }) } catch (e) { console.error(e) };

    let dumpedURLs = [];
    electron.session.defaultSession.webRequest.onCompleted(details => {
      const regex = RegExp('^http(s?):\/\/(beta|assets\.)?krunker.io\/*');
      if (details.statusCode == 200 && regex.test(details.url) && !dumpedURLs.includes(details.url)) {
        dumpedURLs.push(details.url)
        const request = net.request(details.url)
        let raw = ""
        request.on("response", res => {
          if (res.statusCode == 200) {
            res.setEncoding("binary")
            res.on("data", chunk => raw += chunk)
            res.on("end", () => {
              let target = new url.URL(details.url),
                targetPath = consts.joinPath(dumpDir, target.hostname, path.dirname(target.pathname))
              if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, {
                recursive: true
              })
              fs.writeFileSync(consts.joinPath(dumpDir, target.hostname, target.pathname == "/" ? "index.html" : target.pathname), raw, "binary")
            })
          }
        })
        request.end()
      }
    })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const main = new Main();
}
