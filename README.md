# NYCU 課程搜尋助手 Chrome Extension

這是一個 Chrome 擴充功能，用於快速搜尋 NYCU 課程並查看開課單位。</br>
擴充功能連結：https://chromewebstore.google.com/detail/nycu-%E8%AA%B2%E7%A8%8B%E6%90%9C%E5%B0%8B%E5%8A%A9%E6%89%8B/miaebenciplpjnmbfnhibkkgfeiciijn?utm_source=item-share-cp

## 功能

- 🔍 快速搜尋課程（支援課程名稱、代碼、開課單位、學院、教師）
- 🏫 顯示開課單位、所屬學院資訊
- 👨‍🏫 顯示授課教師、上課時間、教室、學分等完整資訊
- 💾 本地儲存課程資料，24 小時內快速查詢
- 🔄 自動使用 NYCU 官方 API 獲取最新課程資料

## 安裝方式

1. 開啟 Chrome 瀏覽器
2. 在網址列輸入 `chrome://extensions/`
3. 開啟右上角的「開發人員模式」
4. 點擊「載入未封裝項目」
5. 選擇 `course_registration` 資料夾
6. 完成安裝！

## 使用方式

### 第一次使用

1. 安裝擴充功能後，訪問 [NYCU 課程時間表](https://timetable.nycu.edu.tw/)
2. 擴充功能會自動使用 NYCU API 抓取課程資料（可能需要幾分鐘）
3. 抓取完成後會顯示通知，告知已載入多少筆課程資料
4. 課程資料會儲存在本地，24 小時內不會重複抓取

### 測試用示範資料

在 timetable.nycu.edu.tw 頁面上按 `Ctrl + Shift + L` 可以載入示範課程資料進行測試（不需等待完整抓取）。

### 搜尋課程

1. 點擊瀏覽器工具列的擴充功能圖示
2. 在搜尋框輸入課程名稱或代碼
3. 按 Enter 或點擊「搜尋」按鈕
4. 查看搜尋結果，包含開課單位等資訊

## 專案結構

```
course_registration/
├── manifest.json      # Chrome Extension 配置檔
├── popup.html         # 彈出視窗介面
├── popup.js          # 彈出視窗邏輯
├── content.js        # 注入到網頁的腳本（抓取資料）
├── styles.css        # 樣式檔
└── README.md         # 說明文件
```

## 資料來源

本擴充功能使用 NYCU 課程時間表系統的官方 API：
- API Base: `https://timetable.nycu.edu.tw/`
- 主要 endpoints:
  - `get_acysem` - 取得學期資訊
  - `get_college` - 取得學院列表
  - `get_dep` - 取得系所列表
  - `get_cos_list` - 取得課程列表

## 未來改進

- [ ] 優化搜尋演算法（模糊搜尋、相關性排序）
- [ ] 添加進階篩選（學分數、上課時間、課程類型）
- [ ] 支援多學期選擇
- [ ] 支援研究所課程
- [ ] 課表視覺化與衝堂檢查
- [ ] 匯出課表功能

## 技術棧

- HTML/CSS/JavaScript
- Chrome Extension Manifest V3
- Chrome Storage API

## 注意事項

- 第一次使用時，課程資料抓取可能需要幾分鐘（取決於網路速度和課程數量）
- 資料會儲存在瀏覽器本地，24 小時後會自動更新
- 點擊「重新載入課程資料」按鈕可清除舊資料並手動觸發更新
- 目前僅支援大學部課程，未來會加入研究所課程支援

## 除錯方式

1. 在 timetable.nycu.edu.tw 頁面上按 F12 開啟開發者工具
2. 切換到 Console 分頁
3. 查看是否有 "NYCU 課程搜尋助手已載入" 訊息
4. 查看課程資料抓取進度（學期資訊、學院數量、課程數量）
5. 使用 `Ctrl + Shift + L` 快速載入示範資料進行測試

## 授權

MIT License
