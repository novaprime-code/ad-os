/**
 * Utils.gs
 * Shared utility functions: ID generation, date parsing, formatting.
 */

/**
 * Generate a unique ID with prefix.
 * Format: PREFIX-NNNN (e.g., TSK-0001)
 * Uses timestamp + random to avoid collisions.
 */
function generateId(prefix) {
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

/**
 * Get current timestamp as Date object.
 */
function now() {
  return new Date();
}

/**
 * Format a date for display in Telegram messages.
 * @param {Date} date
 * @param {string} format - 'date', 'time', 'datetime', 'relative'
 */
function formatDate(date, format = 'datetime') {
  if (!date) return '';
  const d = new Date(date);
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');

  const options = { timeZone: tz };

  switch (format) {
    case 'date':
      return d.toLocaleDateString('en-GB', { ...options, day: '2-digit', month: 'short', year: 'numeric' });
    case 'time':
      return d.toLocaleTimeString('en-GB', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
    case 'datetime':
      return d.toLocaleDateString('en-GB', {
        ...options, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      });
    case 'relative':
      return _relativeTime(d);
    default:
      return d.toISOString();
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days").
 */
function _relativeTime(date) {
  const diffMs = date.getTime() - Date.now();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  if (Math.abs(diffMins) < 60) return diffMins >= 0 ? `in ${diffMins}m` : `${Math.abs(diffMins)}m ago`;
  if (Math.abs(diffHours) < 24) return diffHours >= 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
  return diffDays >= 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
}

/**
 * Parse a natural language date/time string into a Date.
 * Handles: "tomorrow", "friday", "tomorrow 18:00", "2025-06-15", etc.
 * For complex parsing, delegates to Gemini.
 */
function parseDate(text) {
  if (!text) return null;
  const clean = text.trim().toLowerCase();
  const today = new Date();

  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return new Date(clean);
  }

  // "today"
  if (clean === 'today') {
    return _setTime(today, 23, 59);
  }

  // "tomorrow" or "tomorrow HH:MM"
  if (clean.startsWith('tomorrow')) {
    const tom = new Date(today);
    tom.setDate(tom.getDate() + 1);
    const timeMatch = clean.match(/(\d{1,2})[:\.](\d{2})/);
    if (timeMatch) {
      return _setTime(tom, parseInt(timeMatch[1]), parseInt(timeMatch[2]));
    }
    return _setTime(tom, 23, 59);
  }

  // Day names: "monday", "tuesday", etc.
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.indexOf(clean.split(/\s/)[0]);
  if (dayIndex !== -1) {
    const target = new Date(today);
    const diff = (dayIndex - today.getDay() + 7) % 7 || 7;
    target.setDate(today.getDate() + diff);
    const timeMatch = clean.match(/(\d{1,2})[:\.](\d{2})/);
    if (timeMatch) {
      return _setTime(target, parseInt(timeMatch[1]), parseInt(timeMatch[2]));
    }
    return _setTime(target, 23, 59);
  }

  // "in Xh", "in Xd"
  const inMatch = clean.match(/in\s+(\d+)\s*(h|d|m)/);
  if (inMatch) {
    const val = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const result = new Date(today);
    if (unit === 'h') result.setHours(result.getHours() + val);
    if (unit === 'd') result.setDate(result.getDate() + val);
    if (unit === 'm') result.setMinutes(result.getMinutes() + val);
    return result;
  }

  return null; // Couldn't parse — caller should use Gemini
}

function _setTime(date, hours, minutes) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Truncate text to maxLen characters, add "..." if truncated.
 */
function truncate(text, maxLen = 100) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}

/**
 * Escape HTML entities for Telegram HTML parse mode.
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Simple logging with timestamp.
 */
function log(module, message, data) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${module}] ${message}`, data || '');
}

/**
 * Get start of today (midnight) in configured timezone.
 */
function getStartOfToday() {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  const now = new Date();
  const str = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  return new Date(str + 'T00:00:00');
}

/**
 * Get end of today (23:59:59) in configured timezone.
 */
function getEndOfToday() {
  const start = getStartOfToday();
  start.setHours(23, 59, 59, 999);
  return start;
}
