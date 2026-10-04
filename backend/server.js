const crypto = require('crypto');
const express = require('express');
const {
  getPool,
  ensureSchema,
  ensureMessagesSchema,
  getCreatedAtColumn,
  normalizeRow,
  setCors,
  isFileStoreMode,
} = require('./lib/db');
const fileStore = require('./lib/filestore');
const { getDayAvailability, createAppointment } = require('./lib/booking');

const app = express();
const PORT = process.env.PORT || 3000;
const CLINIC_NAME = 'XYZ Dental Clinic';

app.use((req, res, next) => {
  setCors(res);
  next();
});

app.use(express.json());

function sendError(res, error) {
  const status = error.statusCode || 500;
  if (status >= 500) {
    console.error('API Error:', error);
    res.status(status).json({ error: 'Internal server error.' });
    return;
  }
  res.status(status).json({ error: error.message || 'Request could not be completed.' });
}

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Welcome to the ' + CLINIC_NAME + ' API Backend!',
  });
});

// Available time slots for a chosen date
app.get('/api/slots', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    if (!date) {
      res.status(400).json({ error: 'Missing date query parameter.' });
      return;
    }
    const db = isFileStoreMode() ? null : getPool();
    const data = await getDayAvailability(db, date);
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

// Create appointment: validates date/time, checks slot, issues token
app.post('/api/appointments', async (req, res) => {
  try {
    const db = isFileStoreMode() ? null : getPool();
    const appointment = await createAppointment(db, req.body || {});
    res.status(201).json(appointment);
  } catch (error) {
    sendError(res, error);
  }
});

// Get all appointments
app.get('/api/appointments', async (req, res) => {
  try {
    if (isFileStoreMode()) {
      res.json(fileStore.listAppointments());
      return;
    }
    const db = getPool();
    await ensureSchema(db);
    const { rows } = await db.query(
      'SELECT * FROM appointments ORDER BY ' + getCreatedAtColumn() + ' DESC'
    );
    res.json(rows.map(normalizeRow));
  } catch (error) {
    sendError(res, error);
  }
});

// Update an appointment status
app.patch('/api/appointments/:id', async (req, res) => {
  const status = req.body && req.body.status;
  if (!status || !['confirmed', 'cancelled', 'pending'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  try {
    if (isFileStoreMode()) {
      const row = fileStore.updateAppointmentStatus(req.params.id, status);
      if (!row) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      res.json(row);
      return;
    }
    const db = getPool();
    await ensureSchema(db);
    const { rows } = await db.query(
      'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    res.json(normalizeRow(rows[0]));
  } catch (error) {
    sendError(res, error);
  }
});

// Delete an appointment
app.delete('/api/appointments/:id', async (req, res) => {
  try {
    if (isFileStoreMode()) {
      if (!fileStore.deleteAppointment(req.params.id)) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      res.json({ success: true });
      return;
    }
    const db = getPool();
    await ensureSchema(db);
    const { rows } = await db.query(
      'DELETE FROM appointments WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

// Save a message (complaints / feedback) — stored in backend/data/messages.json
app.get('/api/messages', async (req, res) => {
  try {
    if (isFileStoreMode()) {
      res.json(fileStore.listMessages());
      return;
    }
    const db = getPool();
    await ensureMessagesSchema(db);
    const { rows } = await db.query('SELECT * FROM messages ORDER BY "createdAt" DESC');
    res.json(rows);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();

    if (name.length < 2 || name.length > 100) {
      res.status(400).json({ error: 'Please enter your full name (2-100 characters).' });
      return;
    }
    if (message.length < 5 || message.length > 4000) {
      res.status(400).json({ error: 'Please enter a message (5-4000 characters).' });
      return;
    }
    if (phone.length > 30 || email.length > 120 || subject.length > 100) {
      res.status(400).json({ error: 'One of the fields is too long.' });
      return;
    }

    if (isFileStoreMode()) {
      res.status(201).json(fileStore.insertMessage({ name, phone, email, subject, message }));
      return;
    }
    const db = getPool();
    await ensureMessagesSchema(db);
    const id = 'msg-' + crypto.randomBytes(6).toString('hex');
    const { rows } = await db.query(
      'INSERT INTO messages (id, name, phone, email, subject, message) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, name, phone, email, subject, message]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    sendError(res, error);
  }
});

// Export application for Vercel Serverless pipeline
module.exports = app;

// Local development server listener
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(CLINIC_NAME + ' server running on port ' + PORT);
  });
}