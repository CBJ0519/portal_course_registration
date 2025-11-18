// Content Script - 在 timetable.nycu.edu.tw 頁面上執行
// 這個腳本負責使用 NYCU API 抓取課程資料並儲存到 Chrome Storage

// API Base URL
const API_BASE = 'https://timetable.nycu.edu.tw/';

// 等待頁面載入完成後自動抓取資料
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  // console.log('開始初始化課程資料抓取');

  // 檢查是否已有資料
  chrome.storage.local.get(['courseData', 'lastUpdate'], function(result) {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000; // 改為 7 天

    // 計算資料年齡
    const dataAge = result.lastUpdate ? now - result.lastUpdate : Infinity;
    const daysOld = Math.floor(dataAge / (24 * 60 * 60 * 1000));

    // 如果沒有資料、資料為空、或資料超過 7 天，則重新抓取
    if (!result.courseData ||
        result.courseData.length === 0 ||
        !result.lastUpdate ||
        dataAge > sevenDays) {
      // console.log('開始抓取課程資料...');
      fetchAllCourses();
    } else {
      const courseCount = result.courseData.length;
      // console.log(`使用現有課程資料 (${courseCount} 筆，已儲存 ${daysOld} 天)`);

      // 顯示資料狀態通知
      const remainingDays = 7 - daysOld;
      showNotification(
        `✓ 已載入 ${courseCount} 筆課程資料 (${remainingDays} 天後自動更新)`,
        true,
        3000
      );
    }
  });
}

