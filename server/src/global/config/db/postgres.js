const { Pool } = require('pg');
const logger = require('../../modules/logger');

const RECONNECT_INTERVAL = 5000; // 5초

// 환경변수 검증
const requiredDBVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingDBVars = requiredDBVars.filter(v => !process.env[v]);
if (missingDBVars.length > 0) {
  const errorMsg = `필수 DB 환경변수가 누락되었습니다: ${missingDBVars.join(', ')}`;
  console.error(errorMsg);
  // 초기화 시점이 아직 logger가 준비되지 않았을 수 있으므로 exit하지 않음
}

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const initWithRetry = async (attempt = 1) => {
  try {
    const client = await pool.connect();
    client.release();
    logger.info('PostgreSQL Connection : success');
    return true;
  } catch (error) {
    logger.error(`PostgreSQL Connection : error ${error.message} (시도 ${attempt})`);
    logger.warn(`${RECONNECT_INTERVAL / 1000}초 후 재시도...`);
    await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));
    return await initWithRetry(attempt + 1);
  }
};

async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    logger.error(`[DB QUERY ERROR] ${err.message}`);
    throw err;
  }
}

module.exports = { query, init: initWithRetry };
