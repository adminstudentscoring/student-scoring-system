# Puzzle Monster Fight - 獨立遊戲專案

這是一個獨立的 Puzzle Monster Fight 遊戲專案，可以與學生計分器系統整合使用。

## 📁 專案結構

```
puzzle-monster-fight/
├── index.html              # 遊戲主頁面
├── puzzle-monster-fight.js # 遊戲邏輯
├── styles.css             # 遊戲樣式
├── config.js              # API 配置
└── README.md             # 說明文件
```

## 🚀 快速開始

### 方式 1：從學生計分器啟動（推薦）

1. 確保學生計分器正在運行（`npm start`）
2. 在學生計分器的 Game Zone 中選擇學生
3. 點擊 "Puzzle Monster Fight" 遊戲
4. 遊戲會在新視窗中打開

### 方式 2：獨立運行

1. 確保學生計分器 API 正在運行（`npm start`）
2. 使用任何 HTTP 伺服器打開 `index.html`
   - 例如：使用 VS Code 的 Live Server
   - 或使用 Python：`python -m http.server 8080`
3. 訪問 `http://localhost:8080/puzzle-monster-fight/index.html`

## ⚙️ 配置

### API 連接配置

編輯 `config.js` 來配置 API 端點：

```javascript
const API_CONFIG = {
  baseURL: '/api',  // 同域使用相對路徑
  // 或
  baseURL: 'http://localhost:3000/api',  // 跨域使用完整 URL
};
```

### 圖片資源

遊戲需要訪問棋子圖片。如果圖片無法載入，遊戲會自動使用文字符號（♘）替代。

圖片路徑優先順序：
1. `../public/assets/pieces/white_Knight.png`（從獨立專案訪問）
2. `/assets/pieces/white_Knight.png`（從主系統訪問）
3. `assets/pieces/white_Knight.png`（相對路徑）

## 🔗 與學生計分器整合

### 整合方式

遊戲通過以下方式與學生計分器整合：

1. **API 通信**：通過 REST API 與學生計分器通信
2. **數據共享**：通過 localStorage 共享學生數據
3. **URL 參數**：可選的 URL 參數傳遞學生信息

### API 端點

遊戲使用以下 API 端點：

- `GET /api/students` - 獲取學生列表
- `POST /api/students/:id/answer` - 記錄學生答題分數
- `POST /api/game/input-puzzle-points` - 輸入拼圖分數（如果與 Monster Fight 整合）
- `POST /api/game/player-action` - 玩家行動（如果與 Monster Fight 整合）

## 🎮 遊戲玩法

1. **選擇起始位置**：點擊棋盤上的任意寶石位置設置騎士起始位置
2. **開始回合**：點擊 "Start Turn" 按鈕開始回合
3. **移動騎士**：使用騎士移動（L 形移動）來消耗寶石
4. **連鎖反應**：當三個或更多相同元素的寶石連在一起時會觸發連鎖反應
5. **計時**：每回合有 20 秒時間

## 🛠️ 開發

### 修改遊戲邏輯

編輯 `puzzle-monster-fight.js` 來修改遊戲邏輯。

### 修改樣式

編輯 `styles.css` 來修改遊戲外觀。

### 添加新功能

1. 在 `puzzle-monster-fight.js` 中添加新功能
2. 在 `styles.css` 中添加對應樣式
3. 如果需要 API 調用，在 `config.js` 中添加端點配置

## 📝 注意事項

1. **CORS 設置**：如果遊戲在不同端口運行，確保學生計分器的 `server.js` 已配置 CORS
2. **圖片路徑**：確保圖片路徑正確，或遊戲會使用文字符號替代
3. **API 連接**：遊戲啟動時會自動檢查 API 連接狀態

## 🔧 故障排除

### API 連接失敗

- 檢查學生計分器是否正在運行
- 檢查 `config.js` 中的 `baseURL` 配置
- 檢查瀏覽器控制台的錯誤信息

### 圖片無法載入

- 檢查圖片路徑是否正確
- 遊戲會自動使用文字符號（♘）替代圖片

### 遊戲無法啟動

- 檢查瀏覽器控制台的錯誤信息
- 確保所有文件都已正確載入
- 檢查 `index.html` 中的腳本引用路徑

## 📄 授權

此專案與學生計分器系統共享相同的授權。

## 🤝 貢獻

歡迎提交問題和改進建議！

