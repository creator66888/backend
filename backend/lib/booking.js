const crypto = require('crypto');
const {
  ensureSchema,
  getCreatedAtColumn,
  normalizeRow,
  DAYS,
} = require('./db');

const SLOT_MINUTES = 30;
const DAYS_AHEAD_LIMIT = 30;
const LEAD_MINUTES = 15;

// [openHour, closeHour] in 24h format; null = closed that weekday.
const HOURS_BY_DAY = [
  null, // Sunday
  [9, 17], // Monday
  [9, 17], // Tuesday
  [9, 17], // Wednesday
  [9, 17], // Thursday
  [9, 17], // Friday
  [9, 13], // Saturday
];

const ALLOWED_SERVICES = [
  'Teeth Cleaning',
  'Whitening',
  'Root Canal',
  'Braces & Aligners',
  'Dental Implants',
  'Kids Dentistry',
];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(min) {
  return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
}

function formatTime12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + pad2(m) + ' ' + suffix;
}

function isValidYMD(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function toYMD(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayYMD() {
  return toYMD(new Date());
}

function addDaysYMD(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

function maxDateYMD() {
  return addDaysYMD(DAYS_AHEAD_LIMIT);
}

function dayIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function slotTimesForWindow(windowHours) {
  if (!windowHours) return [];
  const [openHour, closeHour] = windowHours;
  const out = [];
  for (let m = openHour * 60; m + SLOT_MINUTES <= closeHour * 60; m += SLOT_MINUTES) {
    out.push(fromMinutes(m));
  }
  return out;
}

function slotTimesForDate(dateStr) {
  if (!isValidYMD(dateStr)) return [];
  return slotTimesForWindow(HOURS_BY_DAY[dayIndex(dateStr)]);
}

function remainingLeadMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + LEAD_MINUTES;
}

async function getDayAvailability(db, dateStr) {
  if (!isValidYMD(dateStr)) {
    throw httpError(400, 'Invalid date format. Use YYYY-MM-DD.');
  }
  await ensureSchema(db);

  const idx = dayIndex(dateStr);
  const windowHours = HOURS_BY_DAY[idx];
  const today = todayYMD();
  const inWindow = dateStr >= today && dateStr <= maxDateYMD();

  if (!windowHours || !inWindow) {
    return {
      date: dateStr,
      day: DAYS[idx],
      open: false,
      reason: windowHours ? 'unavailable' : 'closed',
      slots: [],
    };
  }

  const starts = slotTimesForWindow(windowHours);
  const { rows } = await db.query(
    `SELECT time FROM appointments WHERE date = $1 AND status <> 'cancelled'`,
    [dateStr]
  );
  const booked = new Set(rows.map((r) => r.time));
  const isToday = dateStr === today;
  const lead = remainingLeadMinutes();

  const slots = starts.map((time) => {
    let status = 'available';
    if (booked.has(time)) status = 'booked';
    else if (isToday && toMinutes(time) <= lead) status = 'past';
    return {
      time,
      label: formatTime12(time),
      status,
      available: status === 'available',
    };
  });

  return { date: dateStr, day: DAYS[idx], open: true, reason: null, slots };
}

function validateBookingInput(input) {
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').trim();
  const email = String(input.email || '').trim();
  const service = String(input.service || '').trim();
  const date = String(input.date || '').trim();
  const time = String(input.time || '').trim();

  if (!ALLOWED_SERVICES.includes(service)) {
    return { ok: false, error: 'Please select a valid service.' };
  }
  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: 'Please enter your full name (2-100 characters).' };
  }
  if (!/^[\d\s+()-]{7,20}$/.test(phone)) {
    return { ok: false, error: 'Please enter a valid phone number.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!isValidYMD(date)) {
    return { ok: false, error: 'Please choose a valid appointment date.' };
  }
  const today = todayYMD();
  if (date < today) {
    return { ok: false, error: 'The appointment date cannot be in the past.' };
  }
  if (date > maxDateYMD()) {
    return {
      ok: false,
      error: 'Appointments can be booked up to ' + DAYS_AHEAD_LIMIT + ' days ahead.',
    };
  }
  const windowHours = HOURS_BY_DAY[dayIndex(date)];
  if (!windowHours) {
    return { ok: false, error: 'The clinic is closed on Sundays. Please pick another date.' };
  }
  if (!/^\d{2}:\d{2}$/.test(time) || !slotTimesForWindow(windowHours).includes(time)) {
    return { ok: false, error: 'Please select a valid time slot.' };
  }
  if (date === today && toMinutes(time) <= remainingLeadMinutes()) {
    return {
      ok: false,
      error: 'That slot is too soon to book. Please pick a later time or another day.',
    };
  }

  return {
    ok: true,
    data: { service, name, phone, email, date, time, day: DAYS[dayIndex(date)] },
  };
}

async function createAppointment(db, body) {
  const validated = validateBookingInput(body || {});
  if (!validated.ok) throw httpError(400, validated.error);
  const { service, name, phone, email, date, time, day } = validated.data;

  await ensureSchema(db);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize bookings per date so token numbers and slot checks never race.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'appointments-' + date,
    ]);

    const taken = await client.query(
      `SELECT id FROM appointments
        WHERE date = $1 AND time = $2 AND status <> 'cancelled'
        LIMIT 1`,
      [date, time]
    );
    if (taken.rows.length > 0) {
      throw httpError(409, 'This time slot was just booked. Please choose another slot.');
    }

    const countRes = await client.query(
      'SELECT COUNT(*)::int AS c FROM appointments WHERE date = $1',
      [date]
    );
    const token = 'BS-' + String(countRes.rows[0].c + 1).padStart(3, '0');
    const id = 'id-' + crypto.randomBytes(6).toString('hex');
    const createdAtCol = getCreatedAtColumn();

    const { rows } = await client.query(
      `INSERT INTO appointments
         (id, token, name, phone, email, service, date, day, time, ${createdAtCol}, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), 'pending')
       RETURNING *`,
      [id, token, name, phone, email, service, date, day, time]
    );

    await client.query('COMMIT');
    return normalizeRow(rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // connection may already be broken; original error is rethrown
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ALLOWED_SERVICES,
  DAYS_AHEAD_LIMIT,
  SLOT_MINUTES,
  formatTime12,
  fromMinutes,
  toMinutes,
  isValidYMD,
  todayYMD,
  maxDateYMD,
  slotTimesForDate,
  slotTimesForWindow,
  dayIndex,
  validateBookingInput,
  getDayAvailability,
  createAppointment,
};
