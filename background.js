// Background Service Worker - 處理側邊欄開啟

// 當用戶點擊擴充功能圖示時，開啟側邊欄
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 在特定網站上自動啟用側邊欄
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.url) {
    // 在 timetable.nycu.edu.tw 或 cos.nycu.edu.tw 上自動啟用
    if (tab.url.includes('timetable.nycu.edu.tw') || tab.url.includes('cos.nycu.edu.tw')) {
      chrome.sidePanel.setOptions({
        tabId,
        path: 'popup.html',
        enabled: true
      });
    }
  }
});
