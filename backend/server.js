const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const CLINIC_NAME = 'XYZ Dental Clinic';

// 1. Establish Database Pool Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necessary for cloud DBs like Neon or Supabase
  }
});

// 2. Enable Cross-Origin Resource Sharing for your EXACT frontend URL
app.use(cors({
  origin: 'https://frontend-1-sage.vercel.app', // Replace with your actual frontend URL
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());

// API Status Check Route
app.get('/', (req, res) => {
  res.json({ 
    status: "online", 
    message: "Welcome to the XYZ Dental Clinic API Backend!" 
  });
});

// 3. Helper Functions for Postgres Operations
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function generateId() {
  return 'id-' + Math.random().toString(36).slice(2, 14);
}

async function getNextToken(date) {
  const query = 'SELECT COUNT(*) FROM appointments WHERE date = \$1';
  const result = await pool.query(query, [date]);
  
  // FIXED SYNTAX: Properly access the count from Postgres row array object
  const count = parseInt(result.rows[0].count, 10);
  const num = String(count + 1).padStart(3, '0');
  return 'BS-' + num;
}

// 4. API Endpoints

// CREATE APPOINTMENT
app.post('/api/appointments', async (req, res) => {
  const { service, name, phone, email } = req.body;

  if (!service || !name || !phone || !email) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const today = new Date();
    const date = today.toISOString().slice(0, 10);
    const token = await getNextToken(date);

    const newAppt = {
      id: generateId(),
      token,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      service,
      date,
      day: DAYS[today.getDay()],
      time: '09:00',
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    const insertQuery = `
      INSERT INTO appointments (id, token, name, phone, email, service, date, day, time, created_at, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    
    await pool.query(insertQuery, [
      newAppt.id, newAppt.token, newAppt.name, newAppt.phone, newAppt.email,
      newAppt.service, newAppt.date, newAppt.day, newAppt.time, newAppt.createdAt, newAppt.status
    ]);

    res.status(201).json(newAppt);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Internal server error while saving appointment.' });
  }
});

// GET ALL APPOINTMENTS
app.get('/api/appointments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM appointments ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Internal server error while fetching data.' });
  }
});

// UPDATE AN APPOINTMENT STATUS
app.patch('/api/appointments/:id', async (req, res) => {
  const { status } = req.body;

  if (!status || !['confirmed', 'cancelled', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const checkQuery = 'SELECT * FROM appointments WHERE id = \$1';
    const checkResult = await pool.query(checkQuery, [req.params.id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const updateQuery = 'UPDATE appointments SET status = \$1 WHERE id = \$2 RETURNING *';
    const result = await pool.query(updateQuery, [status, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Internal server error during update.' });
  }
});

// DELETE AN APPOINTMENT
app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const deleteQuery = 'DELETE FROM appointments WHERE id = \$1 RETURNING *';
    const result = await pool.query(deleteQuery, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Internal server error during deletion.' });
  }
});

// Export application for Vercel Serverless pipeline
module.exports = app;

// Local development server listener
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`${CLINIC_NAME} server running on port ${PORT}`);
  });
}