// 抓取所有課程資料
async function fetchAllCourses() {
  try {
    showNotification('開始載入課程資料...', false, 0);

    // 1. 取得目前學期
    const acysem = await getAcysem();
    if (!acysem) {
      throw new Error('無法取得學期資訊');
    }

    // console.log('目前學期:', acysem);

    // 分割學年度和學期，用於課程綱要連結
    const [acy, sem] = splitAcysem(acysem);
    // console.log('學年度:', acy, '學期:', sem);

    const coursesMap = new Map(); // 使用 Map 來合併相同課程的多個路徑

    // 獲取所有課程類型
    const types = await getCourseTypes();
    // console.log('課程類型數量:', types.length);
    // console.log('課程類型詳細:', types.map(t => `${t.cname || t.ename} (${t.uid})`).join(', '));

    let processedTypes = 0;
    let processedDepartments = 0;

    // 統計每個課程類型的系所和課程數量
    const typeStats = new Map();

    // 第一步：統計總共有多少系所
    // console.log('正在統計系所數量...');
    let allDepartmentsList = [];
    for (const type of types) {
      const departments = await getAllDepartmentsByType(acysem, type.uid);
      const typeName = type.cname || type.ename || type.uid;
      typeStats.set(type.uid, { name: typeName, departments: departments.length, courses: 0 });
      // console.log(`  課程類型「${typeName}」找到 ${departments.length} 個系所`);

      allDepartmentsList.push(...departments.map(dept => ({
        type: type,
        dept: dept
      })));
    }
    const totalDepartments = allDepartmentsList.length;
    // console.log(`共需處理 ${totalDepartments} 個系所`);

    // 第二步：處理每個系所並顯示百分比進度
    for (const item of allDepartmentsList) {
      processedDepartments++;
      const progress = ((processedDepartments / totalDepartments) * 100).toFixed(2);

      // console.log(`    [${progress}%] 抓取系所 ${processedDepartments}/${totalDepartments}: ${item.dept.cname || item.dept.ename}`);

      // 每處理 5 個系所更新一次進度通知
      if (processedDepartments % 5 === 0 || processedDepartments === totalDepartments) {
        showNotification(`載入中 ${progress}% (${processedDepartments}/${totalDepartments}) - ${coursesMap.size} 筆課程`, false, 0);
      }

      const courses = await getCourseList(acysem, item.dept.uid);
      let newCoursesFromThisDept = 0;

      courses.forEach(course => {
        const courseKey = course.cos_id || course.cos_code;
        if (!courseKey) return;

        // 建立當前路徑
        const currentPath = {
          type: item.type.cname || course.cos_type_name || '',
          category: item.dept.category_cname || '',
          college: item.dept.college_cname || course.college_cname || '',
          department: item.dept.cname || item.dept.ename || course.dep_cname || ''
        };

        // 如果課程已存在，添加新路徑
        if (coursesMap.has(courseKey)) {
          const existingCourse = coursesMap.get(courseKey);
          // 檢查路徑是否已存在（避免完全重複的路徑）
          const pathExists = existingCourse.paths.some(p =>
            p.type === currentPath.type &&
            p.category === currentPath.category &&
            p.college === currentPath.college &&
            p.department === currentPath.department
          );
          if (!pathExists) {
            existingCourse.paths.push(currentPath);
          }
        } else {
          // 創建新課程
          coursesMap.set(courseKey, {
            code: course.cos_code || '',
            name: course.cos_cname || course.cos_ename || '',
            teacher: course.teacher || '',
            time: course.cos_time || '', // 直接使用 API 回傳的時間字串（格式：M56-EC015[GF]）
            credits: course.cos_credit || '',
            room: course.cos_room || '',
            cos_id: course.cos_id || course.cos_code || '', // 課程編號（用於課程綱要連結）
            acy: acy, // 學年度
            sem: sem, // 學期
            paths: [currentPath] // 路徑陣列
          });
          newCoursesFromThisDept++;
        }
      });

      // 統計該類型的課程數量
      if (typeStats.has(item.type.uid)) {
        typeStats.get(item.type.uid).courses += newCoursesFromThisDept;
      }

      // 避免請求過於頻繁
      await sleep(100);
    }

    // 將 Map 轉換為陣列
    const allCourses = Array.from(coursesMap.values());

    // 顯示統計摘要
    console.log('\n========== 課程載入統計摘要 ==========');
    console.log(`學期：${acysem}`);
    console.log(`總課程數：${allCourses.length}`);
    console.log(`總系所數：${totalDepartments}`);
    console.log('\n各類型統計：');
    for (const [uid, stats] of typeStats.entries()) {
      console.log(`  ${stats.name}: ${stats.courses} 門課程 (${stats.departments} 個系所)`);
    }
    console.log('======================================\n');

    // 儲存資料
    chrome.storage.local.set({
      courseData: allCourses,
      lastUpdate: Date.now()
    }, function() {
      console.log(`成功儲存 ${allCourses.length} 筆課程資料`);
      showNotification(`✓ 已載入 ${allCourses.length} 筆課程資料`, true, 5000);
    });

  } catch (error) {
    console.error('抓取課程資料失敗:', error);
    showNotification('✗ 抓取課程資料失敗: ' + error.message, true, 5000);
  }
}

// API 請求函數
async function apiRequest(endpoint, params = {}, method = 'GET') {
  const url = API_BASE + endpoint;

  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  };

  if (method === 'POST') {
    const formData = new URLSearchParams();
    for (const key in params) {
      formData.append(key, params[key]);
    }
    options.body = formData;
  }

  // console.log('API 請求:', url, method, params);

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    // console.log('API 回應:', endpoint, data);
    return data;
  } catch (error) {
    console.error('API 請求失敗:', endpoint, error);
    throw error;
  }
}

// 取得目前學期
async function getAcysem() {
  const data = await apiRequest('?r=main/get_acysem');
  // console.log('學期資料原始回傳:', data);

  // 處理不同的回傳格式
  if (Array.isArray(data) && data.length > 0) {
    const firstItem = data[0];
    // 如果是物件 {T: '1142'}，提取學期值
    if (typeof firstItem === 'object' && firstItem !== null) {
      // 嘗試取得 T 屬性，或第一個值
      const acysem = firstItem.T || firstItem.value || Object.values(firstItem)[0];
      // console.log('提取的學期值:', acysem);
      return acysem;
    }
    return firstItem;
  } else if (typeof data === 'object' && data !== null) {
    // 如果是物件，取第一個值
    const values = Object.values(data);
    return values.length > 0 ? values[0] : null;
  }

  return null;
}

