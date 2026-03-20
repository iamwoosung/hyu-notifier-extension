// ==========================================
// SELC 학점인정 컨소시엄 정보 취득 스크립트 (main2.js) - v2 (수정반영)
// ==========================================
const MY_COOKIE = "RSN_JSESSIONID=aaaDySt26a_BL55I9tDWzykzTzpZQ8Xg1llAR0S8ob8P81HyJc7iFhQyUHNO;";
const isNodeEnv = typeof window === 'undefined';
const BASE_URL = 'https://selc.or.kr';

async function fetchSelcData() {
    console.log("🔄 [1/3] SELC 나의 강의실 과목 리스트 가져오는 중...");

    let headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    };
    if (isNodeEnv) {
        headers['Cookie'] = MY_COOKIE;
    }

    try {
        const courseRes = await fetch(`${BASE_URL}/lms/lms/myLecture/doListView.do?mnid=201008840728`, {
            method: 'GET',
            headers: headers,
            credentials: isNodeEnv ? 'omit' : 'include'
        });

        const courseHtml = await courseRes.text();
        if (courseHtml.includes('lgin.do') || courseHtml.includes('잘못된 URL입니다')) {
            console.error("❌ SELC 로그인이 되어있지 않거나 세션이 만료되었습니다. (쿠키 재발급 필요)");
            return;
        }

        const courses = parseCourseList(courseHtml);
        if (courses.length === 0) {
            console.log("⚠️ 수강 중인 과목을 찾을 수 없거나 HTML DOM 구조가 다릅니다.");
            return;
        }

        console.log(`✅ 총 ${courses.length}개의 과목을 찾았습니다. 과제 및 영상 현황 조회를 시작합니다...\n`);

        for (const course of courses) {
            console.log(`=================================================`);
            console.log(`📘 과목: ${course.title}`);
            console.log(`=================================================`);

            await fetchCourseDetails(course.course_id, course.class_no, headers);
            console.log('\n'); // 과목 간 띄어쓰기
        }
        console.log(`🎉 모든 데이터 동기화가 완료되었습니다!`);
    } catch (e) {
        console.error("❌ 통신 중 예외가 발생했습니다:", e);
    }
}

async function fetchCourseDetails(courseId, classNo, headers) {
    const postHeaders = {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    // [0] 강의실 입장 (서버 세션 변수 초기화)
    try {
        const enterPayload = new URLSearchParams();
        enterPayload.append('mnid', '201008254671');
        enterPayload.append('course_id', courseId);
        enterPayload.append('class_no', classNo);
        enterPayload.append('term_year', courseId.substring(0, 4));
        enterPayload.append('term_cd', courseId.substring(4, 6));

        await fetch(`${BASE_URL}/lms/lms/class/classroom/doViewClassRoom.do`, {
            method: 'POST',
            headers: postHeaders,
            body: enterPayload.toString(),
            credentials: isNodeEnv ? 'omit' : 'include'
        });
    } catch(e) { /* 입장 실패 무시하고 진행 */ }

    // [1] 과제 조회 (jqGrid JSON API로 직접 요청)
    try {
        const reportPayload = new URLSearchParams();
        reportPayload.append('q_course_id', courseId);
        reportPayload.append('q_class_no', classNo);
        reportPayload.append('page', '1'); // jqGrid 기본 필수 파라미터 (서버단 NullPointerException 방지)
        reportPayload.append('rows', '15'); // 넉넉하게 15개 과제 조회

        const reportRes = await fetch(`${BASE_URL}/lms/lms/class/report/stud/doListReport.do`, {
            method: 'POST',
            headers: postHeaders,
            body: reportPayload.toString(),
            credentials: isNodeEnv ? 'omit' : 'include'
        });

        const reportText = await reportRes.text();
        if (isNodeEnv) require('fs').writeFileSync('debug_report.json', reportText);
        
        const reportJson = JSON.parse(reportText);
        
        if (reportJson && reportJson.rows) {
            if (reportJson.rows.length === 0) {
                console.log(`  📌 [과제] 등록된 과제가 없습니다.`);
            } else {
                reportJson.rows.forEach((row, i) => {
                    const title = row.report_nm ? row.report_nm.replace(/<[^>]*>?/gm, '') : `과제 ${i + 1}`;
                    const isSubmitted = row.apply_yn === 'Y';
                    const icon = isSubmitted ? '✅' : '❌';
                    const statusText = isSubmitted ? '제출 완료' : '미제출';
                    console.log(`  📌 [과제] ${icon} ${title} (상태: ${statusText})`);
                });
            }
        } else {
            console.log(`  📌 [과제] 과제 리스트를 분석할 수 없습니다. (debug_report.json 확인)`);
        }
    } catch (e) {
        console.log(`  [과제] 데이터 불러오기 실패 (부분 수집): ${e.message}`);
    }

    // [2] 영상(강의) 조회 (courseSchedule - 1~16주차 병렬 수집)
    try {
        const schedulePayload = new URLSearchParams();
        schedulePayload.append('mnid', '201008103161');
        schedulePayload.append('course_id', courseId);
        schedulePayload.append('class_no', classNo);
        schedulePayload.append('week_no', '1');

        const studyRes = await fetch(`${BASE_URL}/lms/lms/class/courseSchedule/doListView.do`, {
            method: 'POST',
            headers: postHeaders,
            body: schedulePayload.toString(),
            credentials: isNodeEnv ? 'omit' : 'include'
        });

        const studyHtml1 = await studyRes.text();
        if (isNodeEnv) require('fs').writeFileSync('debug_schedule.html', studyHtml1);
        
        let maxWeek = 15;
        const weekMatches = studyHtml1.match(/fncListFunction\('(\d+)'\)/g);
        if (weekMatches) {
            maxWeek = weekMatches.length; // 보통 15개 또는 16개 주차 탭 개수 추출
        }

        console.log(`\n  --- 1주차 ---`);
        parseVideos(studyHtml1);

        const weekPromises = [];
        for (let w = 2; w <= maxWeek; w++) {
            const wPayload = new URLSearchParams();
            wPayload.append('mnid', '201008103161');
            wPayload.append('course_id', courseId);
            wPayload.append('class_no', classNo);
            wPayload.append('week_no', w.toString());
            
            weekPromises.push(
                fetch(`${BASE_URL}/lms/lms/class/courseSchedule/doListView.do`, {
                    method: 'POST', headers: postHeaders, body: wPayload.toString(), credentials: isNodeEnv ? 'omit' : 'include'
                }).then(r => r.text()).catch(e => '')
            );
        }

        const htmlResults = await Promise.all(weekPromises);
        htmlResults.forEach((html, idx) => {
            console.log(`\n  --- ${idx + 2}주차 ---`);
            parseVideos(html);
        });
        
    } catch (e) {
        console.log(`  [영상] 데이터 불러오기 실패: ${e.message}`);
    }
}

function parseCourseList(html) {
    const courses = [];
    if (isNodeEnv) {
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        $('table.list tbody tr').each((i, el) => {
            const entryA = $(el).find('a.classin_new');
            if (entryA.length > 0) {
                const title = $(el).find('td').eq(3).text().replace(/\s+/g, ' ').trim() ||
                    $(el).find('td.ag_l').text().replace(/\s+/g, ' ').trim();
                const course_id = entryA.attr('course_id');
                const class_no = entryA.attr('class_no');
                if (course_id) courses.push({ title, course_id, class_no });
            }
        });
    } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('table.list tbody tr').forEach(tr => {
            const entryA = tr.querySelector('a.classin_new');
            if (entryA) {
                const titleTd = tr.querySelector('td.ag_l') || tr.cells[3];
                const title = titleTd ? titleTd.textContent.replace(/\s+/g, ' ').trim() : '알 수 없는 과목';
                courses.push({
                    title: title,
                    course_id: entryA.getAttribute('course_id'),
                    class_no: entryA.getAttribute('class_no')
                });
            }
        });
    }
    return courses;
}

