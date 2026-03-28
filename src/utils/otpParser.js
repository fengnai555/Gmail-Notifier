/**
 * 統一的 OTP 驗證碼解析邏輯
 */
function extractOTP(text) {
  if (!text) return null;
  const lowerText = text.toLowerCase();
  
  // 1. 關鍵字過濾：確保訊息包含驗證相關字眼
  const keywords = ['驗證碼', '驗證代碼', '驗證金鑰', 'otp', 'verification code', 'auth code', 'security code', '驗證', '您的代碼', '單次密碼', 'code', 'password', 'pin', 'passcode', '碼'];
  const hasKeyword = keywords.some(k => lowerText.includes(k));
  if (!hasKeyword) return null;

  // 2. 清理干擾文字 (URL, Email)
  const cleanText = text.replace(/https?:\/\/\S+/g, '').replace(/\S+@\S+/g, '');

  // 3. 優先尋找關鍵字後面的 4-10 位英數代碼
  const keywordRegex = /(?:驗證碼|code|otp|pin|passcode|pass|碼|認證碼)(?:[\s:：=,\-]|is|are|為|是)*([A-Za-z0-9]{4,10})\b/gi;
  const matches = [...cleanText.matchAll(keywordRegex)];
  
  for (const match of matches) {
    if (match && match[1]) {
      const code = match[1].trim();
      const lowerCode = code.toLowerCase();
      // 排除常見的誤報單字
      const excludes = ['your', 'code', 'pass', 'auth', 'this', 'test', 'will', 'that', 'from', 'with', 'here', 'true', 'false', 'the', 'for', 'sign'];
      
      if (!excludes.includes(lowerCode)) {
        const hasDigit = /\d/.test(code);
        const isAllUpper = /^[A-Z0-9]+$/.test(code);
        if (hasDigit || isAllUpper) {
          return code;
        }
      }
    }
  }
  
  // 4. 次要方案：找獨立的 6-8 位純數字 (典型驗證碼)
  const fallbackDigitMatch = cleanText.match(/\b\d{6,8}\b/);
  return fallbackDigitMatch ? fallbackDigitMatch[0] : null;
}

module.exports = { extractOTP };
