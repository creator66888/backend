const {
  getPool,
  ensureSchema,
  getCreatedAtColumn,
  normalizeRow,
  setCors,
} = require('../lib/db');
const { createAppointment } = require('../lib/booking');

module.exports = async function handler(req, res) {
  setCors(res);
  const db = getPool();

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    await ensureSchema(db);
    const { rows } = await db.query(
      'SELECT * FROM appointments ORDER BY ' + getCreatedAtColumn() + ' DESC'
    );
    res.json(rows.map(normalizeRow));
    return;
  }

  if (req.method === 'POST') {
    const appointment = await createAppointment(db, req.body || {});
    res.status(201).json(appointment);
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.status(405).json({ error: 'Method not allowed.' });
};