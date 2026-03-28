/**
 * BaseProvider 是所有驗證碼來源的基底類別。
 * 每個 Provider (如 Gmail, Telegram) 都應繼承此類別。
 */
class BaseProvider {
  constructor(name) {
    this.name = name;
    this.onNewOTP = null; // 當偵測到新驗證碼時的回調函數
  }

  /**
   * 初始化 Provider
   */
  async initialize() {
    throw new Error('initialize() must be implemented');
  }

  /**
   * 開始監聽/輪詢資料
   */
  start() {
    throw new Error('start() must be implemented');
  }

  /**
   * 停止監聽
   */
  stop() {
    // 預設可留空
  }

  /**
   * 統一的發送格式
   * @param {Object} data { code, from, source, timestamp, body }
   */
  notify(data) {
    if (this.onNewOTP) {
      this.onNewOTP({
        ...data,
        source: this.name,
        timestamp: data.timestamp || new Date().toISOString()
      });
    }
  }
}

module.exports = BaseProvider;
