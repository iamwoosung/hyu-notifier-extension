const session = require('../../../global/modules/session');
const db = require('../../../global/config/db');
const logger = require('../../../global/modules/logger');

function getMe(req, res) {
  const { session: sessionId } = req.query;

  if (!sessionId || !session.get(sessionId)) {
    return res.status(401).json({ error: '유효하지 않거나 만료된 세션입니다.' });
  }

  res.json({ user: session.get(sessionId) });
}

async function getUserSettings(req, res) {
  const { session: sessionId } = req.query;
  const user = session.get(sessionId);
  if (!user) return res.status(401).json({ error: '유효하지 않은 세션입니다.' });

  try {
    const rows = await db.query({ SP_NAME: 'USER_SETTINGS_GET', TABLE: true, p_UserNo: user.UserNo });
    const privateEmail = rows[0]?.UserPrivateEmail ?? null;
    res.json({ privateEmail });
  } catch (e) {
    logger.error(`[USER SETTINGS] 조회 실패: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

async function updateUserSettings(req, res) {
  const { session: sessionId } = req.query;
  const user = session.get(sessionId);
  if (!user) return res.status(401).json({ error: '유효하지 않은 세션입니다.' });

  const { privateEmail } = req.body ?? {};

  try {
    const [row] = await db.query({ SP_NAME: 'USER_PRIVATE_EMAIL_SET', p_UserNo: user.UserNo, p_Email: privateEmail ?? null });
    const result = row['USER_PRIVATE_EMAIL_SET'] ?? row['user_private_email_set'];
    if (result !== 0) throw new Error(`USER_PRIVATE_EMAIL_SET 실패 (code: ${result})`);
    res.json({ ok: true });
  } catch (e) {
    logger.error(`[USER SETTINGS] 업데이트 실패: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

function logout(req, res) {
  const { session: sessionId } = req.query;
  if (sessionId) session.remove(sessionId);
  res.json({ ok: true });
}

module.exports = { getMe, getUserSettings, updateUserSettings, logout };
