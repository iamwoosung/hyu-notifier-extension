const { Pool } = require('pg');
const logger = require('./logger');

const RECONNECT_INTERVAL = 5000; // 5초

// 환경변수 검증
const requiredDBVars = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingDBVars = requiredDBVars.filter(v => !process.env[v]);
if (missingDBVars.length > 0) {
  const errorMsg = `필수 DB 환경변수가 누락되었습니다: ${missingDBVars.join(', ')}`;
  console.error(errorMsg);
  process.exit(1);
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

async function query({ SP_NAME, TABLE, ...params }) {
  if (!SP_NAME) {
    throw new Error('SP_NAME is required');
  }

  const values = Object.values(params);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = TABLE
    ? `SELECT * FROM "${SP_NAME}"(${placeholders})`
    : `SELECT "${SP_NAME}"(${placeholders})`;

  logger.info(`[SP REQUEST] ${sql} | params: ${JSON.stringify(values)}`);
  try {
    const result = await pool.query(sql, values);
    logger.info(`[SP RESULT ] ${SP_NAME} | rows: ${result.rows.length}`);
    return result.rows;
  } catch (err) {
    logger.error(`[SP ERROR  ] ${SP_NAME} | ${err.message}`);
    throw err;
  }
}

module.exports = { query, init: initWithRetry };
