const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true, // メニューバーを隠す
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // will be created if needed
    },
  });

  // 開発モードかどうかを判定 (環境変数で渡すか、引数で判定)
  const isDev = !app.isPackaged;

  if (isDev) {
    // 開発時はViteサーバーのURLを読み込む
    mainWindow.loadURL('http://localhost:5173');
    // 開発ツールを開く
    mainWindow.webContents.openDevTools();
  } else {
    // 本番時はビルドされたファイルを読み込む
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
