const { app, BrowserWindow, Menu, Tray, Notification, shell, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');

// 🚀 自定義 .env 載入器 (取代 dotenv 解決打包相容性問題)
function loadEnv() {
  const envPath = path.join(app.getAppPath(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      });
      console.log('Env loaded successfully from:', envPath);
    } catch (err) {
      console.error('Error reading .env file:', err);
    }
  } else {
    console.warn('.env file not found at:', envPath);
  }
}
loadEnv();

const GmailProvider = require('./src/providers/GmailProvider');
const TelegramProvider = require('./src/providers/TelegramProvider');

let tray = null;
let mainWindow = null;
let isChecking = false;
let timeLeft = 60;
let timerInterval = null;
let lastTelegramMessages = []; // 用於存放最近的 Telegram 訊息快照
let latestOTP = null; // 記錄最近的一個驗證碼

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
  latestOTP = data;
  updateTray(); // 收到新碼時更新托盤
  new Notification({
    title: `${data.source} 驗證碼通知`,
    body: `來自 ${data.from} 的驗證碼: ${data.code}`,
    silent: false
  }).show();
}

// 綁定回調
gmailProvider.onNewOTP = handleNewOTP;

// Telegram 收到新訊息時，除了通知也要更新列表
function handleTelegramOTP(data) {
  handleNewOTP(data);
  // 將 Telegram 訊息轉換為與 Email 類似的格式放入快照列表
  const telegramItem = {
    id: `tg-${Date.now()}`,
    threadId: '', // Telegram 無 Thread ID
    snippet: data.body,
    subject: `Telegram 訊息: ${data.code}`,
    from: data.from,
    date: new Date().toLocaleString(),
    source: 'Telegram'
  };
  
  // 保持快照在 5 筆以內，並放在最前面
  lastTelegramMessages.unshift(telegramItem);
  if (lastTelegramMessages.length > 5) lastTelegramMessages.pop();
  
  // 即時通知前端更新列表
  if (mainWindow) {
    performEmailCheck(); // Telegram 到了，我們同步觸發一次完整檢查來合成列表
  }
}

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
  updateTray();
  tray.setToolTip('Desktop OTP Notifier');
  tray.on('double-click', () => { mainWindow.show(); });
}

function updateTray() {
  if (!tray) return;
  const template = [
    { label: '顯示主視窗', click: () => mainWindow.show() },
    { type: 'separator' }
  ];

  if (latestOTP) {
    template.push({ 
      label: `最新碼: ${latestOTP.code} (${latestOTP.source})`, 
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(latestOTP.code);
        new Notification({ title: '已複製', body: `驗證碼 ${latestOTP.code} 已複製到剪貼簿` }).show();
      } 
    });
    template.push({ type: 'separator' });
  }

  template.push({ label: '結束程式', click: () => { app.isQuitting = true; app.quit(); } });
  
  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);
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
    } else {
      emailList = [];
    }

    // 合併 Telegram 快照
    const combinedList = [...lastTelegramMessages, ...emailList];
    
    if (mainWindow) mainWindow.webContents.send('update-emails', combinedList);
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
      const botToken = config.TELEGRAM_BOT_TOKEN || config.token || config.TELEGRAM_TOKEN;
      if (botToken) {
        telegramProvider.token = botToken.trim();
        await telegramProvider.initialize();
        telegramProvider.onNewOTP = handleTelegramOTP;
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
      
      // 容錯機制：如果 config 裡面沒有 GMAIL_CREDENTIALS，但 config 本身具有 installed 或 web 屬性，
      // 就代表整個 config 就是 credentials 物件。
      const gmailCreds = config.GMAIL_CREDENTIALS || (config.installed || config.web ? config : null);
      if (!gmailCreds) {
        throw new Error('無法從雲端配置中找到 Google API 憑證 (credentials)');
      }
      
      await authorize(gmailCreds);
      
      const botToken = config.TELEGRAM_BOT_TOKEN || config.token || config.TELEGRAM_TOKEN;
      if (botToken) {
        telegramProvider.token = botToken.trim();
        await telegramProvider.initialize();
        telegramProvider.onNewOTP = handleTelegramOTP;
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
