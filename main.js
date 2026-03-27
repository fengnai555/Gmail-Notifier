const { app, BrowserWindow, Menu, Tray, Notification, shell, ipcMain, net } = require('electron');
const path = require('path');

// 延遲載入大型套件，加速啟動
let google = null;
function getGoogle() {
  if (!google) google = require('googleapis').google;
  return google;
}

let tray = null;
let mainWindow = null;
let lastSeenMessageId = null;
let isChecking = false;
let timeLeft = 60;
let timerInterval = null;

// 您部署在 Cloudflare 的 URL 及 Token
const CLOUDFLARE_WORKER_URL = 'https://gmail-notifier-proxy.fengnai555.workers.dev';
const CLOUDFLARE_AUTH_TOKEN = 'GMAIL_NOTIFIER_RANDOM_TOKEN_2024';

let cachedCredentials = null; 

async function fetchCredentials() {
  if (cachedCredentials) return cachedCredentials;
  
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url: CLOUDFLARE_WORKER_URL
    });
    request.setHeader('Authorization', `Bearer ${CLOUDFLARE_AUTH_TOKEN}`);
    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            cachedCredentials = JSON.parse(data);
            resolve(cachedCredentials);
          } catch (e) { reject(new Error('JSON 解析失敗')); }
        } else { reject(new Error(`HTTP ${response.statusCode}`)); }
      });
    });
    request.on('error', (error) => { reject(error); });
    request.end();
    setTimeout(() => { reject(new Error('連線超時')); }, 10000);
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

/**
 * 核心精準過濾邏輯：只有確定是「驗證碼」相關性質才觸發通知
 */
function extractVerificationCode(email) {
  const text = (email.subject + ' ' + email.snippet).toLowerCase();
  
  // 1. 強制關鍵字匹配 (主旨或內容必須含有以下任一關鍵字)
  const keywords = ['驗證碼', '驗證代碼', '驗證金鑰', 'otp', 'verification code', 'auth code', 'security code', '驗證', '您的代碼', '單次密碼', 'code', 'password', 'pin', 'passcode'];
  const hasKeyword = keywords.some(k => text.includes(k));
  if (!hasKeyword) return null;

  // 2. 在關鍵字周圍尋找代碼
  // 使用全域搜尋，避免第一個匹配項是錯誤的單字
  const matches = text.matchAll(/(驗證碼|code|otp|驗證|碼)[\s:：=]*([A-Za-z0-9]{4,10})/gi);
  
  for (const match of matches) {
    if (match && match[2]) {
      const code = match[2].trim();
      // 終極檢查：必須包含數字，且不能是常見關鍵字
      const hasDigit = /\d/.test(code);
      const excludes = ['your', 'code', 'pass', 'auth', 'this', 'test', 'will', 'is', 'the', 'for'];
      if (hasDigit && !excludes.includes(code.toLowerCase())) {
        return code;
      }
    }
  }

  // 3. 如果沒找到，退而求其次尋找獨立的 6-10 位純數字
  const fallback = text.match(/\b\d{6,10}\b/);
  return fallback ? fallback[0] : null;
}

// 郵件相關邏輯改用延遲載入的 google 物件
async function checkNewEmails() {
  if (isChecking) return;
  isChecking = true;
  timeLeft = 60;
  try {
    const { authorize } = require('./auth');
    const auth = await authorize();
    const googleInstance = getGoogle();
    const gmail = googleInstance.gmail({ version: 'v1', auth });
    
    const res = await gmail.users.messages.list({ userId: 'me', maxResults: 5 });
    const messages = res.data.messages || [];
    
    const emailList = await Promise.all(messages.map(async (m) => {
      const detail = await gmail.users.messages.get({ userId: 'me', id: m.id });
      const headers = detail.data.payload.headers;
      return {
        id: detail.data.id,
        threadId: detail.data.threadId,
        snippet: detail.data.snippet,
        subject: headers.find(h => h.name === 'Subject')?.value || '(無主旨)',
        from: headers.find(h => h.name === 'From')?.value || '(未知)',
        date: new Date(parseInt(detail.data.internalDate)).toLocaleString(),
      };
    }));

    if (emailList.length > 0) {
      const newestEmail = emailList[0];
      const newestId = newestEmail.id;
      
      if (newestId !== lastSeenMessageId && lastSeenMessageId !== null) {
        // 使用精準過濾
        const code = extractVerificationCode(newestEmail);
        if (code) {
          new Notification({ 
            title: 'Gmail 驗證碼通知', 
            body: `來自 ${newestEmail.from} 的驗證碼: ${code}`,
            silent: false
          }).show();
        }
      }
      lastSeenMessageId = newestId;
    }
    if (mainWindow) mainWindow.webContents.send('update-emails', emailList);
  } catch (error) { console.error('Email check error:', error); } finally { isChecking = false; }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    // 安全檢查：視窗必須存在且未被銷毀
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('countdown-tick', timeLeft);
    }
    if (timeLeft <= 0) checkNewEmails();
  }, 1000);
}

// 程式啟動
app.whenReady().then(() => {
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
      const { authorize } = require('./auth');
      await authorize();
      await checkNewEmails();
      startTimer();
      mainWindow.webContents.send('login-status', true);
    } catch {
      mainWindow.webContents.send('login-status', false);
    }
  });

  ipcMain.on('login', async () => {
    try {
      mainWindow.webContents.send('auth-status', '正在載入雲端金鑰...');
      const credentials = await fetchCredentials();
      const { authorize } = require('./auth');
      await authorize(credentials);
      await checkNewEmails();
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
    lastSeenMessageId = null;
    mainWindow.webContents.send('login-status', false);
  });

  ipcMain.on('manual-refresh', async () => {
    await checkNewEmails();
  });
});

app.on('will-quit', () => {
  if (timerInterval) clearInterval(timerInterval);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
