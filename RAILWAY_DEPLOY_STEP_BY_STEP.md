# Railway 部署详细步骤（一步一步）

## 📋 前置准备

### 步骤 0: 确保代码已推送到 GitHub

**如果还没有 Git 仓库：**

1. **初始化 Git 仓库**（如果还没有）
   ```bash
   git init
   git add .
   git commit -m "Initial commit for deployment"
   ```

2. **推送到 GitHub**
   - 在 GitHub 创建新仓库（如果还没有）
   - 然后运行：
   ```bash
   git remote add origin https://github.com/你的用户名/你的仓库名.git
   git branch -M main
   git push -u origin main
   ```

**如果已经有 Git 仓库：**
- 确保最新代码已推送到 GitHub：
  ```bash
  git add .
  git commit -m "Ready for deployment"
  git push
  ```

---

## 🚀 Railway 部署步骤（详细版）

### 步骤 1: 登录 Railway

1. **访问 Railway**
   - 打开浏览器，访问：https://railway.app
   - 点击右上角的 **"Login"** 或 **"Get Started"**

2. **选择登录方式**
   - 推荐：点击 **"Login with GitHub"**
   - 这会使用你的 GitHub 账号登录

3. **授权 Railway**
   - GitHub 会询问是否授权 Railway
   - 点击 **"Authorize Railway"** 或 **"授权"**

---

### 步骤 2: 创建新项目

1. **进入 Dashboard**
   - 登录后，你会看到 Railway Dashboard
   - 点击左上角的 **"New Project"** 按钮（通常是紫色/蓝色的按钮）

2. **选择部署方式**
   - 你会看到几个选项：
     - **"Deploy from GitHub repo"** ← 选择这个
     - "Deploy from template"
     - "Empty Project"

3. **点击 "Deploy from GitHub repo"**

---

### 步骤 3: 连接 GitHub 仓库

#### 情况 A: 如果看到 "No repositories found"

1. **点击 "Configure GitHub App"**
   - 页面会显示 "No repositories found - try a different search"
   - 点击带有齿轮图标的 **"Configure GitHub App"** 按钮

2. **在 GitHub 授权页面**
   - 选择要授权的仓库：
     - **推荐**: 选择 **"All repositories"**（方便后续）
     - 或者只选择你的项目仓库
   - 点击 **"Install"** 或 **"授权"**

3. **返回 Railway**
   - 授权完成后会自动返回 Railway
   - 现在应该能看到你的仓库列表了

#### 情况 B: 如果已经授权过

1. **在搜索框输入仓库名称**
   - 在 "What would you like to deploy today?" 输入框
   - 输入你的仓库名称（例如：`學生計分器` 或仓库的英文名）

2. **选择仓库**
   - 从下拉列表中选择你的仓库
   - 或者直接点击仓库卡片

---

### 步骤 4: 配置项目设置

1. **项目名称**（可选）
   - Railway 会自动使用仓库名称
   - 可以修改为更友好的名称（例如：`student-scoring-system`）

2. **Railway 会自动检测**
   - Railway 会自动识别这是 Node.js 项目
   - 会自动设置：
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - **你不需要手动设置这些**（除非有特殊需求）

3. **点击 "Deploy" 按钮**
   - 页面底部或右侧会有一个 **"Deploy"** 按钮
   - 点击它开始部署

---

### 步骤 5: 等待部署开始

1. **查看部署进度**
   - 点击部署后，会跳转到项目页面
   - 你会看到部署进度条
   - 状态会显示：Building → Deploying → Active

2. **查看日志**（可选）
   - 点击 **"View Logs"** 可以看到部署过程
   - 正常情况下会看到：
     - `npm install` 安装依赖
     - `npm start` 启动服务器

3. **等待完成**
   - 通常需要 2-5 分钟
   - 当状态变为 **"Active"** 时，部署完成

---

### 步骤 6: 获取部署 URL

1. **找到域名**
   - 在项目页面，点击 **"Settings"** 标签
   - 然后点击 **"Domains"** 子标签
   - 你会看到 Railway 提供的域名（例如：`your-project.up.railway.app`）

2. **测试访问**
   - 点击域名链接
   - 或者复制域名在浏览器中访问
   - 如果看到你的网站，说明部署成功！

---

### 步骤 7: 配置环境变量（重要！）

**在部署完成后，立即配置环境变量：**

1. **进入环境变量设置**
   - 在项目页面，点击 **"Variables"** 标签
   - 或者点击 **"Settings"** → **"Variables"**

2. **添加变量**
   - 点击 **"New Variable"** 或 **"+"** 按钮
   - 逐个添加以下变量：

**必须添加的变量：**

```
JWT_SECRET = [生成密钥，见下方]
NODE_ENV = production
CORS_ORIGIN = https://studentscoring.com,https://www.studentscoring.com
DATA_DIR = data
DATA_FILE = data/students.txt
SAVES_DIR = data/saves
GAME_SAVES_DIR = data/game-saves
RUNNING_QUEEN_LEADERBOARD_FILE = data/running-queen-leaderboard.txt
ROYAL_EXCHANGE_LEADERBOARD_FILE = data/royal-exchange-leaderboard.txt
USERS_FILE = data/users.txt
ORGANIZATIONS_FILE = data/organizations.txt
JWT_EXPIRES_IN = 7d
```

3. **生成 JWT_SECRET**
   - 在本地 PowerShell 运行：
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   - 复制生成的密钥
   - 在 Railway 中添加为 `JWT_SECRET` 的值

4. **保存并重新部署**
   - 添加完所有变量后
   - Railway 会自动重新部署（或手动点击 "Redeploy"）

---

## 🎯 你现在在哪一步？

请告诉我你现在的情况：

1. **已经登录 Railway 了吗？**
   - ✅ 是 → 继续步骤 2
   - ❌ 否 → 先完成步骤 1

2. **看到 "New Project" 按钮了吗？**
   - ✅ 是 → 点击它，继续步骤 2
   - ❌ 否 → 告诉我你看到了什么

3. **已经选择了 GitHub 仓库吗？**
   - ✅ 是 → 继续步骤 4（配置项目）
   - ❌ 否 → 完成步骤 3（连接 GitHub）

4. **部署已经开始了吗？**
   - ✅ 是 → 等待完成，然后继续步骤 7（配置环境变量）
   - ❌ 否 → 告诉我卡在哪一步

---

## 🆘 遇到问题？

**问题 1: 找不到 GitHub 仓库**
- 解决：点击 "Configure GitHub App" 授权

**问题 2: 部署失败**
- 检查：查看部署日志中的错误信息
- 常见原因：缺少 `package.json` 或 `start` 脚本

**问题 3: 不知道在哪里点击**
- 告诉我你当前看到的页面
- 我可以提供更具体的指导

---

## 📸 需要帮助？

如果你卡在某个步骤，请告诉我：
1. 你现在在 Railway 的哪个页面？
2. 你看到了什么？
3. 你想做什么但不知道怎么做？

我会根据你的具体情况提供更详细的指导！

