const mq = require('../../../global/config/mq');
const session = require('../../../global/modules/session');
const logger = require('../../../global/modules/logger');

async function sync(req, res) {
  logger.info('[SELC sync] 요청 수신');
  logger.info(`[SELC sync] 수신된 cookies: ${JSON.stringify(req.body.cookies)}`);
  const { session: sessionId, cookies } = req.body;

  if (!sessionId || !cookies?.RSN_JSESSIONID) {
    return res.status(400).json({ error: '세션 또는 RSN_JSESSIONID 쿠키가 누락되었습니다.' });
  }

  const user = session.get(sessionId);
  if (!user) {
    return res.status(401).json({ error: '유효하지 않은 세션입니다.' });
  }

  try {
    if (!process.env.MQ_SELC_ROUTING_KEY) {
      throw new Error('MQ_SELC_ROUTING_KEY 환경변수가 필요합니다');
    }
    const routingKey = process.env.MQ_SELC_ROUTING_KEY;
    const messageId = await mq.publish(routingKey, { session: sessionId, user, cookies });
    logger.info(`[SELC sync] MQ 전송 완료 | messageId: ${messageId}`);

    res.status(202).json({ success: true, messageId });
  } catch (e) {
    logger.error(`[SELC sync] MQ 전송 실패: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
}

module.exports = { sync };
