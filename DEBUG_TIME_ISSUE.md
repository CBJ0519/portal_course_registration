# 時間搜尋問題除錯指南

## 問題描述
所有課程的 `time` 欄位都是空字串，導致時間相關搜尋（如「週一」、「M56」）無法運作。

## 根本原因
在 `content.js` line 143，程式使用 `formatTime(course.cos_time)` 來提取時間資料，但：
- `course.cos_time` 欄位可能不存在
- 或者該欄位的格式與 `formatTime()` 函數預期的不同
- `formatTime()` 預期的格式：`[{day: 'M', time: '56'}, {day: 'T', time: '34'}]`

## 除錯步驟

### 步驟 1：清除快取並重新載入資料

1. 開啟瀏覽器，前往 https://timetable.nycu.edu.tw/
2. 按 F12 開啟開發者工具
3. 切換到 Console 分頁
4. 執行以下指令清除快取：
```javascript
chrome.storage.local.clear(function() {
  console.log('已清除所有快取資料');
  location.reload();
});
```

### 步驟 2：等待資料載入並檢查輸出

載入過程中（約 5 分鐘），Console 會輸出類似以下的除錯訊息：

```
========== 課程資料結構檢查 ==========
課程 1: {cos_id: "...", cos_code: "...", cos_cname: "...", ...}
  - cos_time: undefined
  - cos_crstime: "M56,T34"
  - crstime: undefined
  - 所有 time 相關欄位: ["cos_crstime"]
========================================
```

### 步驟 3：記錄關鍵資訊

請記錄以下資訊：
1. 哪個欄位包含時間資料？（例如：`cos_crstime`）
2. 該欄位的格式是什麼？（例如：`"M56,T34"` 或 `[{day: 'M', time: '56'}]`）
3. 完整的課程物件結構（複製其中一個課程的完整輸出）

## 可能的修正方案

根據發現的欄位名稱和格式，需要修改 `content.js` line 143：

### 方案 A：如果欄位名稱是 cos_crstime
```javascript
time: formatTime(course.cos_crstime) || '',
```

### 方案 B：如果時間已經是格式化的字串（如 "週一 56, 週二 34"）
```javascript
time: course.cos_crstime || course.cos_time || '',
// 並且可以移除或簡化 formatTime() 函數
```

### 方案 C：如果時間格式是 "M56,T34" 這種字串
需要重寫 `formatTime()` 函數來解析這種格式：
```javascript
function formatTime(timeString) {
  if (!timeString || typeof timeString !== 'string') {
    return '';
  }

  const dayMap = {
    'M': '一', 'T': '二', 'W': '三', 'R': '四',
    'F': '五', 'S': '六', 'U': '日'
  };

  // 分割多個時段：M56,T34 → ["M56", "T34"]
  const timeParts = timeString.split(',');

  return timeParts.map(part => {
    // M56 → day=M, time=56
    const day = part[0];
    const time = part.substring(1);
    const dayText = dayMap[day] || day;
    return `週${dayText} ${time}`;
  }).join(', ');
}
```

## 下一步

1. 執行上述除錯步驟
2. 將 Console 輸出的課程資料結構貼出來
3. 根據實際欄位名稱和格式修正 content.js
4. 測試時間搜尋功能（例如搜尋「M56」、「週一」）
5. 移除除錯輸出，恢復正常運作

## 相關檔案

- `content.js` line 143：時間欄位提取（需要修正）
- `content.js` lines 526-545：formatTime() 函數（可能需要重寫）
- `popup.js`：時間搜尋邏輯（已經支援 M56 等時間代碼）
