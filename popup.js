// 等待 DOM 載入完成
document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const refreshBtn = document.getElementById('refreshData');
  const resultsDiv = document.getElementById('results');
  const loadingDiv = document.getElementById('loading');
  const dataStatusDiv = document.getElementById('dataStatus');

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

    const html = results.map(course => {
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

      return `
        <div class="course-item">
          <div class="course-code">${course.code}</div>
          <div class="course-name">${course.name}</div>
          ${pathsHtml}
          ${course.teacher ? `<div class="course-info">👨‍🏫 ${course.teacher}</div>` : ''}
          ${course.time ? `<div class="course-info">🕐 ${course.time}</div>` : ''}
          ${course.room ? `<div class="course-info">📍 ${course.room}</div>` : ''}
          ${course.credits ? `<div class="course-info">📚 ${course.credits} 學分</div>` : ''}
        </div>
      `;
    }).join('');

    resultsDiv.innerHTML = html;
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
});
