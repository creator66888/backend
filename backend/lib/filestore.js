const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Synchronous read/write keeps read-check-write atomic for the single local
// process (no interleaving between concurrent requests).
function readRows(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.appointments)) return parsed.appointments;
    if (parsed && Array.isArray(parsed.messages)) return parsed.messages;
    return fallback;
  } catch (_) {
    return fallback;
  }
}

function writeRows(file, rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n', 'utf8');
}

function byNewest(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

// --- appointments ---

function listAppointments() {
  return readRows(APPOINTMENTS_FILE, []).slice().sort(byNewest);
}

function bookedTimesForDate(date) {
  return readRows(APPOINTMENTS_FILE, [])
    .filter((row) => row.date === date && row.status !== 'cancelled')
    .map((row) => row.time);
}

function countForDate(date) {
  return readRows(APPOINTMENTS_FILE, []).filter((row) => row.date === date).length;
}

function insertAppointment(row) {
  const rows = readRows(APPOINTMENTS_FILE, []);
  rows.push(row);
  writeRows(APPOINTMENTS_FILE, rows);
  return row;
}

function updateAppointmentStatus(id, status) {
  const rows = readRows(APPOINTMENTS_FILE, []);
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  row.status = status;
  writeRows(APPOINTMENTS_FILE, rows);
  return row;
}

function deleteAppointment(id) {
  const rows = readRows(APPOINTMENTS_FILE, []);
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  writeRows(APPOINTMENTS_FILE, next);
  return true;
}

// --- messages (complaints / feedback) ---

function listMessages() {
  return readRows(MESSAGES_FILE, []).slice().sort(byNewest);
}

function insertMessage(msg) {
  const rows = readRows(MESSAGES_FILE, []);
  const row = {
    id: 'msg-' + crypto.randomBytes(6).toString('hex'),
    name: msg.name,
    phone: msg.phone || '',
    email: msg.email || '',
    subject: msg.subject || '',
    message: msg.message,
    status: 'new',
    createdAt: new Date().toISOString(),
  };
  rows.push(row);
  writeRows(MESSAGES_FILE, rows);
  return row;
}

module.exports = {
  listAppointments,
  bookedTimesForDate,
  countForDate,
  insertAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  listMessages,
  insertMessage,
};
