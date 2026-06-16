/**
 * Tasks.gs (v2)
 * Task creation, completion, listing, scheduling, waiting-for tracking.
 * v2 additions: shared completeTask() core, XP rewards, goal linking,
 * inline action buttons, energy/time-aware /focus, /cancel, /waiting.
 */

// ─── Create ─────────────────────────────────────────────────────

/**
 * /task <text> — create a task. Sends directly (with action buttons), returns null.
 * Supports goal linking: "/task write chapter 1 goal:GOAL-XXXX"
 */
function handleTaskCommand(text) {
  if (!text || !text.trim()) {
    sendTelegram('📝 Usage: <code>/task Buy milk tomorrow</code>\n' +
      'or: <code>/task HIGH finish CG1 exercise by friday goal:GOAL-XXXX</code>');
    return null;
  }

  // Extract goal link before AI parsing
  const { goalId, cleanText } = extractGoalLink(text);

  const parsed = parseTaskText(cleanText);
  const taskId = generateId('TSK');

  const title = parsed?.title || truncate(cleanText, 100);
  const priority = parsed?.priority || getConfig('DEFAULT_PRIORITY', 'medium');
  const dueDate = parsed?.dueDate ? new Date(parsed.dueDate) : null;
  const duration = parsed?.duration || getConfigNumber('DEFAULT_TASK_DURATION', 30);

  appendRow('Tasks', [
    taskId, now(), title, cleanText, priority, 'medium', duration,
    dueDate, 'todo', goalId, '', ''
  ]);

  appendRow('Inbox', [
    generateId('INB'), now(), 'telegram', text, title, 'task', priority, 'processed'
  ]);

  const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[priority] || '⚪';
  let msg = `✅ Task created\n\n`;
  msg += `${priorityIcon} <b>${escapeHtml(title)}</b>\n`;
  if (dueDate) msg += `📅 Due: ${formatDate(dueDate, 'date')}\n`;
  if (goalId) msg += `🎯 Linked to <code>${goalId}</code>\n`;
  msg += `⏱ ${duration}min\n<code>${taskId}</code>`;

  sendTelegramWithButtons(msg, taskActionButtons(taskId));
  return null;
}

/**
 * Standard inline action buttons for a task.
 */
function taskActionButtons(taskId) {
  return [
    [
      { text: '✅ Done', callback_data: `done:${taskId}` },
      { text: '📅 Schedule', callback_data: `sched:${taskId}` }
    ],
    [
      { text: '🍅 Pomodoro', callback_data: `pomo:again:${taskId}` },
      { text: '🗑 Cancel', callback_data: `cancel:${taskId}` }
    ]
  ];
}

// ─── Complete / Cancel ──────────────────────────────────────────

/**
 * Core completion logic — shared by /done command and ✅ buttons.
 * Handles status, calendar cleanup, XP, and goal auto-progress.
 * @returns {Object} { ok, message, task }
 */
function completeTask(taskId) {
  const id = String(taskId || '').trim().toUpperCase();
  if (!id) return { ok: false, message: '✅ Usage: <code>/done TSK-XXXX</code>' };

  const task = findRow('Tasks', 'ID', id);
  if (!task) return { ok: false, message: `❌ Task <code>${escapeHtml(id)}</code> not found.` };
  if (task.Status === 'done') {
    return { ok: false, message: `Already done: <b>${escapeHtml(task.Title)}</b>` };
  }

  updateRow('Tasks', task._rowIndex, { 'Status': 'done', 'CompletedAt': now() });

  if (task.CalendarEventID) {
    deleteCalendarEvent(task.CalendarEventID);
  }

  // XP + counters
  incrementStat('TASKS_COMPLETED');
  const xpPoints = { high: 15, medium: 10, low: 5 }[task.Priority] || 10;
  const xp = addXP(xpPoints, `task: ${task.Title}`);

  // Auto-progress linked goal
  if (task.GoalID) {
    updateGoalFromTasks(task.GoalID);
  }

  const message = `✅ Done: <b>${escapeHtml(task.Title)}</b>\n` +
    `+${xpPoints} XP · Level ${xp.level}\nGreat work! 🎉`;

  return { ok: true, message, task };
}

/**
 * /done <ID> — mark a task as done.
 */
function handleDoneCommand(taskId) {
  return completeTask(taskId).message;
}

/**
 * /cancel <ID> — cancel a task (also used by 🗑 buttons).
 */
function handleCancelCommand(taskId) {
  const id = String(taskId || '').trim().toUpperCase();
  if (!id) return '🗑 Usage: <code>/cancel TSK-XXXX</code>';

  const task = findRow('Tasks', 'ID', id);
  if (!task) return `❌ Task <code>${escapeHtml(id)}</code> not found.`;

  updateRow('Tasks', task._rowIndex, { 'Status': 'cancelled' });
  if (task.CalendarEventID) deleteCalendarEvent(task.CalendarEventID);

  return `🗑 Cancelled: <b>${escapeHtml(task.Title)}</b>`;
}

// ─── Waiting-for tracking ───────────────────────────────────────

