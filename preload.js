const electron = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const cnsl = global.console;
const console = {
  log: cnsl.log.bind(null, '[Krunker-Client]'),
  info: cnsl.info.bind(null, '[Krunker-Client]'),
  error: cnsl.error.bind(null, '[Krunker-Client]'),
  warn: cnsl.warn.bind(null, '[Krunker-Client]'),
  dir: cnsl.dir.bind(cnsl),
}

class Settings {
  constructor() {
    this.hash = this.genHash(8);
    window[this.hash] = this;
    this.config = new Store();
    this.onLoad();
  }
  onLoad() {
    window.closeClient = close;
    this.createSettings();
    const gameSettings = window.windows[0];
    const gameTabIndex = gameSettings.tabs.push({ name: 'Client', categories: [] });
    gameSettings.getSettings = new Proxy(gameSettings.getSettings, {
      apply(target, that, args) {
          let value = Reflect.apply(...arguments);
          if (that.tabIndex == gameTabIndex -1) {
            return preload.settings.getHTML();
          }
          return value;
      }
    })
  }
  genHash(sz) {
    return [...Array(sz)].map(_ => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[~~(Math.random()*52)]).join('');
  }
  createSettings() {
    this.settings = {

      unlimitedFPS: {
        name: 'Disable Frame Rate Limit',
        id: 'unlimitedFPS',
        cat: 'Performance',
        type: 'checkbox',
        val: false,
        needsRestart: true,
        html: function () {
          return preload.settings.generateSetting(this);
        }
      },

      showExitButton: {
        name: 'Show Exit Button',
        id: 'showExitButton',
        cat: 'Interface',
        type: 'checkbox',
        val: true,
        html: function () {
          return preload.settings.generateSetting(this);
        },
        set: val => {
          let btn = document.getElementById('clientExit');
          if (btn) btn.style.display = val ? 'flex' : 'none';
        }
      },
    }
    for (const key in this.settings) {
			this.settings[key].def = this.settings[key].val;
			if (!this.settings[key].disabled) {
				let tmpVal = this.config.get(key, null);
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
  searchMatches(entry) {
		let query = this.gameSettings.settingSearch.toLowerCase() || '';
		return (entry.name.toLowerCase() || '').includes(query) || (entry.cat.toLowerCase() || '').includes(query);
	}
  setSetting(name, value) {
		let entry = Object.values(this.settings).find(entry => entry.id == name);
		if (entry.min && entry.max) {
			value = Math.max(entry.min, Math.min(value, entry.max));
		}
		this.config.set(name, value);
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
}

class Preload {
  constructor() {
    this.mainWindow = electron.remote.getCurrentWindow();
    this.cssRules = {
      noAdvertise: `#aContainer, #aHolder, #endAContainer, #aMerger { display: none !important; }`,
      selectableChat:`#chatList * { user-select: text; }`
    };
    try {
      this.initialize();
    }
    catch(e) {
      console.trace(e.stack);
    }
  }
  initialize() {
    this.postMessage();
    this.loadUserScripts();
    this.mainWindow.webContents.once('did-finish-load', () => this.onLoad())
  }
  onLoad() {
      for (const [key, value] of Object.entries(this.cssRules)) {
        this.mainWindow.webContents.insertCSS(value).then(res => this.cssRules[key] = res);
      }
      this.settings = new Settings();
  }
  postMessage() {
    electron.ipcRenderer.on('esc', () => document.exitPointerLock());
    global.prompt = (message, defaultValue) => electron.ipcRenderer.sendSync('prompt', message, defaultValue);
  }
  loadUserScripts() {
    const documentsPath = (electron.app||electron.remote.app).getPath('documents');
    const scriptsPath = path.join(documentsPath, 'KrunkerUserScripts');
    try {
      if (!fs.existsSync(scriptsPath)) fs.mkdirSync(scriptsPath);
      fs.readdirSync(scriptsPath).filter(filename => path.extname(filename).toLowerCase() == '.js').forEach(filename => {
          try {
              const scriptPath = path.join(scriptsPath, filename);
              const scriptData = fs.readFileSync(scriptPath, 'utf8');
              if (scriptData) {
                this.mainWindow.webContents.executeJavaScript(scriptData);
                console.log(`Loaded userscript: ${filename}`);
              } else {
                require(scriptPath);
                console.log(`Loaded userscript: ${filename}`);
              }
          } catch (err) {
              console.error('Failed to load userscript:', err);
          }
      });
    } catch (err) {
      console.error('Failed to load scripts:', err);
    }
  }
}
const preload = new Preload();