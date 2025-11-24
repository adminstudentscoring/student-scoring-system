# 環境變數設置指南

## 快速開始

### 1. 安裝依賴
```bash
npm install
```

### 2. 創建 .env 文件

**方法 A：手動創建（推薦）**
1. 複製 `env.example` 文件並重命名為 `.env`
2. 根據需要修改配置值

**方法 B：使用命令行（Windows PowerShell）**
```powershell
Copy-Item env.example .env
```

**方法 C：使用命令行（Mac/Linux）**
```bash
cp env.example .env
```

### 3. 配置說明

`.env` 文件中的配置項說明：

#### 基本配置
- `PORT=3000` - 服務器端口（默認：3000）
- `NODE_ENV=development` - 運行環境（development/production）

#### 數據存儲路徑
所有路徑都是相對於項目根目錄的：
- `DATA_DIR=data` - 數據目錄
- `DATA_FILE=data/students.txt` - 學生數據文件
- `SAVES_DIR=data/saves` - 保存文件目錄
- `GAME_SAVES_DIR=data/game-saves` - 遊戲保存目錄

#### CORS 配置
- `CORS_ORIGIN=*` - 允許的來源（`*` 表示所有，生產環境建議設置具體域名）

### 4. 運行服務器

```bash
npm start
```

服務器會自動讀取 `.env` 文件中的配置。

## 生產環境設置

部署到生產環境時：

1. **設置 NODE_ENV**
   ```
   NODE_ENV=production
   ```

2. **設置 CORS_ORIGIN**
   ```
   CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
   ```

3. **設置 PORT**（如果部署平台需要）
   ```
   PORT=8080
   ```

## 注意事項

- `.env` 文件已添加到 `.gitignore`，不會被提交到 Git
- 不要將 `.env` 文件分享給他人（包含敏感信息）
- 使用 `env.example` 作為模板分享配置結構

## 故障排除

如果服務器無法啟動：
1. 確認 `.env` 文件存在於項目根目錄
2. 確認已運行 `npm install` 安裝 dotenv
3. 檢查 `.env` 文件格式是否正確（每行一個配置，使用 `KEY=VALUE` 格式）

