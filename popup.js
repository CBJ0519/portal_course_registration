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

  // 書籤資料
  let bookmarks = {};
  let currentResults = []; // 保存當前搜尋結果

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

  // 搜尋課程函數
  function searchCourses(courses, query) {
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
      // 建立所有路徑的 HTML
      let pathsHtml = '';
      if (course.paths && Array.isArray(course.paths) && course.paths.length > 0) {
        // 顯示路徑數量提示
        pathsHtml += `<div class="path-count">📂 找到 ${course.paths.length} 個選課路徑：</div>`;

        pathsHtml += course.paths.map((path, index) => {
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

      // 檢查是否有課程綱要所需的資訊
      const hasCourseOutline = course.cos_id && course.acy && course.sem;
      const clickableClass = hasCourseOutline ? 'course-item-clickable' : '';
      const clickHint = hasCourseOutline ? '<div class="click-hint">💡 點擊查看課程綱要</div>' : '';

      // 檢查是否已加入書籤
      const courseKey = getCourseKey(course);
      const isBookmarked = bookmarks[courseKey] !== undefined;
      const bookmarkIcon = isBookmarked ? '⭐' : '☆';
      const bookmarkClass = isBookmarked ? 'bookmarked' : '';

      return `
        <div class="course-item ${clickableClass}" data-course-index="${index}">
          <div class="course-header">
            <div class="course-header-left">
              <div class="course-code">${course.code}</div>
              <div class="course-name">${course.name}</div>
            </div>
            <button class="bookmark-btn ${bookmarkClass}" data-course-index="${index}" title="${isBookmarked ? '移除書籤' : '加入書籤'}">
              ${bookmarkIcon}
            </button>
          </div>
          ${pathsHtml}
          ${course.teacher ? `<div class="course-info">👨‍🏫 ${course.teacher}</div>` : ''}
          ${course.time ? `<div class="course-info">🕐 ${course.time}</div>` : ''}
          ${course.room ? `<div class="course-info">📍 ${course.room}</div>` : ''}
          ${course.credits ? `<div class="course-info">📚 ${course.credits} 學分</div>` : ''}
          ${clickHint}
        </div>
      `;
    }).join('');

    resultsDiv.innerHTML = html;

    // 為每個課程卡片添加點擊事件
    const courseItems = resultsDiv.querySelectorAll('.course-item-clickable');
    courseItems.forEach(item => {
      item.addEventListener('click', function(e) {
        // 如果點擊的是書籤按鈕，不觸發課程卡片點擊
        if (e.target.closest('.bookmark-btn')) {
          return;
        }
        const courseIndex = parseInt(this.dataset.courseIndex);
        const course = results[courseIndex];
        openCourseOutline(course);
      });
    });

    // 為每個書籤按鈕添加點擊事件
    const bookmarkBtns = resultsDiv.querySelectorAll('.bookmark-btn');
    bookmarkBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation(); // 阻止事件冒泡
        const courseIndex = parseInt(this.dataset.courseIndex);
        const course = results[courseIndex];
        toggleBookmark(course);
        // 重新顯示結果以更新書籤狀態
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
      // 建立所有路徑的 HTML
      let pathsHtml = '';
      if (course.paths && Array.isArray(course.paths) && course.paths.length > 0) {
        pathsHtml += `<div class="path-count">📂 找到 ${course.paths.length} 個選課路徑：</div>`;

        pathsHtml += course.paths.map((path, index) => {
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

      const hasCourseOutline = course.cos_id && course.acy && course.sem;
      const clickableClass = hasCourseOutline ? 'course-item-clickable' : '';
      const clickHint = hasCourseOutline ? '<div class="click-hint">💡 點擊查看課程綱要</div>' : '';

      return `
        <div class="course-item ${clickableClass}" data-bookmark-index="${index}">
          <div class="course-header">
            <div class="course-header-left">
              <div class="course-code">${course.code}</div>
              <div class="course-name">${course.name}</div>
            </div>
            <button class="bookmark-btn bookmarked" data-bookmark-index="${index}" title="移除書籤">
              ⭐
            </button>
          </div>
          ${pathsHtml}
          ${course.teacher ? `<div class="course-info">👨‍🏫 ${course.teacher}</div>` : ''}
          ${course.time ? `<div class="course-info">🕐 ${course.time}</div>` : ''}
          ${course.room ? `<div class="course-info">📍 ${course.room}</div>` : ''}
          ${course.credits ? `<div class="course-info">📚 ${course.credits} 學分</div>` : ''}
          ${clickHint}
        </div>
      `;
    }).join('');

    bookmarksList.innerHTML = html;

    // 為書籤課程卡片添加點擊事件
    const courseItems = bookmarksList.querySelectorAll('.course-item-clickable');
    courseItems.forEach(item => {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.bookmark-btn')) {
          return;
        }
        const bookmarkIndex = parseInt(this.dataset.bookmarkIndex);
        const course = bookmarkedCourses[bookmarkIndex];
        openCourseOutline(course);
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
        displayBookmarks(); // 重新顯示書籤列表
      });
    });
  }
});
