// 等待 DOM 載入完成
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const refreshBtn = document.getElementById('refreshData');
  const resultsDiv = document.getElementById('results');
  const loadingDiv = document.getElementById('loading');
  const dataStatusDiv = document.getElementById('dataStatus');

  // 分頁相關元素
  const searchTab = document.getElementById('searchTab');
  const bookmarksTab = document.getElementById('bookmarksTab');
  const searchArea = document.getElementById('searchArea');
  const bookmarksArea = document.getElementById('bookmarksArea');
  const bookmarksList = document.getElementById('bookmarksList');
  const bookmarkCount = document.getElementById('bookmarkCount');
  const clearAllBookmarks = document.getElementById('clearAllBookmarks');

  // 詳細頁面相關元素
  const detailPage = document.getElementById('detailPage');
  const detailPageContent = document.getElementById('detailPageContent');
  const backButton = document.getElementById('backButton');
  const backBtn = document.getElementById('backBtn');
  const pageTitle = document.getElementById('pageTitle');
  const tabButtons = document.getElementById('tabButtons');

  // 書籤資料
  let bookmarks = {};
  let currentResults = []; // 保存當前搜尋結果
  let courseDetailsCache = {}; // 快取課程詳細資訊

  // 載入書籤資料
  loadBookmarks();

  // 顯示資料狀態
  updateDataStatus();

  // 搜尋按鈕事件
  searchBtn.addEventListener('click', performSearch);

  // Enter 鍵搜尋
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // 重新載入資料
  refreshBtn.addEventListener('click', function() {
    chrome.storage.local.remove(['courseData', 'lastUpdate'], function() {
      // 自動開啟課程網站並開始載入
      chrome.tabs.create({ url: 'https://timetable.nycu.edu.tw/' }, function() {
        alert('即將開始重新載入課程資料，約需 5 分鐘，請稍候...');
      });
    });
  });

  // 分頁切換事件
  searchTab.addEventListener('click', function() {
    searchTab.classList.add('active');
    bookmarksTab.classList.remove('active');
    searchArea.classList.add('active');
    bookmarksArea.classList.remove('active');
  });

  bookmarksTab.addEventListener('click', function() {
    bookmarksTab.classList.add('active');
    searchTab.classList.remove('active');
    bookmarksArea.classList.add('active');
    searchArea.classList.remove('active');
    displayBookmarks();
  });

  // 清空所有書籤
  clearAllBookmarks.addEventListener('click', function() {
    if (confirm('確定要清空所有書籤嗎？')) {
      bookmarks = {};
      saveBookmarks();
      displayBookmarks();
    }
  });

  // 返回按鈕事件
  backBtn.addEventListener('click', function() {
    showListView();
  });

  // 執行搜尋
  function performSearch() {
    const query = searchInput.value.trim();

    if (!query) {
      resultsDiv.innerHTML = '<div class="placeholder">請輸入課程名稱或代碼</div>';
      return;
    }

    // 立即顯示載入動畫
    loadingDiv.style.display = 'block';
    resultsDiv.innerHTML = '';

    // 從 Chrome Storage 讀取課程資料
    chrome.storage.local.get(['courseData'], function(result) {
      if (!result.courseData || result.courseData.length === 0) {
        loadingDiv.style.display = 'none';
        resultsDiv.innerHTML = `
          <div class="no-results">
            <p>尚未載入課程資料</p>
            <p style="margin-top: 8px; font-size: 12px;">
              請先訪問 <a href="https://timetable.nycu.edu.tw/" target="_blank">timetable.nycu.edu.tw</a>
            </p>
          </div>
        `;
        return;
      }

      // 使用 setTimeout 讓載入動畫有時間顯示
      // 對於大量資料，這樣可以確保 UI 不會凍結
      setTimeout(() => {
        // 搜尋課程
        const results = searchCourses(result.courseData, query);
        currentResults = results; // 保存搜尋結果

        // 隱藏載入動畫並顯示結果
        loadingDiv.style.display = 'none';
        displayResults(results);
      }, 50);
    });
  }

  // 檢查是否為簡稱：搜尋詞的每個字是否按順序出現在目標字串中
  function isAbbreviation(abbr, target) {
    let abbrIndex = 0;
    let targetIndex = 0;

    while (abbrIndex < abbr.length && targetIndex < target.length) {
      if (abbr[abbrIndex] === target[targetIndex]) {
        abbrIndex++;
      }
      targetIndex++;
    }

    return abbrIndex === abbr.length;
  }

  // 星期代碼對照表
  const dayCodeMap = {
    'M': '一',
    'T': '二',
    'W': '三',
    'R': '四',
    'F': '五',
    'S': '六',
    'U': '日'
  };

  // 判斷關鍵字是否為時間相關
  function isTimeKeyword(keyword) {
    const timeKeywords = ['週一', '週二', '週三', '週四', '週五', '週六', '週日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    // 檢查是否為星期代碼（M, T, W, R, F, S, U）
    if (keyword.length === 1 && dayCodeMap[keyword.toUpperCase()]) {
      return true;
    }
    // 檢查是否包含星期代碼（如 M3, T56）
    if (keyword.length >= 2 && dayCodeMap[keyword[0].toUpperCase()]) {
      return true;
    }
    return timeKeywords.includes(keyword);
  }

  // 將星期代碼轉換為搜尋字串
  function convertDayCode(keyword) {
    const upperKeyword = keyword.toUpperCase();
    // 如果是單個星期代碼（M, T, W, R, F, S, U）
    if (keyword.length === 1 && dayCodeMap[upperKeyword]) {
      return '週' + dayCodeMap[upperKeyword];
    }
    // 如果是星期代碼+時間代碼（如 M3, T56, Mabc）
    if (keyword.length >= 2 && dayCodeMap[upperKeyword[0]]) {
      const day = dayCodeMap[upperKeyword[0]];
      const timeCode = upperKeyword.substring(1);
      // 返回陣列，包含多種可能的匹配模式
      const patterns = [
        `週${day} ${timeCode}`,  // 週一 56
        `週${day}${timeCode}`,   // 週一56 (無空格)
      ];

      if (timeCode.length > 1) {
        // 如果時間代碼有多個字元，也嘗試分開匹配
        patterns.push(`週${day} ${timeCode.split('').join(',')}`); // 週一 5,6
        patterns.push(`週${day}${timeCode.split('').join(',')}`);  // 週一5,6
        // 也加入個別時間的匹配
        timeCode.split('').forEach(t => {
          patterns.push(`週${day} ${t}`); // 週一 5 或 週一 6
          patterns.push(`週${day}${t}`);  // 週一5 或 週一6
        });
      }
      return patterns;
    }
    return [keyword];
  }

  // 搜尋課程函數
  function searchCourses(courses, query) {
    // 重置 debug 計數器
    window.debugCount = 0;

    // 將查詢字串以空格分割成多個關鍵字
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

    if (keywords.length === 0) {
      return [];
    }

    return courses.filter(course => {
      // 每個關鍵字都要符合
      return keywords.every(keyword => {
        const courseName = course.name.toLowerCase();
        const courseCode = course.code.toLowerCase();
        const teacher = course.teacher ? course.teacher.toLowerCase() : '';
        const time = course.time ? course.time.toLowerCase() : '';
        const room = course.room ? course.room.toLowerCase() : '';

        // 如果是時間相關關鍵字，只在 time 欄位搜尋
        if (isTimeKeyword(keyword)) {
          // 轉換星期代碼（M -> 週一, M3 -> ["週一 3"], M56 -> ["週一 56", "週一 5,6", "週一 5", "週一 6"]）
          const converted = convertDayCode(keyword);
          const patterns = Array.isArray(converted) ? converted : [converted];

          // 檢查是否匹配任何一個模式
          const matched = patterns.some(pattern => time.includes(pattern)) || time.includes(keyword);

          // Debug：輸出時間搜尋資訊（前20筆）
          if (keyword.length > 1 && dayCodeMap[keyword[0].toUpperCase()]) {
            if (!window.debugCount) window.debugCount = 0;
            if (window.debugCount < 20) {
              console.log(`時間搜尋 "${keyword}" - ${matched ? '✓匹配' : '✗未匹配'}:`, {
                課程: course.name,
                時間欄位: course.time,
                匹配模式: patterns
              });
              window.debugCount++;
            }
          }

          return matched;
        }

        // 基本欄位搜尋：包含關鍵字或關鍵字是欄位的簡稱
        if (courseName.includes(keyword) || isAbbreviation(keyword, courseName) ||
            courseCode.includes(keyword) ||
            teacher.includes(keyword) ||
            time.includes(keyword) ||
            room.includes(keyword)) {
          return true;
        }

        // 在所有路徑中搜尋
        if (course.paths && Array.isArray(course.paths)) {
          return course.paths.some(path => {
            const type = path.type ? path.type.toLowerCase() : '';
            const category = path.category ? path.category.toLowerCase() : '';
            const college = path.college ? path.college.toLowerCase() : '';
            const department = path.department ? path.department.toLowerCase() : '';

            return type.includes(keyword) || isAbbreviation(keyword, type) ||
                   category.includes(keyword) || isAbbreviation(keyword, category) ||
                   college.includes(keyword) || isAbbreviation(keyword, college) ||
                   department.includes(keyword) || isAbbreviation(keyword, department);
          });
        }

        return false;
      });
    });
  }

  // 顯示搜尋結果
  function displayResults(results) {
    if (results.length === 0) {
      resultsDiv.innerHTML = '<div class="no-results">找不到符合的課程</div>';
      return;
    }

    const html = results.map((course, index) => {
      // 建立所有路徑的 HTML（收合在按鈕中）
      let pathsHtml = '';
      if (course.paths && Array.isArray(course.paths) && course.paths.length > 0) {
        pathsHtml = course.paths.map((path, index) => {
          const pathParts = [];
          if (path.type) pathParts.push(path.type);
          if (path.category) pathParts.push(path.category);
          if (path.college) pathParts.push(path.college);
          if (path.department) pathParts.push(path.department);
          pathParts.push('全部'); // 年級：全部

          // 如果有多個路徑，加上編號
          const prefix = course.paths.length > 1 ? `${index + 1}. ` : '📍 ';
          return `<div class="course-path">${prefix}${pathParts.join(' / ')}</div>`;
        }).join('');
      }

      // 檢查是否已加入書籤
      const courseKey = getCourseKey(course);
      const isBookmarked = bookmarks[courseKey] !== undefined;
      const bookmarkIcon = isBookmarked ? '⭐' : '☆';
      const bookmarkClass = isBookmarked ? 'bookmarked' : '';

      return `
        <div class="course-item" data-course-index="${index}">
          <div class="course-header">
            <div class="course-header-left">
              <div class="course-code">${course.code}</div>
              <div class="course-name">${course.name}</div>
            </div>
            <div class="course-actions">
              <button class="bookmark-btn ${bookmarkClass}" data-course-index="${index}" title="${isBookmarked ? '移除書籤' : '加入書籤'}">
                ${bookmarkIcon}
              </button>
            </div>
          </div>

          ${course.teacher ? `<div class="course-info">👨‍🏫 ${course.teacher}</div>` : ''}
          ${course.time ? `<div class="course-info">🕐 ${course.time}</div>` : ''}
          ${course.room ? `<div class="course-info">📍 ${course.room}</div>` : ''}
          ${course.credits ? `<div class="course-info">📚 ${course.credits} 學分</div>` : ''}

          <button class="view-detail-btn" data-course-index="${index}">
            查看完整資訊
          </button>
        </div>
      `;
    }).join('');

    resultsDiv.innerHTML = html;

    // 為「查看完整資訊」按鈕添加點擊事件
    const viewDetailBtns = resultsDiv.querySelectorAll('.view-detail-btn');
    viewDetailBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const courseIndex = parseInt(this.dataset.courseIndex);
        const course = results[courseIndex];
        showDetailView(course);
      });
    });

    // 為每個書籤按鈕添加點擊事件
    const bookmarkBtns = resultsDiv.querySelectorAll('.bookmark-btn');
    bookmarkBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const courseIndex = parseInt(this.dataset.courseIndex);
        const course = results[courseIndex];
        toggleBookmark(course);
        displayResults(results);
      });
    });
  }

  // 開啟課程綱要頁面
  function openCourseOutline(course) {
    if (!course.cos_id || !course.acy || !course.sem) {
      alert('無法開啟課程綱要：缺少必要資訊');
      return;
    }

    // 構建課程綱要 URL
    // 格式：https://timetable.nycu.edu.tw/?r=main/crsoutline&Acy=114&Sem=2&CrsNo=112500&lang=zh-tw
    const outlineUrl = `https://timetable.nycu.edu.tw/?r=main/crsoutline&Acy=${course.acy}&Sem=${course.sem}&CrsNo=${course.cos_id}&lang=zh-tw`;

    // 在新分頁開啟
    chrome.tabs.create({ url: outlineUrl });
  }

  // 更新資料狀態顯示
  function updateDataStatus() {
    chrome.storage.local.get(['courseData', 'lastUpdate'], function(result) {
      if (!result.courseData || result.courseData.length === 0) {
        dataStatusDiv.innerHTML = '<span class="status-warning">⚠️ 尚未載入課程資料，請訪問 <a href="https://timetable.nycu.edu.tw/" target="_blank">timetable.nycu.edu.tw</a></span>';
        dataStatusDiv.style.display = 'block';
        return;
      }

      const now = Date.now();
      const dataAge = now - result.lastUpdate;
      const daysOld = Math.floor(dataAge / (24 * 60 * 60 * 1000));
      const hoursOld = Math.floor((dataAge % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const remainingDays = 7 - daysOld;

      let statusText = '';
      let statusClass = '';

      if (dataAge > sevenDays) {
        // 資料過期
        statusText = `⚠️ 資料已過期 (${daysOld} 天前)，請訪問 <a href="https://timetable.nycu.edu.tw/" target="_blank">timetable.nycu.edu.tw</a> 更新`;
        statusClass = 'status-warning';
      } else if (daysOld === 0) {
        // 今天的資料
        if (hoursOld === 0) {
          statusText = `✓ ${result.courseData.length} 筆課程 (剛剛更新)`;
        } else {
          statusText = `✓ ${result.courseData.length} 筆課程 (${hoursOld} 小時前更新)`;
        }
        statusClass = 'status-fresh';
      } else {
        // 資料仍有效
        statusText = `✓ ${result.courseData.length} 筆課程 (${daysOld} 天前更新，${remainingDays} 天後自動更新)`;
        statusClass = 'status-valid';
      }

      dataStatusDiv.innerHTML = `<span class="${statusClass}">${statusText}</span>`;
      dataStatusDiv.style.display = 'block';
    });
  }

  // ==================== 書籤相關函數 ====================

  // 生成課程唯一鍵
  function getCourseKey(course) {
    return course.cos_id || course.code || `${course.name}_${course.teacher}`;
  }

  // 載入書籤資料
  function loadBookmarks() {
    chrome.storage.local.get(['courseBookmarks'], function(result) {
      bookmarks = result.courseBookmarks || {};
      updateBookmarkCount();
    });
  }

  // 儲存書籤資料
  function saveBookmarks() {
    chrome.storage.local.set({ courseBookmarks: bookmarks }, function() {
      updateBookmarkCount();
    });
  }

  // 切換書籤狀態
  function toggleBookmark(course) {
    const courseKey = getCourseKey(course);

    if (bookmarks[courseKey]) {
      // 移除書籤
      delete bookmarks[courseKey];
    } else {
      // 加入書籤
      bookmarks[courseKey] = {
        ...course,
        bookmarkedAt: Date.now() // 記錄加入書籤的時間
      };
    }

    saveBookmarks();
  }

  // 更新書籤數量顯示
  function updateBookmarkCount() {
    const count = Object.keys(bookmarks).length;
    bookmarkCount.textContent = count;

    // 如果有書籤，顯示清空按鈕
    if (count > 0) {
      clearAllBookmarks.style.display = 'inline-block';
    } else {
      clearAllBookmarks.style.display = 'none';
    }
  }

  // 顯示書籤列表
  function displayBookmarks() {
    const bookmarkedCourses = Object.values(bookmarks);

    if (bookmarkedCourses.length === 0) {
      bookmarksList.innerHTML = `
        <div class="placeholder">
          尚未加入任何書籤<br>
          <span style="font-size: 12px; color: #999; margin-top: 8px; display: block;">
            在搜尋結果中點擊星號圖示即可加入書籤
          </span>
        </div>
      `;
      return;
    }

    // 按加入書籤的時間排序（最新的在前）
    bookmarkedCourses.sort((a, b) => (b.bookmarkedAt || 0) - (a.bookmarkedAt || 0));

    const html = bookmarkedCourses.map((course, index) => {
      // 建立所有路徑的 HTML（收合在按鈕中）
      let pathsHtml = '';
      if (course.paths && Array.isArray(course.paths) && course.paths.length > 0) {
        pathsHtml = course.paths.map((path, index) => {
          const pathParts = [];
          if (path.type) pathParts.push(path.type);
          if (path.category) pathParts.push(path.category);
          if (path.college) pathParts.push(path.college);
          if (path.department) pathParts.push(path.department);
          pathParts.push('全部');

          const prefix = course.paths.length > 1 ? `${index + 1}. ` : '📍 ';
          return `<div class="course-path">${prefix}${pathParts.join(' / ')}</div>`;
        }).join('');
      }

      const courseKey = getCourseKey(course);

      return `
        <div class="course-item" data-bookmark-index="${index}">
          <div class="course-header">
            <div class="course-header-left">
              <div class="course-code">${course.code}</div>
              <div class="course-name">${course.name}</div>
            </div>
            <div class="course-actions">
              <button class="bookmark-btn bookmarked" data-bookmark-index="${index}" title="移除書籤">
                ⭐
              </button>
            </div>
          </div>

          ${course.teacher ? `<div class="course-info">👨‍🏫 ${course.teacher}</div>` : ''}
          ${course.time ? `<div class="course-info">🕐 ${course.time}</div>` : ''}
          ${course.room ? `<div class="course-info">📍 ${course.room}</div>` : ''}
          ${course.credits ? `<div class="course-info">📚 ${course.credits} 學分</div>` : ''}

          <button class="view-detail-btn" data-bookmark-index="${index}">
            查看完整資訊
          </button>
        </div>
      `;
    }).join('');

    bookmarksList.innerHTML = html;

    // 為「查看完整資訊」按鈕添加點擊事件
    const viewDetailBtns = bookmarksList.querySelectorAll('.view-detail-btn');
    viewDetailBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const bookmarkIndex = parseInt(this.dataset.bookmarkIndex);
        const course = bookmarkedCourses[bookmarkIndex];
        showDetailView(course);
      });
    });

    // 為書籤按鈕添加點擊事件
    const bookmarkBtns = bookmarksList.querySelectorAll('.bookmark-btn');
    bookmarkBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const bookmarkIndex = parseInt(this.dataset.bookmarkIndex);
        const course = bookmarkedCourses[bookmarkIndex];
        toggleBookmark(course);
        displayBookmarks();
      });
    });
  }

  // ==================== 頁面切換功能 ====================

  // 顯示詳細頁面
  async function showDetailView(course) {
    // 隱藏列表頁面
    searchArea.style.display = 'none';
    bookmarksArea.style.display = 'none';
    tabButtons.style.display = 'none';
    dataStatusDiv.style.display = 'none';

    // 顯示詳細頁面
    detailPage.style.display = 'block';
    backButton.style.display = 'block';
    pageTitle.textContent = course.name;

    // 載入詳細資訊
    detailPageContent.innerHTML = '<div class="details-loading">載入中...</div>';

    // 構建選課路徑 HTML
    let pathsHtml = '';
    if (course.paths && Array.isArray(course.paths) && course.paths.length > 0) {
      pathsHtml = `
        <div class="detail-section">
          <h2 class="detail-section-title">📂 選課路徑</h2>
          <div class="paths-list">
            ${course.paths.map((path, index) => {
              const pathParts = [];
              if (path.type) pathParts.push(path.type);
              if (path.category) pathParts.push(path.category);
              if (path.college) pathParts.push(path.college);
              if (path.department) pathParts.push(path.department);
              pathParts.push('全部');
              const prefix = course.paths.length > 1 ? `${index + 1}. ` : '📍 ';
              return `<div class="course-path">${prefix}${pathParts.join(' / ')}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    // 載入課程詳細資訊（從 API）
    const courseKey = getCourseKey(course);
    let detailsHtml = '';

    if (!courseDetailsCache[courseKey]) {
      try {
        if (course.cos_id && course.acy && course.sem) {
          const params = new URLSearchParams({
            acy: course.acy,
            sem: course.sem,
            cos_id: course.cos_id
          });

          const [baseResponse, descResponse] = await Promise.all([
            fetch('https://timetable.nycu.edu.tw/?r=main/getCrsOutlineBase', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString()
            }),
            fetch('https://timetable.nycu.edu.tw/?r=main/getCrsOutlineDescription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString()
            })
          ]);

          const baseData = await baseResponse.json();
          const descData = await descResponse.json();
          const details = extractCourseDetailsFromAPI(baseData, descData, course);
          courseDetailsCache[courseKey] = details;
        }
      } catch (error) {
        console.error('載入課程詳細資訊失敗:', error);
      }
    }

    if (courseDetailsCache[courseKey]) {
      detailsHtml = `
        <div class="detail-section">
          <h2 class="detail-section-title">📋 課程詳細資訊</h2>
          ${displayCourseDetailsHTML(courseDetailsCache[courseKey])}
        </div>
      `;
    }

    // 組合完整內容
    detailPageContent.innerHTML = `
      <div class="detail-page-header">
        <div class="detail-course-code">${course.code}</div>
        <div class="detail-course-name">${course.name}</div>
        ${course.teacher ? `<div class="detail-course-info">👨‍🏫 授課教師：${course.teacher}</div>` : ''}
        ${course.credits ? `<div class="detail-course-info">📚 學分：${course.credits}</div>` : ''}
      </div>

      ${pathsHtml}
      ${detailsHtml}

      <div class="detail-actions">
        ${course.cos_id && course.acy && course.sem ? `
          <button class="detail-outline-btn" id="detailOutlineBtn">📄 開啟課程綱要</button>
        ` : ''}
      </div>
    `;

    // 為課程綱要按鈕添加事件
    const detailOutlineBtn = document.getElementById('detailOutlineBtn');
    if (detailOutlineBtn) {
      detailOutlineBtn.addEventListener('click', function() {
        openCourseOutline(course);
      });
    }
  }

  // 返回列表頁面
  function showListView() {
    // 隱藏詳細頁面
    detailPage.style.display = 'none';
    backButton.style.display = 'none';
    pageTitle.textContent = 'NYCU 課程搜尋';

    // 顯示列表頁面
    tabButtons.style.display = 'flex';
    dataStatusDiv.style.display = 'block';

    // 恢復到之前的分頁
    if (searchTab.classList.contains('active')) {
      searchArea.style.display = 'block';
    } else {
      bookmarksArea.style.display = 'block';
    }
  }


  // 從 API 資料中提取課程詳細資訊
  function extractCourseDetailsFromAPI(baseData, descData, course) {
    // 解析時間地點
    let timeLocation = '未提供';
    if (baseData.cos_time) {
      // 解析時間格式：M56R2-EC115[GF],Rabc-EC315[GF]
      const timeParts = baseData.cos_time.split(',').map(part => {
        const match = part.match(/^([A-Z]+\d*)-([A-Z0-9]+)/);
        if (match) {
          const time = match[1]; // M56R2 或 Rabc
          const room = match[2]; // EC115
          return `${time} @ ${room}`;
        }
        return part;
      });
      timeLocation = timeParts.join(', ');
    }

    const details = {
      時間地點: timeLocation,
      學分: baseData.cos_credit || course.credits || '未提供',
      必選修: baseData.sel_type_name || '未提供',
      授課教師: baseData.tea_name || course.teacher || '未提供',
      先修科目: descData.crs_prerequisite || '未提供',
      課程概述: descData.crs_outline || '未提供',
      教科書: descData.crs_textbook || '未提供',
      評量方式: descData.crs_exam_score || '未提供',
      教學方法: descData.crs_teach_method || '未提供',
      師生晤談: descData.crs_meeting_time && descData.crs_meeting_place
        ? `${descData.crs_meeting_time} @ ${descData.crs_meeting_place}`
        : '未提供',
      聯絡方式: descData.crs_contact || '未提供'
    };

    return details;
  }

  // 生成課程詳細資訊 HTML
  function displayCourseDetailsHTML(details) {
    return `
      <div class="details-content">
        <div class="details-subsection">
          <div class="details-subtitle">基本資訊</div>
          <div class="details-grid">
            <div class="detail-item" style="grid-column: 1 / -1;">
              <span class="detail-label">時間地點：</span>
              <span class="detail-value">${details.時間地點}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">學分：</span>
              <span class="detail-value">${details.學分}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">必選修：</span>
              <span class="detail-value ${getRequiredClass(details.必選修)}">${details.必選修}</span>
            </div>
          </div>
        </div>

        ${details.先修科目 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">📚 先修科目或先備能力</div>
          <div class="detail-text">${details.先修科目}</div>
        </div>
        ` : ''}

        ${details.課程概述 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">🎯 課程概述與目標</div>
          <div class="detail-text">${details.課程概述}</div>
        </div>
        ` : ''}

        ${details.教科書 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">📖 教科書</div>
          <div class="detail-text">${details.教科書}</div>
        </div>
        ` : ''}

        ${details.評量方式 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">📊 評量方式</div>
          <div class="detail-text">${details.評量方式}</div>
        </div>
        ` : ''}

        ${details.教學方法 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">🎓 教學方法</div>
          <div class="detail-text">${details.教學方法}</div>
        </div>
        ` : ''}

        ${details.師生晤談 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">👥 師生晤談時間</div>
          <div class="detail-text">${details.師生晤談}</div>
        </div>
        ` : ''}

        ${details.聯絡方式 !== '未提供' ? `
        <div class="details-subsection">
          <div class="details-subtitle">📧 聯絡方式</div>
          <div class="detail-text">${details.聯絡方式}</div>
        </div>
        ` : ''}
      </div>
    `;
  }

  // 根據必選修狀態返回 CSS class
  function getRequiredClass(required) {
    if (required.includes('必修')) {
      return 'required-course';
    } else if (required.includes('選修')) {
      return 'elective-course';
    }
    return '';
  }
});
