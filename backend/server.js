const express = require('express');
const cors = require('cors');

// Note: Removed local 'fs' and 'path' file writing logic as they don't persist on Vercel.
// Replace the readAppointments/writeAppointments placeholders with your cloud database client!

const app = express();
const PORT = process.env.PORT || 3000;
const CLINIC_NAME = 'XYZ Dental Clinic';

app.use(cors({
  origin: 'https://frontend-1-sage.vercel.app'
}));

app.use(express.json());

// Mock fallback logic (TEMPORARY - Will reset constantly on Vercel until connected to a real DB)
let memoryAppointments = []; 

function readAppointments() {
  return memoryAppointments;
}
function writeAppointments(appointments) {
  memoryAppointments = appointments;
}

function generateId() {
  return 'id-' + Math.random().toString(36).slice(2, 14);
}

function getNextToken(date) {
  const appointments = readAppointments();
  const dayAppts = appointments.filter(a => a.date === date);
  const num = String(dayAppts.length + 1).padStart(3, '0');
  return 'BS-' + num;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// CRITICAL FIX: Added leading slashes "/" to all endpoints below

// CREATE APPOINTMENT
app.post('/api/appointments', (req, res) => {
  const { service, name, phone, email } = req.body;
  if (!service || !name || !phone || !email) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const appointments = readAppointments();
  const today = new Date();
  const date = today.toISOString().slice(0, 10);
  const token = getNextToken(date);

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

  appointments.push(newAppt);
  writeAppointments(appointments);
  res.status(201).json(newAppt);
});

// GET APPOINTMENTS
app.get('/api/appointments', (req, res) => {
  res.json(readAppointments());
});

// UPDATE APPOINTMENT
app.patch('/api/appointments/:id', (req, res) => {
  const { status } = req.body;
  if (!status || !['confirmed', 'cancelled', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const appointments = readAppointments();
  const appt = appointments.find(a => a.id === req.params.id);
  if (!appt) {
    return res.status(404).json({ error: 'Appointment not found.' });
  }

  appt.status = status;
  writeAppointments(appointments);
  res.json(appt);
});

// DELETE APPOINTMENT
app.delete('/api/appointments/:id', (req, res) => {
  let appointments = readAppointments();
  const index = appointments.findIndex(a => a.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Appointment not found.' });
  }

  appointments.splice(index, 1);
  writeAppointments(appointments);
  res.json({ success: true });
});

// CRITICAL: Export the app for Vercel's Serverless environment handler
module.exports = app;

// Keep listen alive for local environment testing
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`${CLINIC_NAME} server running on port ${PORT}`);
  });
}
