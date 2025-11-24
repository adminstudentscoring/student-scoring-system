# 部署指南 (Deployment Guide)

## 📋 部署前准备清单

### 1. 代码准备
- [x] 所有功能已测试完成
- [x] 环境变量配置已设置
- [x] 依赖包已安装 (`npm install`)
- [ ] 创建生产环境的 `.env` 文件
- [ ] 生成安全的 JWT_SECRET

### 2. 数据备份
- [ ] 备份 `data/` 目录下的所有文件
- [ ] 备份 `.env` 文件（如果已创建）

---

## 🚀 部署步骤

### 步骤 1: 选择部署平台

推荐平台（按易用性排序）：

#### 选项 A: Railway (推荐新手)
- ✅ 免费额度充足
- ✅ 自动 HTTPS
- ✅ 简单易用
- ✅ 支持文件存储
- 网址: https://railway.app

#### 选项 B: Render
- ✅ 免费套餐可用
- ✅ 自动部署
- ✅ 简单配置
- 网址: https://render.com

#### 选项 C: Heroku
- ✅ 成熟稳定
- ⚠️ 免费套餐已取消
- 网址: https://heroku.com

#### 选项 D: DigitalOcean / AWS / Azure
- ✅ 完全控制
- ⚠️ 需要更多技术知识
- ⚠️ 需要配置服务器

---

### 步骤 2: 准备生产环境配置

#### 2.1 生成 JWT Secret

在本地运行以下命令生成安全的密钥：

**Windows PowerShell:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Mac/Linux:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

复制生成的密钥，稍后用于 `.env` 文件。

#### 2.2 创建生产环境 `.env` 文件

创建 `.env.production` 文件（或直接在部署平台设置环境变量）：

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Data Storage Paths
DATA_DIR=data
DATA_FILE=data/students.txt
SAVES_DIR=data/saves
GAME_SAVES_DIR=data/game-saves
RUNNING_QUEEN_LEADERBOARD_FILE=data/running-queen-leaderboard.txt
ROYAL_EXCHANGE_LEADERBOARD_FILE=data/royal-exchange-leaderboard.txt

# CORS Configuration
# 替换为你的实际域名，例如：
# CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
CORS_ORIGIN=*

# JWT Secret (使用步骤 2.1 生成的密钥)
JWT_SECRET=你的生成的密钥

# JWT Expiration
JWT_EXPIRES_IN=7d

# Users Data File
USERS_FILE=data/users.txt

