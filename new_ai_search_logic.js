// 新的 AI 搜尋邏輯 - 三步驟架構
// 此文件內容將替換 popup.js 中的 searchCoursesWithAI 函數核心邏輯（3869-4420行）

      // ===== Step 0：將用戶輸入拆分成 14 個屬性的關鍵字集合 =====
      console.log('\n🔍 ===== Step 0：AI 拆分查詢為課程屬性關鍵字集合 =====');

      let attributeSets = {
        code: [], name: [], teacher: [], time: [], credits: [], room: [],
        cos_id: [], acy: [], sem: [], memo: [], cos_type: [],
        dep_name: [], dep_id: [], paths: []
      };

      try {
        const step0Prompt = `將用戶查詢拆分成課程的 14 個屬性的關鍵字集合

查詢：${userQuery}

課程資料結構包含以下 14 個屬性：
1. code - 課程代碼（如：CSCS10021）
2. name - 課程名稱（如：資料結構、物件導向程式設計等）
3. teacher - 教師姓名
4. time - 上課時間代碼（M=星期一, T=星期二, W=星期三, R=星期四, F=星期五；1234=上午, 56789=下午, abc=晚上）
5. credits - 學分數
6. room - 教室
7. cos_id - 課程編號
8. acy - 學年度
9. sem - 學期
10. memo - 備註
11. cos_type - 課程類型（必修、選修、通識等）
12. dep_name - 開課系所名稱（如：資訊工程學系、資工、DCP、CS、CSIE、資訊學院等）
13. dep_id - 開課系所ID
14. paths - 選課路徑（包含學院、系所等，如：資訊學院、資工、電資學院、CS等）

任務：分析用戶查詢，為每個屬性生成所有可能的關鍵字
- 每個屬性生成盡可能多的關鍵字、變體、同義詞
- 時間相關：生成星期代碼(M/T/W/R/F)、節次(1234/56789/abc)、中文星期、時段詞（上午/下午/晚上）
- 系所相關：生成完整名稱、簡稱、英文代碼、學院名稱
- 如果查詢中沒有提到某個屬性，該屬性的列表為空陣列
- 關鍵字要詳細且全面

範例：
輸入：星期一下午的資工課
輸出：
{
  "code": [],
  "name": [],
  "teacher": [],
  "time": ["M", "星期一", "週一", "禮拜一", "56789", "5", "6", "7", "8", "9", "下午", "M5", "M6", "M7", "M8", "M9"],
  "credits": [],
  "room": [],
  "cos_id": [],
  "acy": [],
  "sem": [],
  "memo": [],
  "cos_type": [],
  "dep_name": ["資工", "資訊工程", "資訊工程學系", "資工系", "DCP", "CS", "CSIE", "資訊學院", "電資學院", "資訊科學", "IOC"],
  "dep_id": [],
  "paths": ["資訊學院", "資工", "資訊工程", "DCP", "CS", "電資學院", "CSIE"]
}

現在為此查詢生成關鍵字集合：${userQuery}

只輸出 JSON：`;

        const step0Response = await callAIForKeywordGeneration(step0Prompt, 0.7); // temperature 高一點

        // 解析 JSON
        const jsonMatch = step0Response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedSets = JSON.parse(jsonMatch[0]);
          attributeSets = { ...attributeSets, ...parsedSets };
        }

        // 只輸出最終結果
        console.log('✅ Step 0 完成 - 屬性關鍵字集合:');
        for (const [attr, keywords] of Object.entries(attributeSets)) {
          if (keywords.length > 0) {
            console.log(`  ${attr}: ${JSON.stringify(keywords)}`);
          }
        }
      } catch (error) {
        console.error('❌ Step 0 失敗:', error.message);
        // Fallback 邏輯
        if (userQuery.includes('星期一') || userQuery.includes('M')) attributeSets.time = ['M', '星期一'];
        if (userQuery.includes('下午')) attributeSets.time.push('56789', '下午');
        if (userQuery.includes('資工')) {
          attributeSets.dep_name = ['資工', 'DCP', 'CS'];
          attributeSets.paths = ['資訊學院', '資工'];
        }
      }

      // ===== Step 1：粗篩（分 20 塊並行，淘汰完全不相干的課程）=====
      console.log('\n🔍 ===== Step 1：AI 粗篩（20塊並行，淘汰不相干課程）=====');

      const CHUNK_SIZE = Math.ceil(allCourses.length / 20);
      const chunks = [];
      for (let i = 0; i < allCourses.length; i += CHUNK_SIZE) {
        chunks.push(allCourses.slice(i, i + CHUNK_SIZE));
      }

      const step1Promises = chunks.map(async (chunk, idx) => {
        const courseList = chunk.map((c, i) => {
          const pathsText = (c.paths || []).map(p =>
            [p.college, p.department, p.category].filter(x => x).join('/')
          ).join('; ');

          return `${i + 1}. ${c.name}|${c.teacher || ''}|${c.time || ''}|${c.dep_name || ''}|${pathsText || ''}|${c.cos_type || ''}`;
        }).join('\n');

        const step1Prompt = `從課程中找出可能與查詢相關的課程編號

查詢：${userQuery}

關鍵字集合：
${Object.entries(attributeSets).filter(([k, v]) => v.length > 0).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n')}

課程列表：
${courseList}

任務：淘汰與查詢「完全不相干」的課程
- 只要課程的任一屬性與對應的關鍵字集合有任何關聯，就保留
- 寬鬆篩選，寧可多選不可漏選
- 只輸出要保留的課程編號（逗號分隔）或「無」`;

        const response = await callAIForKeywordGeneration(step1Prompt, 0.3);

        // 解析編號
        const numbers = response.match(/\d+/g);
        if (!numbers || numbers.length === 0) return [];

        return numbers.map(n => parseInt(n))
          .filter(n => n >= 1 && n <= chunk.length)
          .map(n => chunk[n - 1]);
      });

      const step1Results = await Promise.all(step1Promises);
      const step1Courses = step1Results.flat();

      console.log(`✅ Step 1 完成 - 保留 ${step1Courses.length}/${allCourses.length} 門課程`);

      // ===== Step 2：精準匹配（逐一檢查屬性）=====
      console.log('\n🔍 ===== Step 2：AI 精準匹配（屬性逐一檢查）=====');

      const courseList = step1Courses.map((c, i) => {
        const pathsText = (c.paths || []).map(p =>
          [p.college, p.department, p.category].filter(x => x).join('/')
        ).join('; ');

        const parts = [
          `${i + 1}. ${c.name}`,
          c.teacher || '',
          c.time || '',
          c.room || '',
          c.dep_name || '',
          pathsText ? `路徑:${pathsText}` : '',
          c.cos_type || '',
          c.credits ? `${c.credits}學分` : '',
          c.code || '',
          c.memo || ''
        ].filter(p => p).join('｜');
        return parts;
      }).join('\n');

      const step2Prompt = `從課程中找出完全符合查詢的課程編號

查詢：${userQuery}

屬性關鍵字集合：
${Object.entries(attributeSets).filter(([k, v]) => v.length > 0).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n')}

課程列表：
${courseList}

匹配規則：
- 對於每個非空的屬性關鍵字集合，課程的對應屬性必須匹配集合中至少一項
- 如果某個屬性的關鍵字集合為空，則不檢查該屬性
- 時間條件是最優先的，時間不符合直接淘汰
- 檢查順序：先時間，再系所/路徑，最後其他屬性

只輸出完全符合的課程編號（逗號分隔）或「無」：`;

      const step2Response = await callAIForKeywordGeneration(step2Prompt, 0.1);

      // 解析編號
      const numbers = step2Response.match(/\d+/g);
      if (!numbers || numbers.length === 0) {
        console.log('❌ Step 2 未找到符合的課程');
        return [];
      }

      const finalCourses = numbers.map(n => parseInt(n))
        .filter(n => n >= 1 && n <= step1Courses.length)
        .map(n => step1Courses[n - 1]);

      console.log(`✅ Step 2 完成 - 最終匹配 ${finalCourses.length} 門課程:`);
      finalCourses.forEach((c, i) => {
        const pathsText = (c.paths || []).map(p => [p.college, p.department].filter(x => x).join('/')).join('; ');
        console.log(`  ${i + 1}. ${c.name} | ${c.time} | ${c.dep_name} | 路徑:${pathsText || '無'}`);
      });

      // 提取課程ID（與原函數返回格式一致）
      const courseIds = finalCourses.map(course => course.cos_id || course.code);
      console.log(`🎯 返回 ${courseIds.length} 個課程ID`);

      return courseIds;
