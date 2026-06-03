/**
 * Review.gs
 * Generates daily morning briefs, night reviews, and weekly reviews.
 */

/**
 * Generate and send morning brief via Telegram.
 */
function sendMorningBrief() {
  log('Review', 'Generating morning brief');

  const events = getTodayEvents();
  const tasks = getSheetData('Tasks').filter(t =>
    ['todo', 'in_progress'].includes(t.Status)
  );
  const goals = getSheetData('Goals', { Status: 'active' });

  // Format for AI
  const eventsText = events.length
    ? events.map(e => `${formatDate(e.startTime, 'time')} - ${formatDate(e.endTime, 'time')}: ${e.title}`).join('\n')
    : 'No events';

  const tasksText = tasks.length
    ? tasks.slice(0, 10).map(t => `[${t.Priority}] ${t.Title} (due: ${t.DueDate ? formatDate(t.DueDate, 'date') : 'no date'})`).join('\n')
    : 'No open tasks';

  const goalsText = goals.length
    ? goals.map(g => `${g.Title} (${g.Progress || 0}%)`).join('\n')
    : 'No active goals';

  if (getConfigBool('AI_DAILY_PLAN', true)) {
    const plan = generateDailyPlan(eventsText, tasksText, goalsText);
    if (plan) {
      sendTelegram(plan, { parse_mode: null });
      return;
    }
  }

  // Fallback: simple format without AI
  let msg = `☀️ <b>Good morning!</b>\n\n`;
  msg += `<b>📅 Schedule:</b>\n${formatEventsForTelegram(events)}\n\n`;

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => (priorityOrder[a.Priority] || 2) - (priorityOrder[b.Priority] || 2));

  msg += `<b>✅ Top Tasks:</b>\n`;
  tasks.slice(0, 3).forEach((t, i) => {
    msg += `${i + 1}. ${formatTask(t)}\n`;
  });

  const freeBlocks = getFreeTimeBlocks();
  if (freeBlocks.length) {
    const totalFree = freeBlocks.reduce((sum, b) => sum + b.minutes, 0);
    msg += `\n💡 Free time: ${Math.round(totalFree / 60 * 10) / 10}h`;
  }

  sendTelegram(msg);
}

/**
 * Generate and send night review via Telegram.
 */
function sendNightReview() {
  log('Review', 'Generating night review');

  const today = getStartOfToday();
  const endOfDay = getEndOfToday();

  // Get today's completed tasks
  const allTasks = getSheetData('Tasks');
  const completed = allTasks.filter(t =>
    t.Status === 'done' && t.CompletedAt && new Date(t.CompletedAt) >= today
  );
  const incomplete = allTasks.filter(t =>
    ['todo', 'in_progress'].includes(t.Status) &&
    t.DueDate && new Date(t.DueDate) <= endOfDay
  );

  // Today's ideas
  const allIdeas = getSheetData('Ideas');
  const todayIdeas = allIdeas.filter(i =>
    new Date(i.Timestamp) >= today
  );

  // Today's events
  const events = getTodayEvents();

  // Use AI for review
  const completedText = completed.length
    ? completed.map(t => t.Title).join('\n')
    : 'None';
  const incompleteText = incomplete.length
    ? incomplete.map(t => `${t.Title} [${t.Priority}]`).join('\n')
    : 'None';
  const ideasText = todayIdeas.length
    ? todayIdeas.map(i => truncate(i.RawContent, 50)).join('\n')
    : 'None';
  const eventsText = events.length
    ? events.map(e => e.title).join('\n')
    : 'None';

  const aiReview = generateNightReview(completedText, incompleteText, ideasText, eventsText);

  if (aiReview) {
    sendTelegram(`🌙 <b>Night Review</b>\n\n${aiReview}`, { parse_mode: null });
  } else {
    // Fallback
    let msg = `🌙 <b>Night Review</b>\n\n`;
    msg += `✅ Completed: ${completed.length} tasks\n`;
    msg += `📝 Remaining: ${incomplete.length} tasks\n`;
    msg += `💡 Ideas: ${todayIdeas.length}\n`;
    msg += `📅 Events: ${events.length}\n\n`;
    if (incomplete.length) {
      msg += `<b>Moved to tomorrow:</b>\n`;
      incomplete.slice(0, 3).forEach(t => msg += `- ${escapeHtml(t.Title)}\n`);
    }
    msg += `\nHow was your day? 😊😐😓`;
    sendTelegram(msg);
  }

  // Log the review
  const total = completed.length + incomplete.length;
  const rate = total > 0 ? Math.round(completed.length / total * 100) : 0;
  appendRow('Reviews', [
    generateId('REV'), today, 'daily',
    completed.length, total, rate,
    aiReview || '', '', ''
  ]);
}

