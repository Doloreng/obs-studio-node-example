const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path');
const remote = require("@electron/remote/main");
let mianBrowser;
// app.on('will-quit', obsRecorder.shutdown);

remote.initialize();

// ipcMain.on('ELECTRON_BROWSER_GET_CURRENT_WINDOW', (event) => {
//   const window = BrowserWindow.getFocusedWindow();
//   if (window) {
//     // 返回包含id属性的对象
//     event.returnValue = { id: window.id };
//   } else {
//     event.returnValue = null;
//   }
// });

// ipcMain.on('REMOTE_BROWSER_GET_CURRENT_WINDOW', (event) => {
//   // 获取当前聚焦的窗口
//   const window = BrowserWindow.getFocusedWindow();
//   if (window) {
//     // 可以返回窗口ID或其他信息
//     event.returnValue = window.id;
//   } else {
//     event.returnValue = null;
//   }
// });
ipcMain.handle("getAppPath", (event, arg) => {
  return app.getAppPath();
});

ipcMain.handle("getDisplayInfo",(event, arg) => {
    return displayInfo()
});
// Get information about prinary display
function displayInfo() {
  const { screen, ipcRenderer } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const { scaleFactor } = primaryDisplay;
  return {
    width,
    height,
    scaleFactor:    scaleFactor,
    aspectRatio:    width / height,
    physicalWidth:  width * scaleFactor,
    physicalHeight: height * scaleFactor,
  }
}
function createWindow () {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      webviewTag: true,
      contextIsolation: false,
      enableRemoteModule: true, // 启用remote模块
      sandbox: false
    }
  });
  // 为渲染进程开启remote 
  remote.enable(win.webContents);
  ipcMain.handle('recording-init', (event) => {
    // obsRecorder.initialize(win);
    return true;
  });

  // ipcMain.handle('preview-init', (event, bounds) => {
  //   return obsRecorder.setupPreview(win, bounds);
  // });

  // ipcMain.handle('preview-bounds', (event, bounds) => {
  //   return obsRecorder.resizePreview(win, bounds);
  // });

  // ipcMain.handle('getMine', (event, bounds) => {
  //   return obsRecorder.(win, bounds);
  // });
  
  // and load the index.html of the app.
  win.loadFile('index.html');
  // Open the DevTools.
  win.webContents.openDevTools();
  mianBrowser = win;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed.

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
