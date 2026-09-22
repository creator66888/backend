const { getPool, ensureSchema, setCors } = require('../lib/db');
const { getDayAvailability } = require('../lib/booking');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const date = String((req.query && req.query.date) || '').trim();
    if (!date) {
      res.status(400).json({ error: 'Missing date query parameter.' });
      return;
    }
    const db = getPool();
    const data = await getDayAvailability(db, date);
    res.json(data);
    return;
  }

  res.setHeader('Allow', 'GET, OPTIONS');
  res.status(405).json({ error: 'Method not allowed.' });
};