/**
 * Utils.gs
 * Shared utilities: IDs, dates, formatting, logging, and the Result envelope.
 * No business logic, no sheet access.
 */

// ─── Result envelope (every controller/service returns one) ──────

function ok(data, meta) {
  return { ok: true, data: data === undefined ? null : data, error: null, meta: meta || {} };
}

function fail(code, message) {
  return { ok: false, data: null, error: { code: code || 'ERROR', message: message || 'Unknown error' } };
}

// ─── IDs ─────────────────────────────────────────────────────────

/** Generate a unique ID: PREFIX-XXXXXX (timestamp + random, collision-safe). */
function generateId(prefix) {
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

// ─── Time ────────────────────────────────────────────────────────

function now() { return new Date(); }

function tz() { return getConfig('TIMEZONE', 'Europe/Berlin'); }

/** Today's date as YYYY-MM-DD in the configured timezone. */
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz() });
}

function getStartOfToday() {
  return new Date(todayStr() + 'T00:00:00');
}

function getEndOfToday() {
  const d = getStartOfToday();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Coerce a value (Date | ISO string | null) to a Date or null. */
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function _setTime(date, h, m) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Lightweight natural-language date parser (fast path before calling AI).
 * Handles ISO, today, tomorrow, weekday names, "in Xh/Xd/Xm".
 */
function parseDate(text) {
  if (!text) return null;
  const clean = String(text).trim().toLowerCase();
  const today = new Date();

  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return new Date(clean);
  if (clean === 'today') return _setTime(today, 23, 59);

  if (clean.startsWith('tomorrow')) {
    const tom = new Date(today);
    tom.setDate(tom.getDate() + 1);
    const t = clean.match(/(\d{1,2})[:.](\d{2})/);
    return t ? _setTime(tom, +t[1], +t[2]) : _setTime(tom, 23, 59);
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const di = days.indexOf(clean.split(/\s/)[0]);
  if (di !== -1) {
    const target = new Date(today);
    const diff = (di - today.getDay() + 7) % 7 || 7;
    target.setDate(today.getDate() + diff);
    const t = clean.match(/(\d{1,2})[:.](\d{2})/);
    return t ? _setTime(target, +t[1], +t[2]) : _setTime(target, 23, 59);
  }

  const m = clean.match(/in\s+(\d+)\s*(h|d|m)/);
  if (m) {
    const val = +m[1], unit = m[2], r = new Date(today);
    if (unit === 'h') r.setHours(r.getHours() + val);
    if (unit === 'd') r.setDate(r.getDate() + val);
    if (unit === 'm') r.setMinutes(r.getMinutes() + val);
    return r;
  }
  return null;
}

/** Format a date for display. format: date | time | datetime | relative */
function formatDate(date, format = 'datetime') {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const o = { timeZone: tz() };
  switch (format) {
    case 'date': return d.toLocaleDateString('en-GB', { ...o, day: '2-digit', month: 'short', year: 'numeric' });
    case 'time': return d.toLocaleTimeString('en-GB', { ...o, hour: '2-digit', minute: '2-digit', hour12: false });
    case 'datetime': return d.toLocaleDateString('en-GB', { ...o, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    case 'relative': return _relativeTime(d);
    default: return d.toISOString();
  }
}

function _relativeTime(date) {
  const ms = date.getTime() - Date.now();
  const mins = Math.round(ms / 60000), hrs = Math.round(ms / 3600000), days = Math.round(ms / 86400000);
  if (Math.abs(mins) < 60) return mins >= 0 ? `in ${mins}m` : `${Math.abs(mins)}m ago`;
  if (Math.abs(hrs) < 24) return hrs >= 0 ? `in ${hrs}h` : `${Math.abs(hrs)}h ago`;
  return days >= 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
}

// ─── Strings ─────────────────────────────────────────────────────

function truncate(text, maxLen = 100) {
  if (!text) return '';
  text = String(text);
  return text.length > maxLen ? text.substring(0, maxLen - 1) + '…' : text;
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

// ─── Logging ─────────────────────────────────────────────────────

function log(module, message, data) {
  console.log(`[${new Date().toISOString()}] [${module}] ${message}`, data !== undefined ? data : '');
}
