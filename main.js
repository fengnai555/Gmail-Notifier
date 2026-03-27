const { app, BrowserWindow, Menu, Tray, Notification, shell, ipcMain } = require('electron');
const path = require('path');
const { google } = require('googleapis');
const { authorize } = require('./auth');

let tray = null;
let mainWindow = null;
let lastSeenMessageId = null;
let isChecking = false;
let timeLeft = 60;
let timerInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 700,
    show: true, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '顯示主視窗', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: '結束程式', click: () => {
        app.isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Gmail Notifier');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

function extractCode(text) {
  const keywords = ['驗證碼', '驗證碼為', '密碼', '碼', 'code', 'verification', 'otp', 'authentication'];
  // Optimized regex: capture the first alphanumeric word (4-10 chars) after a keyword
  const regex = new RegExp(`(${keywords.join('|')})[\\s:：=]*([A-Za-z0-9]{4,10})`, 'i');
  
  const match = text.match(regex);
  if (match && match[2]) {
    // Return the full matched code
    return match[2];
  }
  const fallbackMatch = text.match(/\b\d{6}\b/);
  return fallbackMatch ? fallbackMatch[0] : null;
}

async function listMessages(auth, maxResults = 5) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: maxResults,
  });
  return res.data.messages || [];
}

async function getMessageDetails(auth, messageId) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
  });
  
  const headers = res.data.payload.headers;
  const subject = headers.find(h => h.name === 'Subject')?.value || '(無主旨)';
  const from = headers.find(h => h.name === 'From')?.value || '(未知寄件者)';
  
  return {
    id: res.data.id,
    threadId: res.data.threadId,
    snippet: res.data.snippet,
    subject,
    from,
    date: new Date(parseInt(res.data.internalDate)).toLocaleString(),
  };
}

async function checkNewEmails() {
  if (isChecking) return;
  isChecking = true;
  timeLeft = 60; // Reset countdown after starting a check
  
  try {
    const auth = await authorize();
    const messages = await listMessages(auth, 5);
    
    const emailList = await Promise.all(
      messages.map(m => getMessageDetails(auth, m.id))
    );

    if (emailList.length > 0) {
      const newestEmail = emailList[0];
      const newestId = newestEmail.id;
      
      // ONLY notify if a code is found AND it's a new message
      if (newestId !== lastSeenMessageId && lastSeenMessageId !== null) {
        const code = extractCode(newestEmail.subject + ' ' + newestEmail.snippet);
        if (code) {
          new Notification({
            title: 'Gmail 驗證碼通知',
            body: `來自 ${newestEmail.from} 的驗證碼: ${code}`,
            silent: false,
          }).show();
        }
      }
      lastSeenMessageId = newestId;
    }

    if (mainWindow) {
      mainWindow.webContents.send('update-emails', emailList);
    }
  } catch (error) {
    console.error('Error checking emails:', error);
  } finally {
    isChecking = false;
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (mainWindow) {
      mainWindow.webContents.send('countdown-tick', timeLeft);
    }
    if (timeLeft <= 0) {
      checkNewEmails();
    }
  }, 1000);
}

app.whenReady().then(async () => {
  createWindow();
  createTray();
  
  ipcMain.on('manual-refresh', () => {
    checkNewEmails();
  });

  ipcMain.on('logout', async () => {
    try {
      const fs = require('fs').promises;
      const tokenPath = path.join(process.cwd(), 'token.json');
      await fs.unlink(tokenPath).catch(() => {});
      lastSeenMessageId = null;
      if (mainWindow) {
        mainWindow.webContents.send('update-emails', []);
      }
      await authorize();
      await checkNewEmails();
    } catch (err) {
      console.error('Logout error:', err);
    }
  });

  try {
    await authorize();
    await checkNewEmails();
    startTimer();
  } catch (err) {
    console.error('Auth error on startup:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !app.isQuitting) {
    // Keep running
  }
});
