# 測試指南

## 🎯 測試流程

### 1. 測試管理者登錄

1. 打開瀏覽器訪問：`http://localhost:3000`
2. 應該自動跳轉到 `http://localhost:3000/login.html`
3. 使用管理者帳號登錄：
   - Email: `admin@studentscoring.com`
   - Password: `C25da1212`
4. 登錄成功後應該跳轉到 `http://localhost:3000/admin.html`
5. 應該能看到管理者儀表板，顯示機構列表

### 2. 測試機構註冊

1. 在登錄頁面點擊「註冊機構」標籤
2. 填寫機構信息：
   - 機構名稱：例如「測試學校」
   - 機構 Email：例如 `test@school.com`
   - 聯絡電話：例如 `12345678`
   - 密碼：至少 6 個字符
3. 點擊「註冊」
4. 註冊成功後應該自動登錄並跳轉到機構管理界面

### 3. 測試機構創建老師

1. 以機構帳號登錄
2. 在「老師管理」標籤中：
   - 填寫老師姓名：例如「張老師」
   - 老師ID：例如 `T001`
   - 選擇性別
   - 用戶名稱：例如 `teacher001`
   - 密碼：至少 6 個字符
3. 點擊「創建老師」
4. 應該看到成功訊息

### 4. 測試機構創建學生

1. 以機構帳號登錄
2. 切換到「學生管理」標籤
3. 填寫學生信息：
   - 學生姓名：例如「小明」
   - 學生ID：例如 `S001`
4. 點擊「創建學生」
5. 應該看到學生出現在列表中

### 5. 測試老師登錄和選擇學生

1. 使用剛才創建的老師帳號登錄：
   - Email/用戶名：`teacher001`（或創建時設置的用戶名）
   - 密碼：創建時設置的密碼
2. 登錄成功後應該跳轉到老師界面
3. 在「選擇學生到 Class View」區域：
   - 勾選要顯示的學生
   - 點擊「保存選擇」
4. 點擊「Class View」按鈕
5. 應該只看到選擇的學生

### 6. 測試數據隔離

1. 註冊兩個不同的機構（機構A和機構B）
2. 機構A創建學生「學生A」
3. 機構B創建學生「學生B」
4. 使用機構A的帳號登錄，應該只能看到「學生A」
5. 使用機構B的帳號登錄，應該只能看到「學生B」

## 🔍 API 測試（使用 PowerShell）

### 測試機構註冊
```powershell
$body = @{
    organizationName = "測試學校"
    email = "test@school.com"
    phone = "12345678"
    password = "password123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" -Method Post -Body $body -ContentType "application/json"
```

### 測試登錄
```powershell
$body = @{
    email = "test@school.com"
    password = "password123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $body -ContentType "application/json"
$token = $response.token
$token
```

### 測試創建老師（需要機構 token）
```powershell
$headers = @{
    Authorization = "Bearer $token"
}

$body = @{
    name = "張老師"
    teacherId = "T001"
    gender = "male"
    username = "teacher001"
    password = "password123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/organizations/teachers" -Method Post -Body $body -ContentType "application/json" -Headers $headers
```

### 測試創建學生（需要機構 token）
```powershell
$body = @{
    name = "小明"
    studentId = "S001"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/organizations/students" -Method Post -Body $body -ContentType "application/json" -Headers $headers
```

## ✅ 完成檢查清單

- [ ] 管理者可以登錄並查看所有機構
- [ ] 機構可以註冊
- [ ] 機構可以創建老師
- [ ] 機構可以創建學生
- [ ] 老師可以登錄
- [ ] 老師可以選擇學生到 Class View
- [ ] 不同機構的數據完全隔離
- [ ] 未登錄用戶會被重定向到登錄頁面

## 🐛 常見問題

### 問題：登錄後沒有跳轉
**解決**：檢查瀏覽器控制台是否有錯誤，確認 `auth.js` 已正確加載

### 問題：API 返回 401 錯誤
**解決**：確認 token 已正確保存到 localStorage，檢查 Authorization header

### 問題：看不到學生列表
**解決**：確認已創建學生，並且當前用戶有權限查看（機構或老師）

### 問題：Class View 沒有顯示學生
**解決**：確認老師已選擇學生並保存，檢查 API `/api/teachers/class-view/students` 是否返回正確數據

