const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const CLINIC_NAME = 'XYZ Dental Clinic';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DATA_FILE = path.join(__dirname, 'data', 'appointments.json');
const ADMIN_PATH = '/secret-admin-page-xyz';

app.use(express.json());
app.use(express.static(FRONTEND_DIR));

function readAppointments() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw).appointments || [];
}

function writeAppointments(appointments) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ appointments }, null, 2));
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

app.get(ADMIN_PATH, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'admin.html'));
});

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
    status: 'pending',
  };
  appointments.push(newAppt);
  writeAppointments(appointments);
  res.status(201).json(newAppt);
});

app.get('frontend-iota-green-45.vercel.app/api/appointments', (req, res) => {
  res.json(readAppointments());
});

app.patch('frontend-iota-green-45.vercel.app/api/appointments/:id', (req, res) => {
  const { status } = req.body;
  if (!status || !['confirmed', 'cancelled', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const appointments = readAppointments();
  const appt = appointments.find(a => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  appt.status = status;
  writeAppointments(appointments);
  res.json(appt);
});

app.delete('frontend-iota-green-45.vercel.app/api/appointments/:id', (req, res) => {
  let appointments = readAppointments();
  const index = appointments.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Appointment not found.' });
  appointments.splice(index, 1);
  writeAppointments(appointments);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`${CLINIC_NAME} server running at frontend-iota-green-45.vercel.app:${PORT}`);
});