/**
 * Generate and send weekly review.
 */
function sendWeeklyReview() {
  log('Review', 'Generating weekly review');

  const weekEnd = getStartOfToday();
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const allTasks = getSheetData('Tasks');
  const completed = allTasks.filter(t =>
    t.Status === 'done' && t.CompletedAt &&
    new Date(t.CompletedAt) >= weekStart && new Date(t.CompletedAt) <= weekEnd
  );
  const created = allTasks.filter(t =>
    new Date(t.CreatedAt) >= weekStart && new Date(t.CreatedAt) <= weekEnd
  );
  const overdue = allTasks.filter(t =>
    ['todo', 'in_progress'].includes(t.Status) &&
    t.DueDate && new Date(t.DueDate) < weekEnd
  );

  const ideas = getSheetData('Ideas').filter(i =>
    new Date(i.Timestamp) >= weekStart
  );

  // Estimate study hours from calendar
  const events = getCalendarEvents(weekStart, weekEnd);
  const studyEvents = events.filter(e =>
    e.title && (e.title.toLowerCase().includes('study') || e.title.toLowerCase().includes('lecture'))
  );
  const studyMinutes = studyEvents.reduce((sum, e) =>
    sum + (e.endTime - e.startTime) / 60000, 0
  );

  const rate = created.length > 0 ? Math.round(completed.length / created.length * 100) : 0;

  const stats = {
    weekStart: formatDate(weekStart, 'date'),
    weekEnd: formatDate(weekEnd, 'date'),
    completedCount: completed.length,
    createdCount: created.length,
    rate,
    ideasCount: ideas.length,
    studyHours: Math.round(studyMinutes / 60 * 10) / 10,
    topCompletions: completed.slice(0, 5).map(t => t.Title).join('\n'),
    overdue: overdue.slice(0, 5).map(t => `${t.Title} (due ${formatDate(t.DueDate, 'date')})`).join('\n')
  };

  const aiReview = generateWeeklyReview(stats);
  sendTelegram(`📊 <b>Weekly Review</b>\n\n${aiReview || _fallbackWeeklyReview(stats)}`, { parse_mode: null });

  // Log
  appendRow('Reviews', [
    generateId('REV'), weekEnd, 'weekly',
    completed.length, created.length, rate,
    aiReview || '', '', ''
  ]);
}

function _fallbackWeeklyReview(stats) {
  return `Week: ${stats.weekStart} → ${stats.weekEnd}\n\n` +
    `✅ Completed: ${stats.completedCount}/${stats.createdCount} (${stats.rate}%)\n` +
    `💡 Ideas: ${stats.ideasCount}\n` +
    `📚 Study: ${stats.studyHours}h\n` +
    (stats.overdue ? `\n⚠️ Overdue:\n${stats.overdue}` : '');
}

/**
 * Handle /review command — manual trigger.
 */
function handleReviewCommand(type = '') {
  switch (type.trim().toLowerCase()) {
    case 'week':
    case 'weekly':
      sendWeeklyReview();
      return null; // Already sent via sendTelegram
    default:
      sendNightReview();
      return null;
  }
}

/**
 * Handle mood logging from night review.
 */
function handleMoodCommand(mood) {
  const todayReview = findRow('Reviews', 'Date', getStartOfToday());
  if (todayReview) {
    updateCell('Reviews', todayReview._rowIndex, 'Mood', mood);
    return `Mood logged: ${mood}. Good night! 🌙`;
  }
  return `Mood logged: ${mood}. 🌙`;
}
