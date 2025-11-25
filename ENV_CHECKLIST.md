# 环境变量检查清单 ✅

## Railway 环境变量检查

请在 Railway Dashboard → 你的项目 → Variables 页面，对照检查以下变量：

---

## ✅ 必需变量（必须设置）

### 1. JWT_SECRET ⚠️ **最重要**
- **Key**: `JWT_SECRET`
- **Value**: 应该是 64 个字符的随机字符串（hex 格式）
- **检查**: 
  - ✅ 不是 `change-this-to-a-random-secret-key-in-production`
  - ✅ 长度至少 32 字符（推荐 64 字符）
  - ✅ 是随机生成的，不是简单字符串
- **如果未设置或错误**: 运行 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成新密钥

### 2. NODE_ENV
- **Key**: `NODE_ENV`
- **Value**: `production`
- **检查**: ✅ 值必须是 `production`（不是 `development`）

### 3. CORS_ORIGIN
- **Key**: `CORS_ORIGIN`
- **Value**: `https://studentscoring.com,https://www.studentscoring.com`
- **检查**:
  - ✅ 包含 `https://` 前缀
  - ✅ 多个域名用逗号分隔，**没有空格**
  - ✅ 如果还没配置域名，可以暂时设置为 `*`（但生产环境建议使用具体域名）

---

## 📁 数据存储路径变量（建议设置）

这些变量有默认值，但建议明确设置：

### 4. DATA_DIR
- **Key**: `DATA_DIR`
- **Value**: `data`
- **检查**: ✅ 值应该是 `data`（没有斜杠）

### 5. DATA_FILE
- **Key**: `DATA_FILE`
- **Value**: `data/students.txt`
- **检查**: ✅ 路径格式正确

### 6. SAVES_DIR
- **Key**: `SAVES_DIR`
- **Value**: `data/saves`
- **检查**: ✅ 路径格式正确

### 7. GAME_SAVES_DIR
- **Key**: `GAME_SAVES_DIR`
- **Value**: `data/game-saves`
- **检查**: ✅ 路径格式正确

### 8. RUNNING_QUEEN_LEADERBOARD_FILE
- **Key**: `RUNNING_QUEEN_LEADERBOARD_FILE`
- **Value**: `data/running-queen-leaderboard.txt`
- **检查**: ✅ 路径格式正确

### 9. ROYAL_EXCHANGE_LEADERBOARD_FILE
- **Key**: `ROYAL_EXCHANGE_LEADERBOARD_FILE`
- **Value**: `data/royal-exchange-leaderboard.txt`
- **检查**: ✅ 路径格式正确

### 10. USERS_FILE
- **Key**: `USERS_FILE`
- **Value**: `data/users.txt`
- **检查**: ✅ 路径格式正确

### 11. ORGANIZATIONS_FILE
- **Key**: `ORGANIZATIONS_FILE`
- **Value**: `data/organizations.txt`
- **检查**: ✅ 路径格式正确

### 12. JWT_EXPIRES_IN
- **Key**: `JWT_EXPIRES_IN`
- **Value**: `7d`
- **检查**: ✅ 值应该是 `7d`（7天）

---

## ⚙️ 可选变量

### PORT（通常不需要）
- Railway 会自动设置 PORT
- **不需要手动设置**，除非有特殊需求

---

## 📋 完整变量列表（复制粘贴参考）

如果你在 Railway 中设置，应该有以下变量：

```
JWT_SECRET=你的64字符密钥
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

## ✅ 快速检查清单

在 Railway Variables 页面，确认：

- [ ] **JWT_SECRET** 已设置且是随机生成的强密钥（不是默认值）
- [ ] **NODE_ENV** = `production`
- [ ] **CORS_ORIGIN** 已设置为你的域名（或暂时为 `*`）
- [ ] 所有数据文件路径变量都已设置
- [ ] 变量名称拼写正确（区分大小写）
- [ ] 变量值没有多余的空格
- [ ] 总共应该有 **12 个变量**

---

## ⚠️ 常见错误

### 错误 1: JWT_SECRET 使用默认值
- ❌ `JWT_SECRET=change-this-to-a-random-secret-key-in-production`
- ✅ 必须生成新的随机密钥

### 错误 2: CORS_ORIGIN 格式错误
- ❌ `CORS_ORIGIN=https://studentscoring.com, https://www.studentscoring.com`（有空格）
- ✅ `CORS_ORIGIN=https://studentscoring.com,https://www.studentscoring.com`（无空格）

### 错误 3: NODE_ENV 设置错误
- ❌ `NODE_ENV=development`
- ✅ `NODE_ENV=production`

### 错误 4: 变量名称大小写错误
- ❌ `jwt_secret` 或 `Jwt_Secret`
- ✅ `JWT_SECRET`（全大写）

---

## 🔍 如何验证设置

### 方法 1: 检查部署日志
1. 在 Railway 项目页面
2. 点击 "Deployments" → 最新部署 → "Logs"
3. 查看是否有环境变量相关的错误

### 方法 2: 测试 API
部署完成后，访问你的网站：
- 如果环境变量正确，网站应该正常加载
- 如果 JWT_SECRET 错误，登录功能会失败
- 如果 CORS_ORIGIN 错误，会有 CORS 错误

---

## 📝 如果发现问题

1. **JWT_SECRET 错误**
   - 生成新密钥：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - 在 Railway 中更新变量
   - 重新部署

2. **CORS_ORIGIN 错误**
   - 检查格式（无空格，包含 https://）
   - 更新变量
   - 重新部署

3. **缺少变量**
   - 添加缺失的变量
   - Railway 会自动重新部署

---

## ✅ 设置正确的标志

如果以下都满足，说明设置正确：

1. ✅ JWT_SECRET 是随机生成的强密钥
2. ✅ NODE_ENV = production
3. ✅ CORS_ORIGIN 格式正确
4. ✅ 所有 12 个变量都已设置
5. ✅ 部署成功且网站可以访问
6. ✅ 没有环境变量相关的错误日志

