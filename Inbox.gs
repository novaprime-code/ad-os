/**
 * Inbox.gs
 * Handles incoming messages that aren't explicit commands.
 * Captures to Inbox, triggers AI categorization, routes to appropriate sheet.
 */

/**
 * Process a raw text message into the Inbox.
 * AI categorizes it and routes to the right sheet if applicable.
 * @param {string} text - Raw user input
 * @param {string} [source='telegram'] - Input source
 * @returns {Object} Result with category and confirmation message
 */
function processInboxItem(text, source = 'telegram') {
  const id = generateId('INB');
  const timestamp = now();

  // Step 1: Save to Inbox immediately (capture first, organize later)
  appendRow('Inbox', [id, timestamp, source, text, '', '', '', 'new']);

  // Step 2: AI categorization (if enabled)
  let category = 'note';
  let summary = truncate(text, 80);
  let priority = getConfig('DEFAULT_PRIORITY', 'medium');
  let aiResult = null;

  if (getConfigBool('AI_CATEGORIZE', true)) {
    aiResult = categorizeInput(text);
    if (aiResult) {
      category = aiResult.category || 'note';
      summary = aiResult.summary || summary;
      priority = aiResult.priority || priority;
    }
  }

  // Step 3: Update Inbox row with AI results
  const inboxRow = findRow('Inbox', 'ID', id);
  if (inboxRow) {
    updateRow('Inbox', inboxRow._rowIndex, {
      'AI_Summary': summary,
      'Category': category,
      'Priority': priority,
      'Status': 'processed'
    });
  }

  // Step 4: Route to appropriate sheet
  let routeResult = null;
  switch (category) {
    case 'task':
      routeResult = _routeToTask(text, aiResult);
      break;
    case 'idea':
      routeResult = _routeToIdea(text, aiResult);
      break;
    case 'event':
      routeResult = _routeToEvent(text, aiResult);
      break;
    case 'learning':
      routeResult = _routeToLearning(text, aiResult);
      break;
    default:
      // Stay as note in Inbox
      break;
  }

  // Step 5: Build confirmation message
  const categoryEmoji = {
    task: '📝', idea: '💡', event: '📅', note: '📌', learning: '📚'
  }[category] || '📌';

  let confirmMsg = `${categoryEmoji} <b>${category.toUpperCase()}</b> captured\n`;
  confirmMsg += `${escapeHtml(summary)}`;

  if (routeResult && routeResult.id) {
    confirmMsg += `\n<code>${routeResult.id}</code>`;
  }
  if (routeResult && routeResult.extra) {
    confirmMsg += `\n${routeResult.extra}`;
  }

  return {
    category,
    summary,
    priority,
    message: confirmMsg,
    routeResult
  };
}

/**
 * Route categorized input to Tasks sheet.
 */
function _routeToTask(text, aiResult) {
  const parsed = aiResult || {};
  const taskId = generateId('TSK');
  const dueDate = parsed.dueDate ? new Date(parsed.dueDate) : null;
  const duration = parsed.duration || getConfigNumber('DEFAULT_TASK_DURATION', 30);

  appendRow('Tasks', [
    taskId,
    now(),
    parsed.summary || truncate(text, 100),
    text,
    parsed.priority || getConfig('DEFAULT_PRIORITY', 'medium'),
    'medium', // energy default
    duration,
    dueDate,
    'todo',
    '',  // GoalID
    '',  // CalendarEventID
    ''   // CompletedAt
  ]);

  let extra = '';
  if (dueDate) extra = `Due: ${formatDate(dueDate, 'date')}`;

  return { id: taskId, extra };
}

/**
 * Route categorized input to Ideas sheet.
 */
function _routeToIdea(text, aiResult) {
  const parsed = aiResult || {};
  const ideaId = generateId('IDEA');

  appendRow('Ideas', [
    ideaId,
    now(),
    text,
    parsed.summary || truncate(text, 80),
    parsed.tags ? _guessIdeaCategory(parsed.tags) : 'other',
    parsed.tags || '',
    '',  // Score (can be filled later)
    'new'
  ]);

  return { id: ideaId };
}

/**
 * Route categorized input to calendar.
 */
function _routeToEvent(text, aiResult) {
  // Use Gemini to parse event details
  const eventData = parseEventText(text);
  if (!eventData || !eventData.startDate || !eventData.startTime) {
    // Couldn't parse — save as note instead
    return { extra: '⚠️ Could not parse event time. Saved as note.' };
  }

  const startTime = new Date(`${eventData.startDate}T${eventData.startTime}`);
  const endTime = eventData.endTime
    ? new Date(`${eventData.startDate}T${eventData.endTime}`)
    : new Date(startTime.getTime() + 60 * 60000); // Default 1 hour

  const eventId = createCalendarEvent({
    title: eventData.title || truncate(text, 50),
    startTime,
    endTime,
    category: eventData.category || 'personal',
    description: `[LifeOS] ${text}`
  });

  if (eventId) {
    // Also track in Events sheet
    const evtId = generateId('EVT');
    appendRow('Events', [
      evtId,
      eventData.title || truncate(text, 50),
      startTime,
      endTime,
      getCalendarId(eventData.category || 'personal'),
      eventData.category || 'personal',
      'upcoming'
    ]);

    return {
      id: evtId,
      extra: `📅 ${formatDate(startTime, 'time')} - ${formatDate(endTime, 'time')}\nAdded to Google Calendar`
    };
  }

  return { extra: '⚠️ Calendar event creation failed.' };
}

/**
 * Route to Learning sheet.
 */
function _routeToLearning(text, aiResult) {
  const parsed = aiResult || {};
  const learnId = generateId('LRN');

  appendRow('Learning', [
    learnId,
    now(),
    parsed.tags || 'general',
    text,
    'telegram',
    parsed.tags || ''
  ]);

  return { id: learnId };
}

/**
 * Guess idea category from tags.
 */
function _guessIdeaCategory(tags) {
  const t = tags.toLowerCase();
  if (t.includes('business') || t.includes('saas') || t.includes('startup')) return 'business';
  if (t.includes('project') || t.includes('code') || t.includes('app')) return 'project';
  if (t.includes('learn') || t.includes('study') || t.includes('course')) return 'learning';
  return 'other';
}
