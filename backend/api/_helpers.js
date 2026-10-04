const db = require('../lib/db');

module.exports = {
  getPool: db.getPool,
  init: () => db.ensureSchema(),
  setCors: db.setCors,
  DAYS: db.DAYS,
};