# Desktop OTP Notifier 📧

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/fengnai555/Gmail-Notifier)
[![Electron](https://img.shields.io/badge/platform-Electron-blue.svg)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一個優雅、高效的 Gmail 桌面通知工具，內建強大的 **驗證碼 (OTP) 自動辨識與一鍵複製** 功能。

> [!WARNING]
> **目前暫時不開放外部使用者登入**
> 本應用程式目前正在進行 Google Auth Platform 品牌驗證與 Google Search Console 網域所有權審核。在審核通過之前，非測試白名單使用者可能會遇到「應用程式未經驗證」的警告或無法登入。待審核通過後將正式全面開放。

---


## ✨ 核心特色

- 🎯 **智慧驗證碼辨識**：自動識別郵件主旨與摘要中的 4-8 位英數驗證碼。
- 📋 **一鍵複製**：專屬「複製驗證碼」按鈕，不開網頁也能快速提取代碼。
- 📥 **即時通知**：偵測到驗證碼郵件時觸發 Windows 系統原生通知。
- 🔄 **實時同步**：60 秒自動輪詢與手動刷新按鈕。
- 👤 **帳號管理**：支援快捷登出與切換多個 Google 帳號。
- 📥 **背景執行**：最小化至系統托盤（System Tray），靜默守護。

---

## 🚀 快速上手

### 1. 準備金鑰 (Credentials)
本程式需要 Google API 權限才能運行：
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立新專案並開啟 **Gmail API**。
3. 建立並下載 **OAuth 2.0 用戶端 ID** 的 JSON 檔案。
4. 將該檔案重命名為 `credentials.json` 並放入專案根目錄。

### 2. 安裝環境
確保您已安裝 Node.js 與 pnpm：
```bash
pnpm install
```

### 3. 啟動開發模式
```bash
pnpm start
```
*首次啟動會要求在瀏覽器授權登入您的 Gmail。*

### 4. 打包生產版本
```bash
pnpm build
```
產出的 `.exe` 安裝檔將位於 `dist` 資料夾中。

### 📦 發佈檔案說明 (Releases)
在 GitHub 的 Releases 頁面中，您會看到以下兩種主要檔案：
1. **`otp-notifier Setup X.X.X.exe`**：這是標準的**安裝版** (Installer)。執行後會將程式安裝到您的電腦中並建立捷徑，適合固定使用的電腦。
2. **`otp-notifier X.X.X.exe`**：這是**免安裝綠色版** (Portable)。無需安裝，點擊即可直接執行，適合放在隨身碟或不想要更動系統設定的使用者。

---

## 🛠️ 開發與配置

- **主要框架**：Electron
- **資料來源**：Gmail API (Googleapis)
- **認證流程**：Google OAuth2 
- **狀態管理**：IPC (Main Process <-> Renderer Process)

---

## 🔒 安全注意事項

- **本倉庫已保護個人隱私**：`.gitignore` 已設定自動排除 `credentials.json` 與 `token.json`。
- **請勿將您的權杖上傳至 GitHub**，以免信箱遭受存取。

## 📄 授權協議

本專案基於 [MIT License](LICENSE) 開放使用。
