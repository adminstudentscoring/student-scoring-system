# Railway 部署设置指南

## 📋 Railway Dashboard 设置步骤

### 步骤 1: 连接 GitHub 仓库

#### 1.1 配置 GitHub App（如果显示 "No repositories found"）

1. **点击 "Configure GitHub App"**
   - 在 Railway 的 "Deploy Repository" 页面
   - 点击带有齿轮图标的 "Configure GitHub App" 按钮

2. **授权 Railway 访问 GitHub**
   - 会跳转到 GitHub 授权页面
   - 选择要授权的仓库：
     - **选项 A**: 授权所有仓库（推荐，方便后续添加项目）
     - **选项 B**: 只授权特定仓库（更安全）
   - 点击 "Install" 或 "Authorize"

3. **返回 Railway**
   - 授权完成后会自动返回 Railway
   - 现在应该能看到你的 GitHub 仓库列表

#### 1.2 选择仓库

1. **在搜索框输入仓库名称**
   - 输入你的项目仓库名称（例如：`學生計分器` 或仓库的英文名）
   - 或者直接在下拉列表中选择

2. **点击仓库名称**
   - 选择要部署的仓库

---

### 步骤 2: 创建项目

#### 2.1 项目设置

1. **项目名称**
   - Railway 会自动使用仓库名称
   - 可以修改为更友好的名称（例如：`student-scoring-system`）

2. **部署设置**
   - Railway 会自动检测 Node.js 项目
   - 会自动设置：
     - **Build Command**: `npm install`（自动检测）
     - **Start Command**: `npm start`（自动检测）

3. **点击 "Deploy"**
   - Railway 会开始部署
   - 等待部署完成（通常 2-5 分钟）

---

### 步骤 3: 配置环境变量

#### 3.1 进入环境变量设置

1. **在项目页面**
   - 点击你的项目名称进入项目详情

2. **找到 "Variables" 标签**
   - 在项目页面的顶部菜单或侧边栏
   - 点击 "Variables" 或 "Environment Variables"

#### 3.2 添加环境变量

点击 "New Variable" 或 "+" 按钮，逐个添加以下变量：

**必需的环境变量：**

1. **JWT_SECRET**
   - **Key**: `JWT_SECRET`
   - **Value**: 使用之前生成的密钥（如果没有，运行：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`）
   - **重要**: 这是安全密钥，不要泄露

2. **NODE_ENV**
   - **Key**: `NODE_ENV`
   - **Value**: `production`

3. **CORS_ORIGIN**
   - **Key**: `CORS_ORIGIN`
   - **Value**: `https://studentscoring.com,https://www.studentscoring.com`
   - **注意**: 如果还没配置域名，可以先设置为 `*`，配置域名后再更新

**数据存储路径（使用默认值）：**

4. **DATA_DIR**
   - **Key**: `DATA_DIR`
   - **Value**: `data`

5. **DATA_FILE**
   - **Key**: `DATA_FILE`
   - **Value**: `data/students.txt`

6. **SAVES_DIR**
   - **Key**: `SAVES_DIR`
   - **Value**: `data/saves`

7. **GAME_SAVES_DIR**
   - **Key**: `GAME_SAVES_DIR`
   - **Value**: `data/game-saves`

8. **RUNNING_QUEEN_LEADERBOARD_FILE**
   - **Key**: `RUNNING_QUEEN_LEADERBOARD_FILE`
   - **Value**: `data/running-queen-leaderboard.txt`

9. **ROYAL_EXCHANGE_LEADERBOARD_FILE**
   - **Key**: `ROYAL_EXCHANGE_LEADERBOARD_FILE`
   - **Value**: `data/royal-exchange-leaderboard.txt`

10. **USERS_FILE**
    - **Key**: `USERS_FILE`
    - **Value**: `data/users.txt`

11. **ORGANIZATIONS_FILE**
    - **Key**: `ORGANIZATIONS_FILE`
    - **Value**: `data/organizations.txt`

12. **JWT_EXPIRES_IN**
    - **Key**: `JWT_EXPIRES_IN`
    - **Value**: `7d`

