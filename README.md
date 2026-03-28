# Desktop OTP Notifier 📧✈️

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/fengnai555/Gmail-Notifier)
[![Electron](https://img.shields.io/badge/platform-Electron-blue.svg)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一個優雅、高效的**多來源 (Multi-Source) 桌面驗證碼通知中心**。
不只支援 Gmail，更能透過 Telegram Bot 完美串接手機簡訊與其他來源，內建強大的 **OTP 自動辨識引擎**與**一鍵複製**功能。

> [!WARNING]
> **目前暫時不開放外部使用者登入 (Gmail)**
> 本應用程式目前正在進行 Google Auth Platform 品牌驗證與 Google Search Console 網域所有權審核。在審核通過之前，非測試白名單使用者可能會遇到「應用程式未經驗證」的警告或無法登入。待審核通過後將正式全面開放。

---

## ✨ 核心特色

- 🎯 **雙平台無縫聚合**：完美支援 Gmail 掃描與 Telegram Bot 即時監聽，桌面統一收納。
- 🧠 **智慧驗證碼引擎**：採用統一正則過濾邏輯，精準識別 4-10 位英數驗證碼，排除無效單字。
- 📋 **一鍵複製與接力**：無論是信件內文還是 Telegram 轉傳，點擊即可由電腦直接複製，無需手動輸入。
- ☁️ **雲端安全配置**：透過 Cloudflare Worker 實作遠端 Proxy，將 Google JSON 金鑰與 Telegram Token 抽離，提升金鑰安全性。
- 📥 **常駐守護 (Tray)**：完美最小化至系統托盤，滑鼠右鍵即可快速檢視/複製最新驗證碼。
- 🔄 **實時同步**：60 秒輪詢 Gmail，Telegram 訊息零秒延遲即時推送。

---

## 🚀 快速上手

### 1. 準備金鑰與雲端設定
本程式設計為不將金鑰寫死在客戶端，請透過自建 Cloudflare Worker 進行 Proxy：
1. 準備您的 **Google OAuth 2.0 JSON 憑證** 與 **Telegram Bot Token** (@BotFather 申請)。
2. 在專案的 `server/` 資料夾中進行 `pnpm run deploy` 發布至 Cloudflare。
3. 透過 `wrangler secret put` 將上述金鑰存入 Cloudflare Worker 的環境變數中。

### 2. 環境變數設定
在專案根目錄建立 `.env` 檔案，並填入以下資訊：
```env
CLOUDFLARE_WORKER_URL=https://您的-worker-網址.workers.dev
CLOUDFLARE_AUTH_TOKEN=您的_隨機_驗證_Token
```

### 3. 安裝與啟動
確保您已安裝 Node.js 與 pnpm：
```bash
pnpm install
pnpm start
```
*首次啟動會要求在瀏覽器授權登入您的 Google 帳號。*

### 4. 打包生產版本
```bash
pnpm build
```
產出的 `.exe` 檔案將位於 `dist` 資料夾中，支援安裝版 (Setup) 與免安裝綠色版 (Portable)。

---

## 🛠️ 架構設計

本專案採用高度模組化架構，以利未來靈活擴展新來源（如 Discord, LINE 等）：

- **前端應用**：Vanilla JS + HTML + CSS，輕巧且無多餘依賴。
- **後端控制**：Electron Main Process。
- **提供者模組 (Providers)**：
  - `BaseProvider`：定義統一的通知與啟動介面。
  - `GmailProvider`：負責呼叫 Gmail API 並追蹤最新信件。
  - `TelegramProvider`：負責建立 Polling 連線以擷取外部聊天室內容。
- **雲端轉發 (Proxy)**：Cloudflare Worker (`hono` 框架)，保護核心金鑰不外洩。

---

## 🔒 安全注意事項

- **本倉庫已保護個人隱私**：`.gitignore` 預設排除 `.env`、`credentials.json` 與 `token.json`。
- **請勿將您的權杖與 Token 上傳至 GitHub**，所有高權限金鑰強烈建議一律放在 Cloudflare Secrets。

## 📄 授權協議

本專案基於 [MIT License](LICENSE) 開放使用。
