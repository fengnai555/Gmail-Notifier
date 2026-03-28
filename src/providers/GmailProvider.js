const BaseProvider = require('./BaseProvider');
const path = require('path');
const { Notification, net } = require('electron');

class GmailProvider extends BaseProvider {
  constructor() {
    super('Gmail');
    this.lastSeenMessageId = null;
    this.isChecking = false;
    this.google = null;
    this.CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;
    this.CLOUDFLARE_AUTH_TOKEN = process.env.CLOUDFLARE_AUTH_TOKEN;
  }

  getGoogle() {
    if (!this.google) this.google = require('googleapis').google;
    return this.google;
  }

  async initialize() {
    // 這裡可以放一些初始化檢查，例如 credentials 是否存在
    console.log('GmailProvider 正在初始化...');
  }

  async start() {
    // Gmail 的 start 邏輯目前是手動或透過外部定時器觸發 check()
    // 未來可以考慮把 startTimer 的部分邏輯也整合進來
    console.log('GmailProvider 已啟動');
  }

  /**
   * 核心精準過濾邏輯
   */
  extractVerificationCode(email) {
    const text = (email.subject + ' ' + email.snippet).toLowerCase();
    const keywords = ['驗證碼', '驗證代碼', '驗證金鑰', 'otp', 'verification code', 'auth code', 'security code', '驗證', '您的代碼', '單次密碼', 'code', 'password', 'pin', 'passcode'];
    const hasKeyword = keywords.some(k => text.includes(k));
    if (!hasKeyword) return null;

    const matches = text.matchAll(/(驗證碼|code|otp|驗證|碼)[\s:：=]*([A-Za-z0-9]{4,10})/gi);
    for (const match of matches) {
      if (match && match[2]) {
        const code = match[2].trim();
        const hasDigit = /\d/.test(code);
        const excludes = ['your', 'code', 'pass', 'auth', 'this', 'test', 'will', 'is', 'the', 'for'];
        if (hasDigit && !excludes.includes(code.toLowerCase())) {
          return code;
        }
      }
    }
    const fallback = text.match(/\b\d{6,10}\b/);
    return fallback ? fallback[0] : null;
  }

  async check() {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      const { authorize } = require('../../auth');
      const auth = await authorize();
      const googleInstance = this.getGoogle();
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

        if (newestId !== this.lastSeenMessageId && this.lastSeenMessageId !== null) {
          const code = this.extractVerificationCode(newestEmail);
          if (code) {
            this.notify({
              code,
              from: newestEmail.from,
              body: newestEmail.snippet,
              timestamp: new Date().toISOString()
            });
          }
        }
        this.lastSeenMessageId = newestId;
      }
      return emailList;
    } catch (error) {
      console.error('GmailProvider check error:', error);
      throw error;
    } finally {
      this.isChecking = false;
    }
  }
}

module.exports = GmailProvider;
