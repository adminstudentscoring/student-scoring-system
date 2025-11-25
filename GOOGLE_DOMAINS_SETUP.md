# Google Domains 配置指南 - studentscoring.com

## 📋 快速配置步骤

### 步骤 1: 登录 Google Domains

1. 访问 https://domains.google.com
2. 使用购买域名时使用的 Google 账号登录
3. 找到 `studentscoring.com` 域名并点击

---

### 步骤 2: 配置 DNS 记录

#### 2.1 进入 DNS 设置

1. 在域名管理页面，点击左侧菜单的 **"DNS"**
2. 找到 **"自定义资源记录"** (Custom resource records) 部分

#### 2.2 添加 CNAME 记录（根据你的部署平台）

**如果使用 Railway:**

1. 点击 **"添加"** 或 **"+"** 按钮
2. 填写以下信息：
   - **名称**: `@`（表示根域名 studentscoring.com）
   - **类型**: `CNAME`
   - **TTL**: `3600`（或使用默认值）
   - **数据**: `your-project.up.railway.app`（替换为 Railway 实际提供的域名）
3. 点击 **"保存"**

4. （可选）添加 www 子域名：
   - **名称**: `www`
   - **类型**: `CNAME`
   - **数据**: `your-project.up.railway.app`
   - 点击 **"保存"**

**如果使用 Render:**

1. 添加 CNAME 记录：
   - **名称**: `@`
   - **类型**: `CNAME`
   - **数据**: `your-service.onrender.com`（替换为 Render 实际提供的域名）
2. 点击 **"保存"**

---

### 步骤 3: 在部署平台配置域名

#### Railway 配置：

1. 登录 Railway: https://railway.app
2. 进入你的项目
3. 点击 **"Settings"** → **"Domains"**
4. 点击 **"Add Custom Domain"**
5. 输入 `studentscoring.com`
6. Railway 会显示需要添加的 DNS 记录（如果还没添加）
7. 点击 **"Generate Certificate"** 或等待自动生成 SSL 证书

#### Render 配置：

1. 登录 Render: https://render.com
2. 进入你的服务
3. 点击 **"Settings"** → **"Custom Domains"**
4. 点击 **"Add"**
5. 输入 `studentscoring.com`
6. Render 会自动配置 SSL 证书

---

### 步骤 4: 更新环境变量

在部署平台的环境变量中，更新 `CORS_ORIGIN`：

```
CORS_ORIGIN=https://studentscoring.com,https://www.studentscoring.com
```

**重要提示**:
- ✅ 必须包含 `https://` 前缀
- ✅ 多个域名用逗号分隔，**不要有空格**
- ✅ 更新后需要重新部署应用

---

### 步骤 5: 验证配置

#### 5.1 检查 DNS 传播

等待 5-30 分钟后，使用以下方法检查：

**方法 A: 使用在线工具**
- 访问 https://dnschecker.org
- 输入 `studentscoring.com`
- 选择记录类型 `CNAME`
- 检查全球 DNS 服务器是否已更新

**方法 B: 使用命令行（Windows PowerShell）**
```powershell
nslookup studentscoring.com
```

应该返回你的部署平台的域名。

#### 5.2 测试访问

1. 等待 10-30 分钟让 DNS 和 SSL 证书生效
2. 在浏览器访问：
   - https://studentscoring.com
   - https://www.studentscoring.com（如果配置了）
3. 确认：
   - ✅ 网站正常加载
   - ✅ 浏览器显示绿色锁图标（HTTPS）
   - ✅ 没有 SSL 证书错误

---

## 🔧 常见问题

### 问题 1: DNS 记录添加后无法访问

**可能原因**:
- DNS 还未完全传播（需要等待）
- DNS 记录配置错误
- 部署平台还未配置域名

**解决方案**:
1. 等待更长时间（最多 48 小时）
2. 检查 DNS 记录是否正确
3. 确认部署平台已配置自定义域名

### 问题 2: SSL 证书错误

**解决方案**:
- Railway 和 Render 会自动配置 SSL，等待 5-10 分钟
- 如果超过 1 小时仍未生效，检查 DNS 配置是否正确

### 问题 3: CORS 错误

**解决方案**:
1. 确认 `CORS_ORIGIN` 环境变量已更新
2. 确认包含 `https://` 前缀
3. 重新部署应用

### 问题 4: www 子域名无法访问

**解决方案**:
- 确认在 Google Domains 中添加了 `www` 的 CNAME 记录
- 确认在部署平台也配置了 `www.studentscoring.com`

---

## 📝 DNS 记录示例

### Railway 配置示例：

```
名称: @
类型: CNAME
TTL: 3600
数据: your-project.up.railway.app

名称: www
类型: CNAME
TTL: 3600
数据: your-project.up.railway.app
```

### Render 配置示例：

```
名称: @
类型: CNAME
TTL: 3600
数据: your-service.onrender.com
```

---

## ✅ 配置完成检查清单

- [ ] 在 Google Domains 添加了 CNAME 记录
- [ ] 在部署平台配置了自定义域名
- [ ] 更新了 `CORS_ORIGIN` 环境变量
- [ ] 重新部署了应用
- [ ] DNS 已传播（使用 dnschecker.org 检查）
- [ ] 可以访问 https://studentscoring.com
- [ ] SSL 证书正常工作（绿色锁图标）
- [ ] 网站功能正常

---

## 🆘 需要帮助？

如果遇到问题：
1. 检查 Google Domains 的 DNS 记录是否正确
2. 检查部署平台的域名配置
3. 查看部署平台的日志
4. 确认环境变量已正确设置

