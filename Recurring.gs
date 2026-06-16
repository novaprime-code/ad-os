/**
 * Recurring.gs
 * Recurring task rules + daily auto-spawning.
 * Sheet: Recurring [ID, Title, Description, Priority, Energy, Duration, Pattern, LastSpawned, Status]
 *
 * Patterns:
 *   daily           — every day
 *   weekdays        — Mon–Fri
 *   weekly:mon      — every Monday (sun..sat)
 *   monthly:15      — the 15th of every month
 */

const RECUR_DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ─── Commands ───────────────────────────────────────────────────

/**
 * /recur <text with pattern> — create a recurring task rule.
 * e.g. "/recur Water plants every monday"
 *      "/recur Review inbox daily"
 *      "/recur Pay rent monthly 1"
 * Subcommands: /recur list · /recur pause REC-XX · /recur resume REC-XX · /recur delete REC-XX
 */
function handleRecurCommand(args) {
  const text = (args || '').trim();
  if (!text) {
    return '🔄 Usage:\n' +
      '<code>/recur Review inbox daily</code>\n' +
      '<code>/recur Water plants every monday</code>\n' +
      '<code>/recur Pay rent monthly 1</code>\n' +
      '<code>/recur list</code> · <code>/recur pause REC-XX</code>';
  }

  const firstWord = text.split(/\s+/)[0].toLowerCase();

  if (firstWord === 'list') return handleRecurringList();
  if (['pause', 'resume', 'delete'].includes(firstWord)) {
    return _recurAdminAction(firstWord, text.split(/\s+/)[1]);
  }

  // Parse pattern out of natural text
  const { pattern, title } = _parseRecurPattern(text);
  if (!pattern) {
    return '🔄 Could not find a recurrence pattern.\n' +
      'Include: <code>daily</code>, <code>weekdays</code>, <code>every monday</code>, or <code>monthly 15</code>';
  }
  if (!title) return '🔄 The recurring task needs a title.';

  // Optional priority keyword
  let priority = getConfig('DEFAULT_PRIORITY', 'medium');
  let cleanTitle = title;
  const prioMatch = title.match(/\b(high|low)\b/i);
  if (prioMatch && /^(high|low)\s/i.test(title)) {
    priority = prioMatch[1].toLowerCase();
    cleanTitle = title.replace(/^(high|low)\s+/i, '');
  }

  const id = generateId('REC');
  appendRow('Recurring', [
    id, cleanTitle, text, priority, 'medium',
    getConfigNumber('DEFAULT_TASK_DURATION', 30),
    pattern, '', 'active'
  ]);

  return `🔄 Recurring task created!\n\n<b>${escapeHtml(cleanTitle)}</b>\n` +
    `📆 ${_patternLabel(pattern)}\n<code>${id}</code>\n\n` +
    `It will appear in Tasks automatically each cycle.`;
}

/**
 * /recur list — show all recurring rules.
 */
function handleRecurringList() {
  const rules = getSheetData('Recurring');
  if (!rules.length) return '🔄 No recurring tasks. Create one: <code>/recur Review inbox daily</code>';

  let msg = `<b>🔄 Recurring Tasks</b>\n\n`;
  rules.forEach(r => {
    const icon = r.Status === 'active' ? '🟢' : '⏸';
    msg += `${icon} <b>${escapeHtml(r.Title)}</b>\n`;
    msg += `   📆 ${_patternLabel(r.Pattern)} · <code>${r.ID}</code>\n`;
  });
  msg += `\n<code>/recur pause REC-XX</code> · <code>/recur resume REC-XX</code>`;
  return msg;
}

// ─── Spawning (called by daily trigger) ─────────────────────────

/**
 * Spawn today's tasks from active recurring rules.
 * Safe to call multiple times per day (LastSpawned guard).
 * @returns {number} Count of tasks created
 */