**PORT（可选）：**
- Railway 会自动设置 PORT，通常不需要手动设置
- 如果需要，可以添加：
  - **Key**: `PORT`
  - **Value**: `3000`

#### 3.3 环境变量设置示例

完整的变量列表应该如下：

```
JWT_SECRET=你的生成的密钥（64字符）
NODE_ENV=production
CORS_ORIGIN=https://studentscoring.com,https://www.studentscoring.com
DATA_DIR=data
DATA_FILE=data/students.txt
SAVES_DIR=data/saves
GAME_SAVES_DIR=data/game-saves
RUNNING_QUEEN_LEADERBOARD_FILE=data/running-queen-leaderboard.txt
ROYAL_EXCHANGE_LEADERBOARD_FILE=data/royal-exchange-leaderboard.txt
USERS_FILE=data/users.txt
ORGANIZATIONS_FILE=data/organizations.txt
JWT_EXPIRES_IN=7d
```

---

### 步骤 4: 检查部署状态

#### 4.1 查看部署日志

1. **在项目页面**
   - 点击 "Deployments" 标签
   - 查看最新的部署状态

2. **查看日志**
   - 点击部署记录
   - 查看 "Logs" 标签
   - 确认没有错误

#### 4.2 获取部署 URL

1. **在项目页面**
   - 找到 "Settings" → "Domains"
   - 会看到 Railway 提供的域名（例如：`your-project.up.railway.app`）

2. **测试访问**
   - 访问提供的 URL
   - 确认网站正常运行

---

### 步骤 5: 配置自定义域名（studentscoring.com）

#### 5.1 在 Railway 添加域名

1. **进入域名设置**
   - 项目页面 → "Settings" → "Domains"

2. **添加自定义域名**
   - 点击 "Add Custom Domain"
   - 输入 `studentscoring.com`
   - Railway 会显示需要配置的 DNS 记录

3. **配置 DNS（在 Google Domains）**
   - 按照 `GOOGLE_DOMAINS_SETUP.md` 的步骤配置
   - 添加 CNAME 记录指向 Railway 提供的域名

4. **等待 SSL 证书**
   - Railway 会自动配置 SSL 证书
   - 等待 5-10 分钟

#### 5.2 更新 CORS_ORIGIN

1. **更新环境变量**
   - 在 Variables 页面
   - 编辑 `CORS_ORIGIN`
   - 更新为：`https://studentscoring.com,https://www.studentscoring.com`

2. **重新部署**
   - Railway 会自动重新部署
   - 或手动点击 "Redeploy"

---

## 🔧 常见问题

### 问题 1: 找不到 GitHub 仓库

**解决方案**:
- 点击 "Configure GitHub App" 授权 Railway
- 确认仓库是公开的，或者已授权给 Railway

### 问题 2: 部署失败

**检查**:
- 查看部署日志中的错误信息
- 确认 `package.json` 中有 `start` 脚本
- 确认所有依赖都已正确安装

### 问题 3: 环境变量未生效

**解决方案**:
- 确认变量名称拼写正确（区分大小写）
- 确认值没有多余的空格
- 重新部署应用

### 问题 4: 无法访问网站

**检查**:
- 确认部署状态为 "Active"
- 检查部署日志是否有错误
- 确认端口配置正确

---

## ✅ 检查清单

部署完成后，确认：

- [ ] GitHub 仓库已连接
- [ ] 项目已创建并部署成功
- [ ] 所有环境变量已设置
- [ ] JWT_SECRET 已设置为强密钥
- [ ] CORS_ORIGIN 已设置为 studentscoring.com
- [ ] 部署状态为 "Active"
- [ ] 可以访问 Railway 提供的域名
- [ ] （可选）自定义域名已配置

---

## 📝 下一步

完成 Railway 设置后：

1. ✅ 测试网站功能
2. ✅ 配置 Google Domains DNS
3. ✅ 测试自定义域名访问
4. ✅ 创建管理员账号
5. ✅ 测试所有功能

