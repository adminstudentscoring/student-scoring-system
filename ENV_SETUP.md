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

#### Postgres（Railway）
本專案已內建 `pg`，可直接連 Railway Postgres。

- **Railway 部署（同一個 Project 內）**：使用 `DATABASE_URL`（通常是 internal，例如包含 `railway.internal`）
- **本機開發連 Railway**：使用 `DATABASE_PUBLIC_URL`（通常需要 SSL）

可用的環境變數：
- `DATABASE_URL`（推薦，Railway runtime）
- `DATABASE_PUBLIC_URL`（本機開發用）
- 或使用 `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`（可選）

驗證連線（本機）：
```bash
npm run db:ping
```

跑 migration（本機或 Railway）：
```bash
npm run db:migrate
```

> 注意：`DB_AUTO_MIGRATE=1` 會在伺服器啟動時自動跑 migrations。未準備好前建議保持 `0`，用 `npm run db:migrate` 手動跑。

#### Blunders（Postgres 進階）
本專案提供 **Blunders（不含 master）** 的 Postgres 表結構與匯入腳本（先做資料入庫，之後再逐步把 API 切去 DB）。

1) 套用最新 migrations（會建立 blunders tables）：
```bash
npm run db:migrate
```

2) 匯入現有 JSON 題庫/進度到 Postgres：
```bash
npm run blunders:import-db
```

3) （可選）Teacher All blunders 改用 Postgres 查詢（預設關閉）：
```text
BLUNDERS_USE_DB=1
```

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

