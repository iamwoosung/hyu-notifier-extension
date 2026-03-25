const session = require('../../../global/modules/session');
const db = require('../../../global/config/db');
const logger = require('../../../global/modules/logger');

async function getSubjects(req, res) {
  const { session: sessionId } = req.query;

  const user = session.get(sessionId);
  if (!user) return res.status(401).json({ error: '유효하지 않은 세션입니다.' });

  try {
    const rows = await db.query({ SP_NAME: 'SUBJECT_LIST', TABLE: true, p_UserNo: user.UserNo });

    const subjects = (rows ?? []).map(s => ({
      subjectNo: s.SubjectNo,
      subjectCode: s.SubjectCode,
      subjectName: s.SubjectName,
      semester: s.Semester,
    }));

    res.json({ subjects });
  } catch (e) {
    logger.error(`[SUBJECT] 조회 실패: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { getSubjects };
