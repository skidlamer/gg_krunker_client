const electron = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store'), config = new Store();
const notifier = require('node-notifier');

const cnsl = global.console, console = {
  log: cnsl.log.bind(null, '[Krunker-Client]'),
  info: cnsl.info.bind(null, '[Krunker-Client]'),
  error: cnsl.error.bind(null, '[Krunker-Client]'),
  warn: cnsl.warn.bind(null, '[Krunker-Client]'),
  dir: cnsl.dir.bind(cnsl),
  trace: cnsl.trace.bind(cnsl),
}

class Preload {

  constructor() {

    this.hash = this.genHash(8);
    global[this.hash] = this;
    this.mainWindow = electron.remote.getCurrentWindow();
    this.settings = {};
    this.cssRules = {
      noAdvertise: `#aContainer, #aHolder, #endAContainer, #aMerger { display: none !important; }`,
      selectableChat: `#chatList * { user-select: text; }`
    };
    try {
      this.initialize();
    }
    catch (e) {
      console.trace(e.stack);
    }
  }

  initialize() {
    this.postMessage();
    if (config.get('enableUserscripts', false)) {
      this.loadUserScripts();
    }
    this.waitFor(_ => global.windows).then(arr => {
      global.closeClient = close;
      const gameSettings = arr[0];
      const gameTabIndex = gameSettings.tabs.push({ name: 'Client', categories: [] });
      gameSettings.getSettings = new Proxy(gameSettings.getSettings, {
        apply(target, that, args) {
          return that.tabIndex == gameTabIndex - 1 ? preload.getHTML() : Reflect.apply(...arguments);
        }
      })
    })
    this.mainWindow.webContents.once('dom-ready', () => {
      this.createSettings();
      this.loadSettings();
      for (const [key, value] of Object.entries(this.cssRules)) {
        this.mainWindow.webContents.insertCSS(value).then(res => this.cssRules[key] = res);
      }
    })
  }

  postMessage() {
    electron.ipcRenderer.on('esc', () => document.exitPointerLock());
    global.prompt = (message, defaultValue) => electron.ipcRenderer.sendSync('prompt', message, defaultValue);
  }

  loadUserScripts() {
    const documents = (electron.app || electron.remote.app).getPath('documents');
    const scriptsDir = path.join(documents, 'GG-Client', ' Scripts');
    if (!fs.existsSync(scriptsDir)) try { fs.mkdirSync(scriptsDir, { recursive: true }) } catch (e) { console.error(e) };

    try {
      fs.readdirSync(scriptsDir).filter(filename => path.extname(filename).toLowerCase() == '.js').forEach(filename => {
        try {
          const script = require(path.join(scriptsDir, filename))
          if (this.isType(script, 'object')) {
            if (script.hasOwnProperty("settings")) {
              Object.assign(this.settings, script.settings);
            }
            if (script.hasOwnProperty('css')) {
              Object.assign(this.cssRules, script.css);
            }
            if (script.hasOwnProperty('run')) {
              script.run(config);
            }
            notifier.notify({
              title: 'GG Client',
              message: 'Loaded UserScript '.concat(script.hasOwnProperty('name')?script.name:'', script.hasOwnProperty('author')?' by '+ script.author:'')
            });

          }
        } catch (err) {
          console.error('Failed to load userscript:', err);
        }
      });
    } catch (err) {
      console.error('Failed to load scripts:', err);
    }
  }

  createSettings() {
    Object.assign(this.settings, {
      acceleratedCanvas: {
        name: 'Accelerated Canvas',
        id: 'acceleratedCanvas',
        cat: 'Performance',
        type: 'checkbox',
        val: true,
        needsRestart: true,
        info: 'Enables the use of the GPU to perform 2d canvas rendering instead of using software rendering.'
      },

      unlimitedFPS: {
        name: 'Disable Frame Rate Limit',
        id: 'unlimitedFPS',
        cat: 'Performance',
        type: 'checkbox',
        val: false,
        needsRestart: true,
      },

      angleBackend: {
        name: 'ANGLE Graphics Backend',
        id: 'angleBackend',
        cat: 'Performance',
        platforms: ['win32', 'linux'],
        type: 'select',
        options: {
          "default": "Default",
          gl: "OpenGL (Windows, Linux, MacOS)",
          d3d11: "D3D11 (Windows-Only)",
          d3d9: "D3D9 (Windows-Only)",
          d3d11on12: "D3D11on12 (Windows, Linux)",
          vulkan: "Vulkan (Windows, Linux)",
          metal: "Metal (MacOS-Only)"
        },
        val: 'default',
        needsRestart: true,
        info: 'Choose the graphics backend for ANGLE. D3D11 is used on most Windows computers by default. Using the OpenGL driver as the graphics backend may result in higher performance, particularly on NVIDIA GPUs. It can increase battery and memory usage of video playback.'
      },

      colorProfile: {
        name: "Color Profile",
        id: "colorProfile",
        cat: "Rendering",
        type: "select",
        options: {
          "default": "Default",
          srgb: "sRGB",
          "display-p3-d65": "Display P3 D65",
          "color-spin-gamma24": "Color spin with gamma 2.4"
        },
        val: "default",
        needsRestart: true,
        info: "Forces color profile."
      },

      showExitButton: {
        name: 'Show Exit Button',
        id: 'showExitButton',
        cat: 'Rendering',
        type: 'checkbox',
        val: true,
        set: val => {
          let btn = document.getElementById('clientExit');
          if (btn) btn.style.display = val ? 'flex' : 'none';
        }
      },

      chromiumFlags: {
        name: 'Chromium Flags',
        id: 'chromiumFlags',
        cat: 'Advanced',
        type: 'text',
        val: '',
        placeholder: '--flag=value',
        needsRestart: true,
        info: 'Additional Chromium flags.'
      },

      enableUserscripts: {
        name: 'Enable Userscripts',
        id: 'enableUserscripts',
        cat: 'Advanced',
        type: 'checkbox',
        val: false,
        needsRestart: true
      },

      enableResourceSwap: {
        name: 'Enable Resource Swap',
        id: 'enableResourceSwap',
        cat: 'Advanced',
        type: 'checkbox',
        val: false,
        needsRestart: true,
        info: "Swaps Krunkers Assets With Your Modified Versions."
      },

      enableResourceDump: {
        name: 'Enable Resource Dump',
        id: 'enableResourceDump',
        cat: 'Advanced',
        type: 'checkbox',
        val: false,
        needsRestart: true,
        info: "Dumps All Krunkers Assets."
      },

    })
  }

