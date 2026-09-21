const { getPool, init, setCors } = require('../_helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  await init();
  const db = getPool();
  const { id } = req.query;

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'PATCH') {
    const { status } = req.body || {};

    if (!status || !['confirmed', 'cancelled', 'pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }

    const { rows } = await db.query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    res.json(rows[0]);
    return;
  }

  if (req.method === 'DELETE') {
    const { rows } = await db.query(
      'DELETE FROM appointments WHERE id = $1 RETURNING id',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    res.json({ success: true });
    return;
  }

  res.setHeader('Allow', 'PATCH, DELETE, OPTIONS');
  res.status(405).json({ error: 'Method not allowed.' });
};