// 取得課程類型
async function getCourseTypes() {
  const data = await apiRequest('?r=main/get_type');
  // console.log('課程類型:', data);

  if (typeof data === 'object' && !Array.isArray(data)) {
    return Object.values(data);
  }

  return Array.isArray(data) ? data : [];
}

// 根據課程類型獲取所有系所
async function getAllDepartmentsByType(acysem, ftype) {
  const allDepartments = [];

  // 先獲取 categories
  const categories = await apiRequest('?r=main/get_category', {
    ftype: ftype,
    flang: 'zh-tw',
    acysem: acysem,
    acysemend: acysem
  }, 'POST');

  // console.log(`    類型 ${ftype} 的 categories:`, categories);

  // categories 是物件格式：{"3*": "一般學士班", "3B": "學士後專班"}
  const categoryEntries = categories && typeof categories === 'object' && !Array.isArray(categories)
    ? Object.entries(categories) // 轉換為 [["3*", "一般學士班"], ["3B", "學士後專班"]]
    : [];

  if (categoryEntries.length === 0) {
    // console.log(`    類型 ${ftype} 沒有 categories，嘗試直接獲取學院`);
    categoryEntries.push(['', '空分類']); // 空 category
  }

  // 對每個 category 獲取學院
  for (const [categoryId, categoryName] of categoryEntries) {
    // console.log(`      處理 category: ${categoryName} (${categoryId})`);

    const colleges = await apiRequest('?r=main/get_college', {
      ftype: ftype,
      flang: 'zh-tw',
      acysem: acysem,
      acysemend: acysem,
      fcategory: categoryId
    }, 'POST');

    // console.log(`        找到學院:`, colleges);

    // colleges 也是物件格式：{"I": "電機學院", "S": "理學院", ...}
    const collegeEntries = colleges && typeof colleges === 'object' && !Array.isArray(colleges)
      ? Object.entries(colleges)
      : [];

    // 對每個學院獲取系所
    for (const [collegeId, collegeName] of collegeEntries) {
      // console.log(`          處理學院: ${collegeName} (${collegeId})`);

      const departments = await apiRequest('?r=main/get_dep', {
        ftype: ftype,
        flang: 'zh-tw',
        acysem: acysem,
        acysemend: acysem,
        fcategory: categoryId,
        fcollege: collegeId
      }, 'POST');

      // console.log(`            找到系所:`, departments);

      // departments 也是物件格式
      const deptEntries = departments && typeof departments === 'object' && !Array.isArray(departments)
        ? Object.entries(departments)
        : [];

      // 處理每個系所
      for (const [deptId, deptData] of deptEntries) {
        // deptData 可能是字串（系所名稱）或物件
        const dept = typeof deptData === 'string'
          ? { uid: deptId, cname: deptData, ename: deptData }
          : { uid: deptId, ...deptData };

        dept.college_cname = collegeName;
        dept.college_id = collegeId;
        dept.category_cname = categoryName; // 新增：類別名稱
        dept.category_id = categoryId; // 新增：類別 ID

        allDepartments.push(dept);
      }

      await sleep(50);
    }

    await sleep(50);
  }

  return allDepartments;
}

// 取得學院列表
async function getColleges(acysem) {
  const data = await apiRequest('?r=main/get_college', {
    ftype: '3',  // 大學部
    flang: 'zh-tw',
    acysem: acysem,
    acysemend: acysem,
    fcategory: ''
  }, 'POST');

  // console.log('學院資料:', data);

  // 檢查回傳格式
  if (!data) {
    console.error('學院 API 回傳 null 或 undefined');
    return [];
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    // 如果回傳的是物件而非陣列，嘗試轉換
    const values = Object.values(data);
    // console.log('學院資料轉換為陣列:', values);
    return values;
  }

  return Array.isArray(data) ? data : [];
}