function parseVideos(html) {
    let videoCount = 0;

    if (isNodeEnv) {
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);

        $('div.lec_cont').each((i, el) => {
            const titleFull = $(el).find('.learn_act_box .title').text();
            if (!titleFull) return;
            const titleText = titleFull.split('|')[0].replace(/\s+/g, ' ').trim();
            const progressText = $(el).find('.learn_act_box dl dd').last().text().replace(/\s+/g, ' ').trim();
            
            const isVideo = $(el).find('img[src*="movie"]').length > 0;
            if (isVideo) {
                const icon = (progressText.includes('100%') || progressText.includes('완료') || progressText.includes('O')) ? '✅' : '⏳';
                console.log(`  🎬 [영상] ${icon} ${titleText} (상태: ${progressText})`);
                videoCount++;
            } else {
                const isQuiz = $(el).find('img[src*="quiz"]').length > 0;
                console.log(`  📝 [${isQuiz ? "퀴즈" : "기타"}] ⏳ ${titleText} (상태: ${progressText})`);
            }
        });
    } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('div.lec_cont').forEach(el => {
            const titleEl = el.querySelector('.learn_act_box .title');
            if (!titleEl) return;
            const titleText = titleEl.textContent.split('|')[0].replace(/\s+/g, ' ').trim();
            
            const dds = el.querySelectorAll('.learn_act_box dl dd');
            const progressText = dds.length > 0 ? dds[dds.length - 1].textContent.replace(/\s+/g, ' ').trim() : '';
            
            const isVideo = el.querySelector('img[src*="movie"]') !== null;
            if (isVideo) {
                const icon = (progressText.includes('100%') || progressText.includes('완료') || progressText.includes('O')) ? '✅' : '⏳';
                console.log(`  🎬 [영상] ${icon} ${titleText} (상태: ${progressText})`);
                videoCount++;
            } else {
                const isQuiz = el.querySelector('img[src*="quiz"]') !== null;
                console.log(`  📝 [${isQuiz ? "퀴즈" : "기타"}] ⏳ ${titleText} (상태: ${progressText})`);
            }
        });
    }

    if (videoCount === 0) {
        console.log(`  🎬 [영상] 등록된 강의 영상이 없거나 아직 진행할 수 없습니다.`);
    }
}

if (isNodeEnv) {
    fetchSelcData();
}
