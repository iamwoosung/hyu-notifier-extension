const amqplib = require('amqplib');
const logger = require('../modules/logger');

async function connectWithRetry(handlers, attempt = 1) {
  // 환경변수 검증
  const requiredVars = ['MQ_HOST', 'MQ_PORT', 'MQ_USER', 'MQ_PASSWORD', 'MQ_EXCHANGE', 'MQ_QUEUE', 'MQ_ROUTING_KEY'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 누락되었습니다: ${missing.join(', ')}`);
  }

  // 환경변수에서 MQ 접속정보 읽기
  const mqHost = process.env.MQ_HOST;
  const mqPort = parseInt(process.env.MQ_PORT);
  const mqUser = process.env.MQ_USER;
  const mqPassword = process.env.MQ_PASSWORD;
  const url = `amqp://${mqUser}:${mqPassword}@${mqHost}:${mqPort}`;

  // 환경변수에서 Exchange, Queue, RoutingKey 읽기
  const EXCHANGE = process.env.MQ_EXCHANGE;
  const QUEUE = process.env.MQ_QUEUE;
  const ROUTING_KEY = process.env.MQ_ROUTING_KEY;
  const RECONNECT_INTERVAL = 5000; // 5초

  try {
    const conn = await amqplib.connect(url);
    const channel = await conn.createChannel();

    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(QUEUE, { durable: true });
    await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

    // SELC 라우팅 키가 있으면 같은 큐에 추가 바인딩
    const SELC_ROUTING_KEY = process.env.MQ_SELC_ROUTING_KEY;
    if (SELC_ROUTING_KEY) {
      await channel.bindQueue(QUEUE, EXCHANGE, SELC_ROUTING_KEY);
      logger.info(`RabbitMQ SELC 바인딩 추가 [key=${SELC_ROUTING_KEY}]`);
    }

    channel.prefetch(1); // 한 번에 하나씩 처리

    logger.info(`RabbitMQ Consumer : ready [exchange=${EXCHANGE}, queue=${QUEUE}, key=${ROUTING_KEY}]`);

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return;

      let content;
      try {
        content = JSON.parse(msg.content.toString());
      } catch (e) {
        logger.error(`[MQ] 메시지 파싱 실패: ${e.message}`);
        channel.nack(msg, false, false); // 파싱 불가 → 폐기
        return;
      }

      logger.info(`[MQ RECEIVE] type=${content.type} | messageId=${content.messageId}`);

      const handler = handlers[content.type];
      if (!handler) {
        logger.warn(`[MQ] 알 수 없는 메시지 타입: ${content.type}`);
        channel.nack(msg, false, false); // 폐기
        return;
      }

      try {
        await handler(content);
        channel.ack(msg);
      } catch (e) {
        logger.error(`[MQ] 핸들러 처리 실패 (type=${content.type}): ${e.message}`);
        channel.nack(msg, false, true); // 재큐
      }
    });

    conn.on('error', (err) => {
      logger.error(`[MQ] 연결 오류: ${err.message}`);
    });

    conn.on('close', () => {
      logger.warn('[MQ] 연결 종료. 5초 후 재연결 시도...');
      setTimeout(() => connectWithRetry(handlers, attempt + 1), RECONNECT_INTERVAL);
    });

  } catch (err) {
    logger.error(`[MQ] 연결 실패 (시도 ${attempt}): ${err.message}`);
    logger.warn(`[MQ] ${RECONNECT_INTERVAL / 1000}초 후 재시도...`);
    setTimeout(() => connectWithRetry(handlers, attempt + 1), RECONNECT_INTERVAL);
  }
}

module.exports = { connect: connectWithRetry };