// 取得系所列表
async function getDepartments(acysem, collegeUid) {
  const data = await apiRequest('?r=main/get_dep', {
    ftype: '3',
    flang: 'zh-tw',
    acysem: acysem,
    acysemend: acysem,
    fcategory: '',
    fcollege: collegeUid
  }, 'POST');

  // console.log(`學院 ${collegeUid} 的系所:`, data);

  // 處理物件格式
  if (typeof data === 'object' && !Array.isArray(data)) {
    return Object.values(data);
  }

  return Array.isArray(data) ? data : [];
}

// 取得課程列表
async function getCourseList(acysem, deptUid) {
  const [acy, sem] = splitAcysem(acysem);

  const data = await apiRequest('?r=main/get_cos_list', {
    m_acy: acy,
    m_sem: sem,
    m_acyend: acy,
    m_semend: sem,
    m_dep_uid: deptUid,
    m_group: '**',
    m_grade: '**',
    m_class: '**',
    m_option: '**',
    m_crsname: '**',
    m_teaname: '**',
    m_cos_id: '**',
    m_cos_code: '**',
    m_crstime: '**',
    m_crsoutline: '**',
    m_costype: '**',
    m_selcampus: '**'
  }, 'POST');

  // data 是物件格式，課程資料可能藏在數字鍵中（學期/年級）
  if (!data || typeof data !== 'object') {
    return [];
  }

  // 提取所有課程
  const allCourses = [];
  const keys = Object.keys(data);

  // 詳細記錄資料結構（僅第一次）
  // if (keys.length > 0) {
  //   const firstKey = keys[0];
  //   const firstValue = data[firstKey];
  //   console.log(`      課程資料結構範例 - Key: ${firstKey}, Value type: ${typeof firstValue}, Is Array: ${Array.isArray(firstValue)}`);
  //   if (typeof firstValue === 'object' && firstValue !== null) {
  //     const valueKeys = Object.keys(firstValue);
  //     console.log(`      Value keys: ${valueKeys.join(', ')}`);

  //     // 檢查數字鍵裡面的內容
  //     for (const key of valueKeys) {
  //       if (/^\d+$/.test(key)) {  // 如果是數字鍵
  //         const subValue = firstValue[key];
  //         console.log(`      檢查數字鍵 "${key}": type=${typeof subValue}, isArray=${Array.isArray(subValue)}`);
  //         if (typeof subValue === 'object' && subValue !== null && !Array.isArray(subValue)) {
  //           console.log(`        數字鍵 "${key}" 的內容 keys:`, Object.keys(subValue).slice(0, 5));
  //         } else if (Array.isArray(subValue) && subValue.length > 0) {
  //           console.log(`        數字鍵 "${key}" 是陣列，長度: ${subValue.length}`);
  //           console.log(`        第一個元素的 keys:`, Object.keys(subValue[0] || {}).slice(0, 10));
  //         }
  //       }
  //     }
  //   }
  // }

  for (const deptId in data) {
    const deptData = data[deptId];

    if (!deptData || typeof deptData !== 'object') {
      continue;
    }

    // 嘗試多種可能的資料結構
    if (Array.isArray(deptData)) {
      // 直接是陣列：{deptId: [...]}
      allCourses.push(...deptData);
      // console.log(`      從 ${deptId} 提取了 ${deptData.length} 筆課程 (直接陣列)`);
    } else if (deptData.courses && Array.isArray(deptData.courses)) {
      // 包裝在 courses 屬性中：{deptId: {courses: [...]}}
      allCourses.push(...deptData.courses);
      // console.log(`      從 ${deptId} 提取了 ${deptData.courses.length} 筆課程 (courses 屬性)`);
    } else {
      // 檢查數字鍵（1, 2, 3 等）- 可能按學期或年級分組
      for (const key in deptData) {
        if (/^\d+$/.test(key)) {  // 是數字鍵
          const gradeData = deptData[key];

          if (Array.isArray(gradeData)) {
            // 數字鍵裡面直接是陣列
            allCourses.push(...gradeData);
            // console.log(`      從 ${deptId} 的 key="${key}" 提取了 ${gradeData.length} 筆課程`);
          } else if (gradeData && typeof gradeData === 'object') {
            // 數字鍵裡面是物件，每個 key 是課程 ID (如 "1142_515000")
            const courseObjects = Object.values(gradeData);

            // 過濾出真正的課程物件（排除非課程資料）
            const courses = courseObjects.filter(obj =>
              obj && typeof obj === 'object' && !Array.isArray(obj) &&
              (obj.cos_id || obj.cos_code || obj.cos_cname)  // 有課程相關欄位
            );

            if (courses.length > 0) {
              allCourses.push(...courses);
              // console.log(`      從 ${deptId} 的 key="${key}" 提取了 ${courses.length} 筆課程`);
            }
          }
        }
      }
    }
  }

  // console.log(`      總共提取 ${allCourses.length} 筆課程`);

  return allCourses;
}

