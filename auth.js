const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

// 為了解決 Node.js 直接執行測試的問題，加入環境判斷
let app;
try {
  app = require('electron').app;
} catch (e) {
  app = null;
}

// OAuth 2.0 範疇
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

// 根據環境決定 Token 存放路徑
const TOKEN_PATH = app 
  ? path.join(app.getPath('userData'), 'token.json')
  : path.join(process.cwd(), 'token.json');

/**
 * 讀取已儲存的 Token
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * 儲存 Token
 */
async function saveCredentials(client) {
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: client._clientId,
    client_secret: client._clientSecret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * 核心授權邏輯
 */
async function authorize(credentialsObj = null) {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  if (!credentialsObj) {
    throw new Error('缺少 Google API 憑證 (credentials)');
  }

  // 1. 在暫存目錄建立一個「快閃檔案」
  const baseTempPath = app ? app.getPath('temp') : process.env.TEMP || '/tmp';
  const tempPath = path.join(baseTempPath, `cred_${Date.now()}.json`);
  
  try {
    // 2. 寫入暫存
    await fs.writeFile(tempPath, JSON.stringify(credentialsObj));

    // 3. 通過暫存檔案路徑進行驗證
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: tempPath,
    });

    if (client.credentials) {
      await saveCredentials(client);
    }
    return client;
  } finally {
    // 4. 無論成功或失敗，立即刪除暫存檔案（金鑰不落地）
    await fs.unlink(tempPath).catch(() => {});
  }
}

module.exports = {
  authorize,
};