/**
 * /waiting           — list everything you're waiting on
 * /waiting <text>    — track something you're waiting on someone for
 * e.g. "/waiting Reply from Lemvos about contract"
 */
function handleWaitingCommand(args) {
  const text = (args || '').trim();

  if (!text) {
    const waiting = getSheetData('Tasks', { Status: 'waiting' });
    if (!waiting.length) return '⏳ Not waiting on anything. Track one: <code>/waiting Reply from X</code>';

    let msg = `<b>⏳ Waiting For</b>\n\n`;
    waiting.forEach(t => {
      const age = Math.round((Date.now() - new Date(t.CreatedAt).getTime()) / 86400000);
      msg += `⏳ <b>${escapeHtml(t.Title)}</b> (${age}d)\n   <code>${t.ID}</code>\n`;
    });
    msg += `\nResolve with <code>/done TSK-XX</code>`;
    return msg;
  }

  const taskId = generateId('TSK');
  appendRow('Tasks', [
    taskId, now(), truncate(text, 100), text, 'medium', 'low',
    5, null, 'waiting', '', '', ''
  ]);

  return `⏳ Waiting-for tracked:\n<b>${escapeHtml(truncate(text, 100))}</b>\n<code>${taskId}</code>\n\n` +
    `It won't clutter your task list, but I'll surface it in weekly reviews.`;
}

// ─── Listing ────────────────────────────────────────────────────

/**
 * /tasks [filter] — 'today' (default), 'all', 'high', 'overdue', 'done', 'waiting'
 */
function handleTasksList(filter = '') {
  const cleanFilter = filter.trim().toLowerCase();
  let tasks;

  switch (cleanFilter) {
    case 'all':
      tasks = getSheetData('Tasks', { Status: ['todo', 'in_progress'] });
      break;
    case 'high':
      tasks = getSheetData('Tasks').filter(t =>
        t.Priority === 'high' && ['todo', 'in_progress'].includes(t.Status)
      );
      break;
    case 'overdue':
      tasks = getSheetData('Tasks').filter(t => {
        if (!['todo', 'in_progress'].includes(t.Status)) return false;
        if (!t.DueDate) return false;
        return new Date(t.DueDate) < getStartOfToday();
      });
      break;
    case 'done':
      tasks = getSheetData('Tasks', { Status: 'done' }).slice(-10);
      break;
    case 'waiting':
      return handleWaitingCommand('');
    default: { // 'today' or empty
      const endOfDay = getEndOfToday();
      tasks = getSheetData('Tasks').filter(t => {
        if (!['todo', 'in_progress'].includes(t.Status)) return false;
        if (!t.DueDate) return cleanFilter === '';
        return new Date(t.DueDate) <= endOfDay;
      });
      break;
    }
  }

  if (!tasks.length) {
    const emptyMsg = {
      'all': 'No open tasks. Enjoy the peace! 🧘',
      'high': 'No high priority tasks. Nice! 🎉',
      'overdue': 'Nothing overdue. You\'re on track! ✅',
      'done': 'No completed tasks yet.',
      '': 'No tasks for today. Use <code>/task</code> to create one.'
    };
    return emptyMsg[cleanFilter] || 'No tasks found.';
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => {
    const pDiff = (priorityOrder[a.Priority] || 2) - (priorityOrder[b.Priority] || 2);
    if (pDiff !== 0) return pDiff;
    if (a.DueDate && b.DueDate) return new Date(a.DueDate) - new Date(b.DueDate);
    return a.DueDate ? -1 : 1;
  });

  const title = {
    'all': '📋 All Open Tasks',
    'high': '🔴 High Priority',
    'overdue': '⚠️ Overdue Tasks',
    'done': '✅ Recently Completed',
    '': '📋 Today\'s Tasks'
  }[cleanFilter] || '📋 Tasks';

  let msg = `<b>${title}</b>\n\n`;
  tasks.slice(0, 15).forEach(t => {
    msg += formatTask(t) + '\n';
  });
  if (tasks.length > 15) msg += `\n... and ${tasks.length - 15} more`;
  msg += `\n\n<code>/done ID</code> · <code>/pomo ID</code> · <code>/schedule ID</code>`;

  return msg;
}

/**
 * /today — combined calendar + tasks + habits view.
 */
