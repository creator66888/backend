const { getPool, init, DAYS, setCors } = require('./_helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  await init();
  const db = getPool();

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const { rows } = await db.query(
      'SELECT * FROM appointments ORDER BY "createdAt" DESC'
    );
    res.json(rows);
    return;
  }

  if (req.method === 'POST') {
    const { service, name, phone, email } = req.body || {};

    if (!service || !name || !phone || !email) {
      res.status(400).json({ error: 'Missing required fields.' });
      return;
    }

    const today = new Date();
    const date = today.toISOString().slice(0, 10);
    const day = DAYS[today.getDay()];

    const countRes = await db.query(
      'SELECT COUNT(*)::int AS c FROM appointments WHERE date = $1',
      [date]
    );
    const num = String(countRes.rows[0].c + 1).padStart(3, '0');
    const token = 'BS-' + num;

    const id = 'id-' + Math.random().toString(36).slice(2, 14);

    const { rows } = await db.query(
      `INSERT INTO appointments
        (id, token, name, phone, email, service, date, day, time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '09:00', 'pending')
       RETURNING *`,
      [id, token, name.trim(), phone.trim(), email.trim(), service, date, day]
    );

    res.status(201).json(rows[0]);
    return;
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  res.status(405).json({ error: 'Method not allowed.' });
};