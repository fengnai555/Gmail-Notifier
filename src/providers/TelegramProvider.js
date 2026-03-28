const BaseProvider = require('./BaseProvider');
const TelegramBot = require('node-telegram-bot-api');
const { extractOTP } = require('../utils/otpParser');

class TelegramProvider extends BaseProvider {
  constructor(token) {
    super('Telegram');
    this.token = token;
    this.bot = null;
    this.allowedChatIds = []; // 預留白名單功能
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

      // 簡單的白名單檢查（如果有的話）
      if (this.allowedChatIds.length > 0 && !this.allowedChatIds.includes(msg.chat.id)) {
        return;
      }

      console.log(`TelegramProvider: 收到來自 ${msg.chat.id} 的訊息`);

      // 使用統一的驗證碼擷取邏輯
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
    return extractOTP(text);
  }

  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      console.log('TelegramProvider: 已停止監聽。');
    }
  }
}

module.exports = TelegramProvider;