function spawnRecurringTasks() {
  const rules = getSheetData('Recurring', { Status: 'active' });
  const todayStr = _todayDateString();
  let created = 0;

  rules.forEach(rule => {
    if (!_patternDueToday(rule.Pattern)) return;

    // Already spawned today?
    if (rule.LastSpawned && _toDateString(rule.LastSpawned) === todayStr) return;

    const taskId = generateId('TSK');
    appendRow('Tasks', [
      taskId,
      now(),
      rule.Title,
      `[Recurring ${rule.ID}] ${rule.Description || rule.Title}`,
      rule.Priority || 'medium',
      rule.Energy || 'medium',
      Number(rule.Duration) || getConfigNumber('DEFAULT_TASK_DURATION', 30),
      getEndOfToday(), // Due today
      'todo',
      '', '', ''
    ]);

    updateRow('Recurring', rule._rowIndex, { 'LastSpawned': getStartOfToday() });
    created++;
    log('Recurring', 'Spawned task', { rule: rule.ID, task: taskId });
  });

  return created;
}

// ─── Private helpers ────────────────────────────────────────────

function _recurAdminAction(action, id) {
  if (!id) return `🔄 Usage: <code>/recur ${action} REC-XXXX</code>`;
  const rule = findRow('Recurring', 'ID', id.trim().toUpperCase());
  if (!rule) return `❌ Recurring rule not found: <code>${escapeHtml(id)}</code>`;

  switch (action) {
    case 'pause':
      updateRow('Recurring', rule._rowIndex, { 'Status': 'paused' });
      return `⏸ Paused: <b>${escapeHtml(rule.Title)}</b>`;
    case 'resume':
      updateRow('Recurring', rule._rowIndex, { 'Status': 'active' });
      return `🟢 Resumed: <b>${escapeHtml(rule.Title)}</b>`;
    case 'delete':
      deleteRow('Recurring', rule._rowIndex);
      return `🗑 Deleted recurring rule: <b>${escapeHtml(rule.Title)}</b>`;
  }
  return '❓ Unknown action.';
}

/**
 * Extract a recurrence pattern from natural text.
 * @returns {Object} { pattern: string|null, title: string }
 */
function _parseRecurPattern(text) {
  let t = ' ' + text + ' ';
  let pattern = null;

  // weekdays
  if (/\b(weekdays|every weekday)\b/i.test(t)) {
    pattern = 'weekdays';
    t = t.replace(/\b(on\s+)?(weekdays|every weekday)\b/gi, ' ');
  }
  // daily
  else if (/\b(daily|every ?day)\b/i.test(t)) {
    pattern = 'daily';
    t = t.replace(/\b(daily|every ?day)\b/gi, ' ');
  }
  // every <dayname>
  else {
    const dayMatch = t.match(/\bevery\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    if (dayMatch) {
      pattern = 'weekly:' + dayMatch[1].toLowerCase();
      t = t.replace(dayMatch[0], ' ');
    } else {
      // monthly N / every month on N
      const monthMatch = t.match(/\b(?:monthly|every\s+month(?:\s+on(?:\s+the)?)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
      if (monthMatch) {
        const day = Math.max(1, Math.min(28, parseInt(monthMatch[1], 10)));
        pattern = 'monthly:' + day;
        t = t.replace(monthMatch[0], ' ');
      } else if (/\bmonthly\b/i.test(t)) {
        pattern = 'monthly:1';
        t = t.replace(/\bmonthly\b/gi, ' ');
      }
    }
  }

  return { pattern, title: t.replace(/\s{2,}/g, ' ').trim() };
}

function _patternDueToday(pattern) {
  const p = String(pattern || '').toLowerCase();
  const today = getStartOfToday();
  const day = today.getDay(); // 0=Sun

  if (p === 'daily') return true;
  if (p === 'weekdays') return day >= 1 && day <= 5;
  if (p.startsWith('weekly:')) {
    return RECUR_DAY_NAMES[day] === p.split(':')[1];
  }
  if (p.startsWith('monthly:')) {
    return today.getDate() === parseInt(p.split(':')[1], 10);
  }
  return false;
}

function _patternLabel(pattern) {
  const p = String(pattern || '').toLowerCase();
  if (p === 'daily') return 'Every day';
  if (p === 'weekdays') return 'Mon–Fri';
  if (p.startsWith('weekly:')) {
    const d = p.split(':')[1];
    const full = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
    return 'Every ' + (full[d] || d);
  }
  if (p.startsWith('monthly:')) return 'Monthly on the ' + p.split(':')[1];
  return p;
}

function _todayDateString() {
  return _toDateString(getStartOfToday());
}

function _toDateString(d) {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  return new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
}