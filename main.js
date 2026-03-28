const { app, BrowserWindow, Menu, Tray, Notification, shell, ipcMain, net } = require('electron');
const path = require('path');
require('dotenv').config();
const GmailProvider = require('./src/providers/GmailProvider');
const TelegramProvider = require('./src/providers/TelegramProvider');

let tray = null;
let mainWindow = null;
let isChecking = false;
let timeLeft = 60;
let timerInterval = null;

// ==========================================
// ⚙️ 配置區 (已改由 .env 讀取)
// ==========================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
// ==========================================

// 初始化 Providers
const gmailProvider = new GmailProvider();
const telegramProvider = new TelegramProvider(TELEGRAM_BOT_TOKEN);

// 統一處理來自 Providers 的驗證碼通知
function handleNewOTP(data) {
  new Notification({
    title: `${data.source} 驗證碼通知`,
    body: `來自 ${data.from} 的驗證碼: ${data.code}`,
    silent: false
  }).show();
}

// 綁定回調
gmailProvider.onNewOTP = handleNewOTP;

let serverConfig = null;

async function fetchRemoteConfig() {
  if (serverConfig) return serverConfig;
  const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
  const CLOUDFLARE_AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN;
  
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url: CLOUDFLARE_WORKER_URL });
    request.setHeader('Authorization', `Bearer ${CLOUDFLARE_AUTH_TOKEN}`);
    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            serverConfig = JSON.parse(data);
            resolve(serverConfig);
          } catch (e) { reject(new Error('JSON 解析失敗')); }
        } else { reject(new Error(`HTTP ${response.statusCode}`)); }
      });
    });
    request.on('error', (error) => { reject(error); });
    request.end();
  });
}


function createWindow() {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    width: 600, height: 700, show: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: '顯示主視窗', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: '結束程式', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Desktop OTP Notifier');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); });
}

async function performEmailCheck() {
  if (isChecking) return;
  isChecking = true;
  timeLeft = 60;
  try {
    let emailList = await gmailProvider.check();
    // 注入來源標記
    if (emailList) {
      emailList = emailList.map(e => ({ ...e, source: 'Gmail' }));
    }
    if (mainWindow) mainWindow.webContents.send('update-emails', emailList);
  } catch (error) {
    console.error('Email check error:', error);
  } finally {
    isChecking = false;
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('countdown-tick', timeLeft);
    }
    if (timeLeft <= 0) performEmailCheck();
  }, 1000);
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.fengnai555.gmailnotifier');
  }
  createWindow();
  createTray();

  ipcMain.on('get-login-status', async () => {
    const fs = require('fs').promises;
    const tokenPath = path.join(app.getPath('userData'), 'token.json');
    try {
      await fs.access(tokenPath);
      // 成功讀取後才初始化 Telegram
      const config = await fetchRemoteConfig();
      if (config.TELEGRAM_BOT_TOKEN) {
        telegramProvider.token = config.TELEGRAM_BOT_TOKEN;
        await telegramProvider.initialize();
        telegramProvider.onNewOTP = handleNewOTP;
        telegramProvider.start();
      }
      await performEmailCheck();
      startTimer();
      mainWindow.webContents.send('login-status', true);
    } catch {
      mainWindow.webContents.send('login-status', false);
    }
  });

  ipcMain.on('login', async () => {
    try {
      mainWindow.webContents.send('auth-status', '正在載入雲端配置...');
      const config = await fetchRemoteConfig();
      const { authorize } = require('./auth');
      await authorize(config.GMAIL_CREDENTIALS);
      
      if (config.TELEGRAM_BOT_TOKEN) {
        telegramProvider.token = config.TELEGRAM_BOT_TOKEN;
        await telegramProvider.initialize();
        telegramProvider.onNewOTP = handleNewOTP;
        telegramProvider.start();
      }

      await performEmailCheck();
      startTimer();
      mainWindow.webContents.send('login-status', true);
    } catch (err) {
      mainWindow.webContents.send('auth-error', err.message);
    }
  });

  ipcMain.on('logout', async () => {
    const fs = require('fs').promises;
    const tokenPath = path.join(app.getPath('userData'), 'token.json');
    await fs.unlink(tokenPath).catch(() => {});
    gmailProvider.lastSeenMessageId = null;
    mainWindow.webContents.send('login-status', false);
  });

  ipcMain.on('manual-refresh', async () => {
    await performEmailCheck();
  });
});

app.on('will-quit', () => {
  if (timerInterval) clearInterval(timerInterval);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
