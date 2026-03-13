const amqplib = require('amqplib');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../modules/logger');

const RECONNECT_INTERVAL = 5000; // 5초

let channel = null;

// 환경변수 검증
const requiredMQVars = ['MQ_HOST', 'MQ_PORT', 'MQ_USER', 'MQ_PASSWORD', 'MQ_EXCHANGE'];
const missingMQVars = requiredMQVars.filter(v => !process.env[v]);
if (missingMQVars.length > 0) {
  const errorMsg = `필수 MQ 환경변수가 누락되었습니다: ${missingMQVars.join(', ')}`;
  console.error(errorMsg);
  // 초기화 시점이 아직 logger가 준비되지 않았을 수 있으므로 exit하지 않고 에러 발생
}

async function initWithRetry(attempt = 1) {
  // 환경변수에서 MQ 접속정보 읽기
  const mqHost = process.env.MQ_HOST;
  const mqPort = parseInt(process.env.MQ_PORT);
  const mqUser = process.env.MQ_USER;
  const mqPassword = process.env.MQ_PASSWORD;
  const url = `amqp://${mqUser}:${mqPassword}@${mqHost}:${mqPort}`;

  // 환경변수에서 Exchange 읽기
  const EXCHANGE = process.env.MQ_EXCHANGE;

  try {
    const conn = await amqplib.connect(url);
    channel = await conn.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    logger.info('RabbitMQ Connection : success');

    conn.on('error', (err) => {
      logger.error(`[MQ] 연결 오류: ${err.message}`);
    });

    conn.on('close', () => {
      logger.warn('[MQ] 연결 종료. 5초 후 재연결 시도...');
      channel = null;
      setTimeout(() => initWithRetry(attempt + 1), RECONNECT_INTERVAL);
    });

  } catch (err) {
    logger.error(`RabbitMQ Connection : error ${err.message} (시도 ${attempt})`);
    logger.warn(`${RECONNECT_INTERVAL / 1000}초 후 재시도...`);
    await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));
    return await initWithRetry(attempt + 1);
  }
}

async function publish(routingKey, payload) {
  if (!channel) {
    throw new Error('MQ channel not initialized');
  }

  const EXCHANGE = process.env.MQ_EXCHANGE;

  const message = {
    type: routingKey.toUpperCase().replace(/\./g, '_'),
    messageId: uuidv4(),
    timestamp: new Date().toISOString(),
    payload,
  };

  try {
    channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    logger.info(`[MQ PUBLISH] ${routingKey} | messageId: ${message.messageId}`);
    return message.messageId;
  } catch (err) {
    logger.error(`[MQ PUBLISH ERROR] ${routingKey} | ${err.message}`);
    throw err;
  }
}

module.exports = { init: initWithRetry, publish };
