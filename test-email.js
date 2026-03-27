const { google } = require('googleapis');
const { authorize } = require('./auth');
const https = require('https');

// 您部署在 Cloudflare 的 URL 及 Token
const CLOUDFLARE_WORKER_URL = 'https://gmail-notifier-proxy.fengnai555.workers.dev';
const CLOUDFLARE_AUTH_TOKEN = 'GMAIL_NOTIFIER_RANDOM_TOKEN_2024';

/**
 * 在 Node.js 環境下獨立抓取雲端金鑰
 */
async function fetchCredentialsNode() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'Authorization': `Bearer ${CLOUDFLARE_AUTH_TOKEN.trim()}` }
    };
    https.get(CLOUDFLARE_WORKER_URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

function genRandomNumber() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function genRandomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 發送測試郵件
 */
async function sendTypedEmail(typeIndex) {
  try {
    let credentials = null;
    try {
      credentials = await fetchCredentialsNode();
    } catch (e) {
      // 靜默處理，給 authorize 去判斷 token.json
    }

    const auth = await authorize(credentials);
    const gmail = google.gmail({ version: 'v1', auth });

    const profile = await gmail.users.getProfile({ userId: 'me' });
    const myEmail = profile.data.emailAddress;

    let subject = '';
    let body = '';
    const randNum = genRandomNumber();
    const randCode = genRandomCode(8);

    const mode = typeIndex % 4;
    // 註解掉不需要的測試，只保留英文與 OTP
    if (mode === 0 || mode === 2) {
      const typeStr = mode === 0 ? '中文' : '安全';
      console.log(`\r⏭️  [跳過測試] 類型 ${mode}: ${typeStr}        `);
      return false; 
    }

    switch (mode) {
      case 1:
        subject = `[測試1-英文] Your Code`;
        body = `Your secure code is: ${randCode}`;
        break;
      case 3:
        subject = `[測試3-OTP] Passcode`;
        body = `Code: ${genRandomNumber()}`;
        break;
    }

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const messageParts = [
      `From: Gmail Notifier Test <${myEmail}>`,
      `To: ${myEmail}`,
      `Subject: ${utf8Subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ];
    
    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
    console.log(`\n✅ 已發送類型 ${typeIndex % 4}: «${subject}»`);
    return true;
  } catch (error) {
    console.error(`\n❌ 發信失敗: ${error.message}`);
    if (error.message.includes('Login Required')) {
      console.log('提示: 請先刪除目錄下的 token.json 並重新啟動腳本進行登入。');
    }
    return false;
  }
}

async function startRotatedLoopWithCountdown() {
  console.log('\n--- Gmail Notifier 倒數輪播測試啟動 ---');
  let count = 0;
  
  while (true) {
    // 執行發信
    const isSent = await sendTypedEmail(count++);
    
    // 如果沒有發信(例如被跳過)，就不倒數，立刻進入下一輪
    if (!isSent) {
      continue;
    }

    // 倒數 60 秒
    for (let i = 60; i > 0; i--) {
      process.stdout.write(`\r⏳ 下一次發信倒數: ${i} 秒...   `);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

startRotatedLoopWithCountdown();