  loadSettings() {
    for (const key in this.settings) {
      if (!this.isDefined(this.settings[key].html)) this.settings[key].html = () => preload.generateSetting(this.settings[key]);
      this.settings[key].def = this.settings[key].val;
      if (!this.settings[key].disabled) {
        let tmpVal = config.get(key, null);
        this.settings[key].val = tmpVal !== null ? tmpVal : this.settings[key].val;
        if (this.settings[key].val == "false") this.settings[key].val = false;
        if (this.settings[key].val == "true") this.settings[key].val = true;
        if (this.settings[key].val == "undefined") this.settings[key].val = this.settings[key].def;
        if (this.settings[key].set) this.settings[key].set(this.settings[key].val, true);
      }
    }
  }

  generateSetting(options) {
    switch (options.type) {
      case 'checkbox': return `<label class='switch'><input type='checkbox' onclick='${this.hash}.setSetting("${options.id}", this.checked)'${options.val ? ' checked' : ''}><span class='slider'></span></label>`;
      case 'slider': return `<input type='number' class='sliderVal' id='c_slid_input_${options.id}' min='${options.min}' max='${options.max}' value='${options.val}' onkeypress='${this.hash}.SetSetting("${options.id}", this)' style='border-width:0px'/><div class='slidecontainer'><input type='range' id='c_slid_${options.id}' min='${options.min}' max='${options.max}' step='${options.step}' value='${options.val}' class='sliderM' oninput='${this.hash}.setSetting("${options.id}", this.value)'></div>`;
      case 'select': return `<select onchange='${this.hash}.setSetting("${options.id}", this.value)' class='inputGrey2'>${Object.entries(options.options).map(entry => `<option value='${entry[0]}'${entry[0] == options.val ? ' selected' : ''}>${entry[1]}</option>`).join('')}</select>`;
      default: return `<input type='${options.type}' name='${options.id}' id='c_slid_${options.id}' ${options.type == 'color' ? 'style="float:right;margin-top:5px;"' : `class='inputGrey2' ${options.placeholder ? `placeholder='${options.placeholder}'` : ''}`} value='${options.val.replace(/'/g, '')}' oninput='${this.hash}.setSetting("${options.id}", this.value)'/>`;
    }
  }

  setSetting(name, value) {
    let entry = Object.values(this.settings).find(entry => entry.id == name);
    if (entry.min && entry.max) {
      value = Math.max(entry.min, Math.min(value, entry.max));
    }
    config.set(name, value);
    entry.val = value;
    if (entry.set) {
      entry.set(value);
    }
    let element = document.getElementById('c_slid_' + entry.id);
    if (element) {
      element.value = value;
    }
    element = document.getElementById('c_slid_input_' + entry.id);
    if (element) {
      element.value = value;
    }
  }

  getHTML() {
    let tempHTML = '';
    let previousCategory = null;
    Object.values(this.settings).forEach(entry => {
      if (window.windows[0].settingSearch && !this.searchMatches(entry) || entry.hide) {
        return;
      }
      if (previousCategory != entry.cat) {
        if (previousCategory) {
          tempHTML += '</div>';
        }
        previousCategory = entry.cat;
        tempHTML += `<div class='setHed' id='setHed_${btoa(entry.cat)}' onclick='window.windows[0].collapseFolder(this)'><span class='material-icons plusOrMinus'>keyboard_arrow_down</span> ${entry.cat}</div><div id='setBod_${btoa(entry.cat)}'>`;
      }
      tempHTML += `<div class='settName'${entry.needsRestart ? ' title="Requires Restart"' : ''}${entry.hide ? ` id='c_${entry.id}_div' style='display: none'` : ''}>${entry.name}${entry.needsRestart ? ' <span style="color: #eb5656">*</span>' : ''} ${entry.html()}</div>`;
    });
    return tempHTML ? tempHTML + '</div>' : '';
  }

  isType(item, type) {
    return typeof item === type;
  }

  isDefined(object) {
    return !this.isType(object, "undefined") && object !== null;
  }

  genHash(sz) {
    return [...Array(sz)].map(_ => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[~~(Math.random() * 52)]).join('');
  }

  async waitFor(test, timeout_ms = Infinity, doWhile = null) {
    let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    return new Promise(async (resolve, reject) => {
      if (typeof timeout_ms != "number") reject("Timeout argument not a number in waitFor(selector, timeout_ms)");
      let result, freq = 100;
      while (result === undefined || result === false || result === null || result.length === 0) {
        if (doWhile && doWhile instanceof Function) doWhile();
        if (timeout_ms % 1e4 < freq) console.log("waiting for: ", test);
        if ((timeout_ms -= freq) < 0) {
          console.error("Timeout : ", test);
          resolve(false);
          return;
        }
        await sleep(freq);
        result = typeof test === "string" ? eval(test) : test();
      }
      console.info("Passed : ", test);
      resolve(result);
    });
  }
}
const preload = new Preload();