# Organizations Data File
ORGANIZATIONS_FILE=data/organizations.txt
```

---

### 步骤 3: 部署到 Railway (推荐)

#### 3.1 注册和登录
1. 访问 https://railway.app
2. 使用 GitHub 账号登录（推荐）

#### 3.2 创建新项目
1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 选择你的代码仓库（如果没有，先推送到 GitHub）

#### 3.3 配置环境变量
1. 在项目设置中找到 "Variables"
2. 添加所有 `.env` 文件中的变量
3. **重要**: 设置 `JWT_SECRET` 为步骤 2.1 生成的密钥
4. 设置 `NODE_ENV=production`
5. 设置 `CORS_ORIGIN` 为你的域名（部署后会提供）

#### 3.4 配置启动命令
在 Railway 项目设置中：
- Build Command: `npm install`
- Start Command: `npm start`

#### 3.5 部署
1. Railway 会自动检测到代码变更并部署
2. 等待部署完成（通常 2-5 分钟）
3. 获取提供的域名（例如：`your-project.up.railway.app`）

#### 3.6 更新 CORS_ORIGIN
1. 在 Railway 环境变量中更新 `CORS_ORIGIN`
2. 设置为你的 Railway 域名：
   ```
   CORS_ORIGIN=https://your-project.up.railway.app
   ```
3. 重新部署

---

### 步骤 4: 部署到 Render

#### 4.1 创建 Web Service
1. 访问 https://render.com
2. 点击 "New +" → "Web Service"
3. 连接你的 GitHub 仓库

#### 4.2 配置设置
- **Name**: 你的服务名称
- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free（或选择付费计划）

#### 4.3 设置环境变量
在 "Environment" 标签页添加所有环境变量（参考步骤 2.2）

#### 4.4 部署
1. 点击 "Create Web Service"
2. 等待部署完成
3. 获取提供的 URL

---

### 步骤 5: 自定义域名（可选）

#### 5.1 购买域名
- Namecheap: https://www.namecheap.com
- GoDaddy: https://www.godaddy.com
- Google Domains: https://domains.google

#### 5.2 配置 DNS
1. 在域名注册商处添加 CNAME 记录
2. 指向你的部署平台提供的域名
3. 等待 DNS 传播（通常 5-30 分钟）

#### 5.3 在部署平台配置域名
- **Railway**: Settings → Domains → Add Custom Domain
- **Render**: Settings → Custom Domains → Add

#### 5.4 更新 CORS_ORIGIN
更新环境变量中的 `CORS_ORIGIN` 为你的自定义域名

---

### 步骤 6: 初始化管理员账号

部署完成后，需要创建第一个管理员账号：

#### 方法 A: 使用初始化脚本（推荐）

如果部署平台支持 SSH 访问：
```bash
npm run init-admin
```

然后按提示输入管理员信息。

#### 方法 B: 手动创建（如果脚本不可用）

1. 访问你的网站：`https://your-domain.com`
2. 注册一个组织账号
3. 在数据库中手动将该账号的 `role` 改为 `admin`

---

## ✅ 部署后检查清单

### 功能测试
- [ ] 访问首页，检查是否正常加载
- [ ] 测试组织注册功能
- [ ] 测试登录功能
- [ ] 测试创建老师和学生
- [ ] 测试学生分配功能
- [ ] 测试分数修改功能
- [ ] 测试 Class View 功能
- [ ] 测试游戏功能

### 安全检查
- [ ] 确认 `JWT_SECRET` 已设置为强密钥
- [ ] 确认 `CORS_ORIGIN` 已设置为具体域名（不是 `*`）
- [ ] 确认 `NODE_ENV=production`
- [ ] 确认 `.env` 文件未提交到 Git

### 性能检查
- [ ] 检查页面加载速度
- [ ] 检查 API 响应时间
- [ ] 检查 WebSocket 连接是否正常

---

## 🔧 常见问题排查

### 问题 1: 部署后无法访问
**解决方案:**
- 检查端口配置是否正确
- 检查防火墙设置
- 确认服务正在运行

### 问题 2: CORS 错误
**解决方案:**
- 检查 `CORS_ORIGIN` 环境变量
- 确认域名格式正确（包含 `https://`）
- 多个域名用逗号分隔

### 问题 3: 认证失败
**解决方案:**
- 检查 `JWT_SECRET` 是否设置
- 确认密钥长度足够（至少 32 字符）
- 检查 token 是否过期

### 问题 4: 数据丢失
**解决方案:**
- 检查文件存储路径是否正确
- 确认部署平台支持持久化存储
- 考虑迁移到数据库（如 MongoDB、PostgreSQL）

---

## 📊 监控和维护

### 日志查看
- **Railway**: 在项目页面查看 "Logs"
- **Render**: 在服务页面查看 "Logs"

### 数据备份
定期备份 `data/` 目录：
- 手动下载数据文件
- 或设置自动备份脚本

### 更新部署
1. 在本地修改代码
2. 推送到 GitHub
3. 部署平台会自动检测并重新部署

---

## 🆘 需要帮助？

如果遇到问题：
1. 检查部署平台的文档
2. 查看服务器日志
3. 检查环境变量配置
4. 确认所有依赖已正确安装

---

## 📝 下一步

部署完成后，建议：
1. ✅ 测试所有功能
2. ✅ 创建用户使用文档
3. ✅ 设置定期备份
4. ✅ 监控系统性能
5. 🔜 后续添加时间表班别功能

