// ./build_installer.js

// 1. Import Modules
const { MSICreator } = require('electron-wix-msi');
const path = require('path');

// 2. Define input and output directory.
// Important: the directories must be absolute, not relative e.g
// appDirectory: "C:\\Users\sdkca\Desktop\OurCodeWorld-win32-x64", 
const APP_DIR = path.resolve(path.join(__dirname, 'release-builds', 'gg-krunker-client-win32-x64'));
// outputDirectory: "C:\\Users\sdkca\Desktop\windows_installer", 
const OUT_DIR = path.resolve(path.join(__dirname, 'release-builds', 'windows-installer'));
const ICON_PATH = path.resolve(path.join(__dirname, 'icon.ico'));

// 3. Instantiate the MSICreator
const msiCreator = new MSICreator({
    appDirectory: APP_DIR,
    outputDirectory: OUT_DIR,

    // Configure metadata
    description: 'A Modern Krunker Client',
    exe: 'gg-krunker-client.exe',
    name: 'GG Krunker Client',
    manufacturer: 'The Gaming Gurus',
    version: '1.0.0',
    appIconPath: ICON_PATH,
    // Configure installer User Interface
    ui: {
        chooseDirectory: true
    },
});

// 4. Create a .wxs template file
msiCreator.create().then(function(){

    // Step 5: Compile the template to a .msi file
    msiCreator.compile();
});