// 分割學期代碼 (例如 "1131" -> ["113", "1"])
function splitAcysem(acysem) {
  const str = acysem.toString();
  const acy = str.substring(0, str.length - 1);
  const sem = str.substring(str.length - 1);
  return [acy, sem];
}

// 格式化時間
function formatTime(timeArray) {
  if (!Array.isArray(timeArray) || timeArray.length === 0) {
    return '';
  }

  const dayMap = {
    'M': '一',
    'T': '二',
    'W': '三',
    'R': '四',
    'F': '五',
    'S': '六',
    'U': '日'
  };

  return timeArray.map(time => {
    const day = dayMap[time.day] || time.day;
    return `週${day} ${time.time}`;
  }).join(', ');
}

// 延遲函數
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 顯示通知（支持進度更新）
let currentNotification = null;

function showNotification(message, autoRemove = true, timeout = 3000) {
  // 如果已有通知，只更新文字
  if (currentNotification && document.body.contains(currentNotification)) {
    currentNotification.textContent = message;
    return;
  }

  // 創建新通知
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: 'Microsoft JhengHei', Arial, sans-serif;
    font-size: 14px;
    max-width: 300px;
    transition: opacity 0.3s;
  `;

  document.body.appendChild(notification);
  currentNotification = notification;

  // 如果需要自動移除
  if (autoRemove && timeout > 0) {
    setTimeout(() => {
      if (notification && document.body.contains(notification)) {
        notification.style.opacity = '0';
        setTimeout(() => {
          notification.remove();
          if (currentNotification === notification) {
            currentNotification = null;
          }
        }, 300);
      }
    }, timeout);
  }
}

// 添加示範資料（用於測試）
function addSampleData() {
  const sampleCourses = [
    {
      code: 'MATH101',
      name: '微積分一',
      teacher: '王大明',
      time: '週一 3,4',
      room: 'EC114',
      credits: '3',
      cos_id: '112500', // 示範課程編號
      acy: '114', // 示範學年度
      sem: '2', // 示範學期
      paths: [
        { type: '學士班課程', category: '一般學士班', college: '理學院', department: '應用數學系' }
      ]
    },
    {
      code: 'CS101',
      name: '計算機概論',
      teacher: '李小華',
      time: '週二 2,3,4',
      room: 'EC016',
      credits: '3',
      cos_id: '111501',
      acy: '114',
      sem: '2',
      paths: [
        { type: '學士班課程', category: '一般學士班', college: '資訊學院', department: '資訊工程學系' }
      ]
    },
    {
      code: 'GEKY10005',
      name: '微積分(二)',
      teacher: '王禹超',
      time: '週一 3,4',
      room: 'EC114',
      credits: '2',
      cos_id: '10005',
      acy: '114',
      sem: '2',
      paths: [
        { type: '學士班課程', category: '一般學士班', college: '校級', department: '(學士班大一大二不分系)' },
        { type: '學士班課程', category: '一般學士班', college: '醫學院', department: '(醫學系)' }
      ]
    }
  ];

  chrome.storage.local.set({
    courseData: sampleCourses,
    lastUpdate: Date.now()
  }, function() {
    // console.log('已載入示範資料');
    showNotification(`已載入 ${sampleCourses.length} 筆示範課程資料`);
  });
}

// 按 Ctrl+Shift+L 載入示範資料（用於測試）
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'L') {
    addSampleData();
  }
});
