/**
 * Tasks.gs
 * Task creation, completion, listing, and scheduling.
 */

/**
 * Create a task from a /task command.
 * Uses Gemini to parse natural language.
 * @param {string} text - The text after /task command
 * @returns {string} Confirmation message for Telegram
 */
function handleTaskCommand(text) {
  if (!text || !text.trim()) {
    return '📝 Usage: <code>/task Buy milk tomorrow</code>\nor: <code>/task HIGH finish CG1 exercise by friday</code>';
  }

  // Parse with Gemini
  const parsed = parseTaskText(text);
  const taskId = generateId('TSK');

  const title = parsed?.title || truncate(text, 100);
  const priority = parsed?.priority || getConfig('DEFAULT_PRIORITY', 'medium');
  const dueDate = parsed?.dueDate ? new Date(parsed.dueDate) : null;
  const duration = parsed?.duration || getConfigNumber('DEFAULT_TASK_DURATION', 30);
  const energy = 'medium';

  appendRow('Tasks', [
    taskId,
    now(),
    title,
    text,
    priority,
    energy,
    duration,
    dueDate,
    'todo',
    '',  // GoalID
    '',  // CalendarEventID
    ''   // CompletedAt
  ]);

  // Also save to Inbox for record
  appendRow('Inbox', [
    generateId('INB'), now(), 'telegram', text, title, 'task', priority, 'processed'
  ]);

  const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[priority] || '⚪';
  let msg = `✅ Task created\n\n`;
  msg += `${priorityIcon} <b>${escapeHtml(title)}</b>\n`;
  if (dueDate) msg += `📅 Due: ${formatDate(dueDate, 'date')}\n`;
  msg += `⏱ ${duration}min\n`;
  msg += `<code>${taskId}</code>`;

  return msg;
}

/**
 * Mark a task as done.
 * @param {string} taskId - Task ID (e.g., TSK-XXXX)
 * @returns {string} Confirmation message
 */
function handleDoneCommand(taskId) {
  if (!taskId || !taskId.trim()) {
    return '✅ Usage: <code>/done TSK-XXXX</code>';
  }

  const id = taskId.trim().toUpperCase();
  const task = findRow('Tasks', 'ID', id);

  if (!task) {
    return `❌ Task <code>${escapeHtml(id)}</code> not found.`;
  }

  if (task.Status === 'done') {
    return `Already done: <b>${escapeHtml(task.Title)}</b>`;
  }

  updateRow('Tasks', task._rowIndex, {
    'Status': 'done',
    'CompletedAt': now()
  });

  // Remove calendar event if exists
  if (task.CalendarEventID) {
    deleteCalendarEvent(task.CalendarEventID);
  }

  return `✅ Done: <b>${escapeHtml(task.Title)}</b>\nGreat work! 🎉`;
}

/**
 * List tasks based on filter.
 * @param {string} filter - 'today', 'all', 'high', 'overdue'
 * @returns {string} Formatted task list for Telegram
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
        if (t.Status === 'done' || t.Status === 'cancelled') return false;
        if (!t.DueDate) return false;
        return new Date(t.DueDate) < getStartOfToday();
      });
      break;
    case 'done':
      tasks = getSheetData('Tasks', { Status: 'done' }).slice(-10); // Last 10 completed
      break;
    default: // 'today' or empty
      const today = getStartOfToday();
      const endOfDay = getEndOfToday();
      tasks = getSheetData('Tasks').filter(t => {
        if (t.Status === 'done' || t.Status === 'cancelled') return false;
        if (!t.DueDate) return cleanFilter === ''; // Show no-date tasks for default view
        const due = new Date(t.DueDate);
        return due <= endOfDay;
      });
      break;
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

  // Sort: high first, then by due date
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
  tasks.slice(0, 15).forEach((t, i) => {
    msg += formatTask(t) + '\n';
  });

  if (tasks.length > 15) {
    msg += `\n... and ${tasks.length - 15} more`;
  }

  return msg;
}

/**
 * Handle /today command — combined calendar + tasks view.
 */
function handleTodayCommand() {
  const events = getTodayEvents();
  const tasks = getSheetData('Tasks').filter(t => {
    if (t.Status === 'done' || t.Status === 'cancelled') return false;
    if (!t.DueDate) return true; // Show undated tasks
    return new Date(t.DueDate) <= getEndOfToday();
  });

  // Sort tasks by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => (priorityOrder[a.Priority] || 2) - (priorityOrder[b.Priority] || 2));

  let msg = `<b>📅 Today — ${formatDate(now(), 'date')}</b>\n\n`;

  // Events section
  msg += `<b>Schedule:</b>\n`;
  if (events.length) {
    msg += formatEventsForTelegram(events) + '\n';
  } else {
    msg += 'No events.\n';
  }

  // Tasks section
  msg += `\n<b>Tasks:</b>\n`;
  if (tasks.length) {
    tasks.slice(0, 5).forEach(t => {
      msg += formatTask(t) + '\n';
    });
    if (tasks.length > 5) msg += `... +${tasks.length - 5} more\n`;
  } else {
    msg += 'No tasks due.\n';
  }

  // Free time
  const freeBlocks = getFreeTimeBlocks();
  if (freeBlocks.length) {
    const totalFree = freeBlocks.reduce((sum, b) => sum + b.minutes, 0);
    msg += `\n<b>Free time:</b> ${Math.round(totalFree / 60 * 10) / 10}h available\n`;
    msg += formatFreeTimeForTelegram(freeBlocks.slice(0, 3));
  }

  return msg;
}

/**
 * Handle /schedule command — put a task into a free time slot.
 */
function handleScheduleCommand(taskId) {
  if (!taskId) return '📅 Usage: <code>/schedule TSK-XXXX</code>';

  const task = findRow('Tasks', 'ID', taskId.trim().toUpperCase());
  if (!task) return `❌ Task not found: <code>${escapeHtml(taskId)}</code>`;

  const duration = task.Duration || getConfigNumber('DEFAULT_TASK_DURATION', 30);
  const freeBlocks = getFreeTimeBlocks(null, duration);

  if (!freeBlocks.length) {
    return `❌ No free slot of ${duration}min found today.`;
  }

  const slot = freeBlocks[0];
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
    return `📅 Scheduled: <b>${escapeHtml(task.Title)}</b>\n${formatDate(slot.start, 'time')} - ${formatDate(endTime, 'time')}`;
  }

  return '❌ Failed to create calendar event.';
}

/**
 * Handle /focus command — what should I do right now?
 */
function handleFocusCommand() {
  const tasks = getSheetData('Tasks').filter(t =>
    ['todo', 'in_progress'].includes(t.Status)
  );

  if (!tasks.length) return '🧘 No open tasks. You\'re free!';

  // Priority score: high=3, medium=2, low=1. Overdue adds +2.
  const scored = tasks.map(t => {
    let score = { high: 3, medium: 2, low: 1 }[t.Priority] || 1;
    if (t.DueDate && new Date(t.DueDate) < new Date()) score += 2;
    if (t.DueDate && new Date(t.DueDate) <= getEndOfToday()) score += 1;
    return { ...t, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  const top = scored[0];

  let msg = `⚡ <b>Focus on this:</b>\n\n`;
  msg += formatTask(top) + '\n\n';
  if (top.Duration) msg += `⏱ Estimated: ${top.Duration}min\n`;
  msg += `\nStart now. You can do this. 💪`;

  return msg;
}
