// 在 Chrome Console 中執行這個腳本來檢查「資料結構」課程的資料

chrome.storage.local.get(['courseData'], function(result) {
  if (!result.courseData) {
    console.log('沒有課程資料');
    return;
  }

  console.log('總課程數:', result.courseData.length);

  // 搜尋包含「資料結構」的課程
  const courses = result.courseData.filter(c =>
    c.name && c.name.includes('資料結構')
  );

  console.log('\n找到', courses.length, '門包含「資料結構」的課程:\n');

  courses.forEach((c, idx) => {
    console.log(`\n========== 課程 ${idx + 1} ==========`);
    console.log('課程名稱:', c.name);
    console.log('課程代碼:', c.code);
    console.log('課程ID:', c.cos_id);
    console.log('教師:', c.teacher);
    console.log('時間:', c.time);
    console.log('開課系所 (dep_name):', c.dep_name);
    console.log('開課系所 ID (dep_id):', c.dep_id);
    console.log('學分:', c.credits);
    console.log('必修/選修:', c.cos_type);
    console.log('備註:', c.memo);
    console.log('\n選課路徑 (paths):');
    if (c.paths && c.paths.length > 0) {
      c.paths.forEach((p, pidx) => {
        console.log(`  路徑 ${pidx + 1}:`);
        console.log(`    類型: ${p.type}`);
        console.log(`    類別: ${p.category}`);
        console.log(`    學院: ${p.college}`);
        console.log(`    系所: ${p.department}`);
      });
    } else {
      console.log('  (無路徑資訊)');
    }
    console.log('================================\n');
  });

  // 搜尋星期一下午的資工相關課程
  console.log('\n\n===== 星期一下午的資工相關課程 =====\n');
  const mondayAfternoonCS = result.courseData.filter(c => {
    const hasMonday = c.time && c.time.includes('M');
    const hasAfternoon = c.time && /[56789]/.test(c.time);
    const isCS = c.dep_name && (
      c.dep_name.includes('資工') ||
      c.dep_name.includes('資訊工程') ||
      c.dep_name.includes('DCP')
    ) || (c.paths && c.paths.some(p =>
      p.department && (
        p.department.includes('資工') ||
        p.department.includes('資訊工程') ||
        p.department.includes('DCP') ||
        p.college && p.college.includes('資訊')
      )
    ));

    return hasMonday && hasAfternoon && isCS;
  });

  console.log('找到', mondayAfternoonCS.length, '門課程');
  mondayAfternoonCS.slice(0, 20).forEach(c => {
    console.log(`- ${c.name} | ${c.time} | ${c.dep_name} | 路徑數: ${c.paths?.length || 0}`);
  });
});
