# Monster Fight

Monster Fight 是一個獨立的遊戲模組，從學生計分器中拆分出來。

## 文件結構

```
monster-fight/
├── index.html          # 遊戲主頁面
├── monster-fight.js    # 遊戲邏輯
├── styles.css          # 遊戲樣式
├── config.js           # API 配置
├── README.md           # 說明文件
└── assets/
    └── pieces/         # 棋子圖片
```

## 使用方法

1. 確保學生計分器服務器正在運行
2. 在瀏覽器中打開 `monster-fight/index.html`
3. 遊戲會自動連接到學生計分器的 API

## API 配置

遊戲通過 `config.js` 配置 API 端點。默認情況下，如果遊戲與學生計分器在同一域名下運行，會使用相對路徑 `/api`。

如果需要跨域訪問，請修改 `config.js` 中的 `baseURL` 設置。

## 功能

- 角色選擇
- 戰鬥系統
- 技能系統
- 復活系統
- 關卡系統
- 遊戲設置

## 依賴

- 學生計分器 API 服務器
- WebSocket 連接（用於實時更新）

