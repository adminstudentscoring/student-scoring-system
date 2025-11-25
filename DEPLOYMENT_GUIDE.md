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
# 使用你的自定义域名 studentscoring.com
CORS_ORIGIN=https://studentscoring.com,https://www.studentscoring.com

# JWT Secret (使用步骤 2.1 生成的密钥)
JWT_SECRET=你的生成的密钥

# JWT Expiration
JWT_EXPIRES_IN=7d

# Users Data File
USERS_FILE=data/users.txt

# Organizations Data File
ORGANIZATIONS_FILE=data/organizations.txt
```

**注意**: 
- `CORS_ORIGIN` 应该设置为你的实际域名
- 如果暂时使用平台提供的域名，可以先设置为平台域名，配置自定义域名后再更新

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

#### 3.6 配置域名和 CORS_ORIGIN

**选项 A: 使用 Railway 提供的域名（临时）**
1. 在 Railway 环境变量中更新 `CORS_ORIGIN`
2. 设置为你的 Railway 域名：
   ```
   CORS_ORIGIN=https://your-project.up.railway.app
   ```
3. 重新部署

**选项 B: 使用自定义域名 studentscoring.com（推荐）**
1. 先完成步骤 5（配置自定义域名）
2. 配置完成后，更新 `CORS_ORIGIN`：
   ```
   CORS_ORIGIN=https://studentscoring.com,https://www.studentscoring.com
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

### 步骤 5: 配置自定义域名 (studentscoring.com)

你已经购买了域名 `studentscoring.com`，现在需要将其连接到你的部署平台。

#### 5.1 在 Google Domains 配置 DNS

1. **登录 Google Domains**
   - 访问 https://domains.google.com
   - 登录你的 Google 账号
   - 找到 `studentscoring.com` 域名

2. **添加 DNS 记录**

   根据你选择的部署平台，添加相应的 DNS 记录：

   **如果使用 Railway:**
   - 在 Google Domains 的 DNS 设置中，添加 **CNAME 记录**：
     - **名称**: `@` 或留空（表示根域名）
     - **类型**: CNAME
     - **TTL**: 3600（或默认值）
     - **数据**: `your-project.up.railway.app`（替换为 Railway 提供的域名）
   
   - 如果需要支持 `www.studentscoring.com`，再添加一条：
     - **名称**: `www`
     - **类型**: CNAME
     - **数据**: `your-project.up.railway.app`

   **如果使用 Render:**
   - 添加 CNAME 记录：
     - **名称**: `@`
     - **类型**: CNAME
     - **数据**: `your-service.onrender.com`（Render 提供的域名）

3. **等待 DNS 传播**
   - DNS 更改通常需要 5-30 分钟生效
   - 可以使用 https://dnschecker.org 检查 DNS 传播状态

#### 5.2 在部署平台配置自定义域名

**Railway:**
1. 进入你的 Railway 项目
2. 点击 "Settings" → "Domains"
3. 点击 "Add Custom Domain"
4. 输入 `studentscoring.com`
5. Railway 会自动配置 SSL 证书（HTTPS）

**Render:**
1. 进入你的 Render 服务设置
2. 点击 "Settings" → "Custom Domains"
3. 点击 "Add"
4. 输入 `studentscoring.com`
5. Render 会自动配置 SSL 证书

#### 5.3 更新 CORS_ORIGIN 环境变量

在部署平台的环境变量中，更新 `CORS_ORIGIN`：

```
CORS_ORIGIN=https://studentscoring.com,https://www.studentscoring.com
```

**重要**: 
- 确保包含 `https://` 前缀
- 如果支持 www 子域名，两个都加上
- 多个域名用逗号分隔，**不要有空格**

#### 5.4 验证配置

1. **检查 DNS 解析**
   ```bash
   # 在命令行运行（Windows PowerShell）
   nslookup studentscoring.com
   ```
   应该返回你的部署平台的 IP 地址

2. **访问网站**
   - 等待 10-30 分钟后，访问 https://studentscoring.com
   - 应该能看到你的应用

3. **检查 HTTPS**
   - 确认浏览器显示绿色锁图标
   - URL 应该是 `https://` 开头

#### 5.5 常见问题

**问题**: DNS 配置后无法访问
- **解决**: 等待更长时间（最多 48 小时），清除浏览器缓存

**问题**: SSL 证书未自动配置
- **解决**: 大多数平台（Railway/Render）会自动配置，等待 5-10 分钟

**问题**: CORS 错误仍然出现
- **解决**: 确认 `CORS_ORIGIN` 环境变量已更新，并重新部署应用

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

