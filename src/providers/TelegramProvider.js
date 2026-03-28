const BaseProvider = require('./BaseProvider');
const TelegramBot = require('node-telegram-bot-api');

class TelegramProvider extends BaseProvider {
  constructor(token) {
    super('Telegram');
    this.token = token;
    this.bot = null;
  }

  async initialize() {
    if (!this.token) {
      console.warn('TelegramProvider: 未提供 Token，將暫不啟動。');
      return;
    }
    try {
      this.bot = new TelegramBot(this.token, { polling: true });
      console.log('TelegramProvider: Bot 已成功連線。');
    } catch (error) {
      console.error('TelegramProvider 初始化失敗:', error);
    }
  }

  start() {
    if (!this.bot) return;

    this.bot.on('message', (msg) => {
      const text = msg.text;
      if (!text) return;

      // 使用與 Gmail 類似的驗證碼擷取邏輯
      const code = this.extractCode(text);
      if (code) {
        this.notify({
          code,
          from: msg.from.username || msg.from.first_name || '未知用戶',
          body: text,
          timestamp: new Date().toISOString()
        });
      }
    });

    console.log('TelegramProvider: 開始監聽訊息...');
  }

  extractCode(text) {
    const lowerText = text.toLowerCase();
    // 偵測常用關鍵字（與 Gmail 共用邏輯）
    const keywords = ['驗證碼', 'otp', 'verification', 'code', '碼'];
    const hasKeyword = keywords.some(k => lowerText.includes(k));
    
    // 優先找關鍵字後面的 4-8 位數字/英數
    const matches = lowerText.matchAll(/(驗證碼|code|otp|碼)[\s:：=]*([A-Za-z0-9]{4,10})/gi);
    for (const match of matches) {
      if (match && match[2]) {
        const code = match[2].trim();
        if (/\d/.test(code)) return code;
      }
    }

    // 次要方案：找獨立的 6-8 位純數字
    const fallback = text.match(/\b\d{6,8}\b/);
    return fallback ? fallback[0] : null;
  }

  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      console.log('TelegramProvider: 已停止監聽。');
    }
  }
}

module.exports = TelegramProvider;