function handleTodayCommand() {
  const events = getTodayEvents();
  const tasks = getSheetData('Tasks').filter(t => {
    if (!['todo', 'in_progress'].includes(t.Status)) return false;
    if (!t.DueDate) return true;
    return new Date(t.DueDate) <= getEndOfToday();
  });

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => (priorityOrder[a.Priority] || 2) - (priorityOrder[b.Priority] || 2));

  let msg = `<b>📅 Today — ${formatDate(now(), 'date')}</b>\n\n`;

  msg += `<b>Schedule:</b>\n`;
  msg += events.length ? formatEventsForTelegram(events) + '\n' : 'No events.\n';

  msg += `\n<b>Tasks:</b>\n`;
  if (tasks.length) {
    tasks.slice(0, 5).forEach(t => { msg += formatTask(t) + '\n'; });
    if (tasks.length > 5) msg += `... +${tasks.length - 5} more\n`;
  } else {
    msg += 'No tasks due.\n';
  }

  // Habits today
  const habits = getSheetData('Habits', { Status: 'active' }).filter(h => isHabitDueToday(h));
  if (habits.length) {
    const done = habits.filter(h => _habitDoneToday(h)).length;
    msg += `\n<b>Habits:</b> ${done}/${habits.length} done`;
    const pending = habits.filter(h => !_habitDoneToday(h));
    if (pending.length) {
      msg += ` (open: ${pending.map(h => escapeHtml(h.Name)).join(', ')})`;
    }
    msg += '\n';
  }

  const freeBlocks = getFreeTimeBlocks();
  if (freeBlocks.length) {
    const totalFree = freeBlocks.reduce((sum, b) => sum + b.minutes, 0);
    msg += `\n<b>Free time:</b> ${Math.round(totalFree / 60 * 10) / 10}h available\n`;
    msg += formatFreeTimeForTelegram(freeBlocks.slice(0, 3));
  }

  return msg;
}

// ─── Scheduling ─────────────────────────────────────────────────

/**
 * /schedule <ID> — put a task into the next suitable free slot.
 */
function handleScheduleCommand(taskId) {
  if (!taskId) return '📅 Usage: <code>/schedule TSK-XXXX</code>';

  const task = findRow('Tasks', 'ID', taskId.trim().toUpperCase());
  if (!task) return `❌ Task not found: <code>${escapeHtml(taskId)}</code>`;

  const duration = Number(task.Duration) || getConfigNumber('DEFAULT_TASK_DURATION', 30);
  const freeBlocks = getFreeTimeBlocks(null, duration);

  if (!freeBlocks.length) {
    return `❌ No free slot of ${duration}min found today. Try <code>/free</code> to see what's left.`;
  }

  // Energy-aware slot picking: high-energy tasks → earliest slot,
  // low-energy tasks → latest slot that still fits.
  let slot = freeBlocks[0];
  if (String(task.Energy).toLowerCase() === 'low' && freeBlocks.length > 1) {
    slot = freeBlocks[freeBlocks.length - 1];
  }

  const endTime = new Date(slot.start.getTime() + duration * 60000);

  const eventId = createCalendarEvent({
    title: `[Task] ${task.Title}`,
    startTime: slot.start,
    endTime: endTime,
    category: 'study',
    description: `[LifeOS:${task.ID}] ${task.Description || task.Title}`
  });

  if (eventId) {
    updateCell('Tasks', task._rowIndex, 'CalendarEventID', eventId);
    return `📅 Scheduled: <b>${escapeHtml(task.Title)}</b>\n` +
      `${formatDate(slot.start, 'time')} - ${formatDate(endTime, 'time')}`;
  }

  return '❌ Failed to create calendar event.';
}

// ─── Focus ──────────────────────────────────────────────────────

/**
 * /focus — what should I do right now?
 * v2: factors in time of day vs task energy, free time remaining,
 * priority, and overdue status. Sends with a Pomodoro button.
 */
function handleFocusCommand() {
  const tasks = getSheetData('Tasks').filter(t =>
    ['todo', 'in_progress'].includes(t.Status)
  );

  if (!tasks.length) {
    sendTelegram('🧘 No open tasks. You\'re free!');
    return null;
  }

  const hour = parseInt(
    new Date().toLocaleTimeString('en-GB', {
      timeZone: getConfig('TIMEZONE', 'Europe/Berlin'), hour: '2-digit', hour12: false
    }), 10
  );
  // What energy level suits this time of day?
  const idealEnergy = hour < 12 ? 'high' : hour < 17 ? 'medium' : 'low';

  const scored = tasks.map(t => {
    let score = { high: 3, medium: 2, low: 1 }[t.Priority] || 1;
    if (t.DueDate && new Date(t.DueDate) < new Date()) score += 2;        // overdue
    if (t.DueDate && new Date(t.DueDate) <= getEndOfToday()) score += 1;  // due today
    if (String(t.Energy).toLowerCase() === idealEnergy) score += 1;       // energy match
    if (t.Status === 'in_progress') score += 1;                           // finish what's started
    return { ...t, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  const top = scored[0];

  const timeHint = hour < 12
    ? 'Morning brain = best brain. Tackle it now.'
    : hour < 17
      ? 'Solid afternoon slot. One thing at a time.'
      : 'Evening mode: keep it light, just make progress.';

  let msg = `⚡ <b>Focus on this:</b>\n\n`;
  msg += formatTask(top) + '\n\n';
  if (top.Duration) msg += `⏱ Estimated: ${top.Duration}min\n`;
  msg += `\n${timeHint} 💪`;

  sendTelegramWithButtons(msg, [
    [
      { text: '🍅 Start Pomodoro', callback_data: `pomo:again:${top.ID}` },
      { text: '✅ Done', callback_data: `done:${top.ID}` }
    ]
  ]);
  return null;
}