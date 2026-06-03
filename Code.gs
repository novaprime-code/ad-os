/**
 * Code.gs
 * Main entry point for the LifeOS Apps Script project.
 * Handles:
 * - doPost(): Telegram webhook receiver
 * - doGet(): Settings page (HTML)
 * - Command routing
 */

// ─── Webhook Entry Point ────────────────────────────────────────

/**
 * Handle incoming Telegram webhook POST requests.
 * This is the main entry point for all Telegram messages.
 */
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    const parsed = parseTelegramUpdate(update);

    if (!parsed) {
      return ContentService.createTextOutput('OK');
    }

    // Security: only respond to authorized chat
    if (!isAuthorizedChat(parsed.chatId)) {
      log('Code', 'Unauthorized chat', parsed.chatId);
      return ContentService.createTextOutput('OK');
    }

    // Handle callback queries (button presses)
    if (parsed.isCallback) {
      answerCallback(parsed.callbackId);
      _handleCallback(parsed);
      return ContentService.createTextOutput('OK');
    }

    // Route command or process as inbox item
    if (parsed.isCommand) {
      _routeCommand(parsed.command, parsed.args, parsed);
    } else {
      // No command — treat as inbox item
      const result = processInboxItem(parsed.text, 'telegram');
      sendTelegram(result.message);
    }

  } catch (error) {
    log('Code', 'doPost error', error.message);
    try {
      sendTelegram(`⚠️ Error: ${error.message}`);
    } catch (e2) {
      console.error('Failed to send error notification', e2);
    }
  }

  return ContentService.createTextOutput('OK');
}

// ─── Settings Page Entry Point ──────────────────────────────────

/**
 * Serve the Settings HTML page.
 * Access via the deployed web app URL.
 */
function doGet(e) {
  const page = e && e.parameter && e.parameter.page;

  if (page === 'api') {
    // API endpoint for settings operations
    return _handleApiGet(e);
  }

  return HtmlService.createHtmlOutputFromFile('Settings')
    .setTitle('LifeOS — Settings')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Command Router ─────────────────────────────────────────────

/**
 * Route a Telegram command to the appropriate handler.
 */
function _routeCommand(command, args, parsed) {
  let response;

  switch (command) {
    // ── Core Commands ──
    case '/start':
      response = _handleStart();
      break;

    case '/help':
      response = _handleHelp();
      break;

    // ── Task Commands ──
    case '/task':
    case '/t':
      response = handleTaskCommand(args);
      break;

    case '/tasks':
      response = handleTasksList(args);
      break;

    case '/done':
    case '/d':
      response = handleDoneCommand(args);
      break;

    case '/focus':
    case '/f':
      response = handleFocusCommand();
      break;

    case '/schedule':
      response = handleScheduleCommand(args);
      break;

    // ── Idea Commands ──
    case '/idea':
    case '/i':
      response = handleIdeaCommand(args);
      break;

    case '/ideas':
      response = handleIdeasList(args);
      break;

    // ── Calendar Commands ──
    case '/event':
    case '/e':
      response = _handleEventCommand(args);
      break;

    case '/today':
      response = handleTodayCommand();
      break;

    case '/tomorrow':
      response = _handleTomorrowCommand();
      break;

    case '/free':
      response = _handleFreeCommand();
      break;

    // ── Review Commands ──
    case '/review':
      handleReviewCommand(args); // Sends directly
      return;

    case '/plan':
      sendMorningBrief(); // Sends directly
      return;

    case '/mood':
      response = handleMoodCommand(args);
      break;

    // ── Note/Learning Commands ──
    case '/note':
    case '/n':
      response = _handleNoteCommand(args);
      break;

    case '/learn':
      response = _handleLearnCommand(args);
      break;

    // ── Search ──
    case '/search':
    case '/s':
      response = _handleSearchCommand(args);
      break;

    // ── Unknown ──
    default:
      response = `❓ Unknown command: ${command}\nUse /help for available commands.`;
      break;
  }

  if (response) {
    sendTelegram(response);
  }
}

// ─── Command Handlers ───────────────────────────────────────────

function _handleStart() {
  return `🚀 <b>Welcome to LifeOS</b>\n\n` +
    `Your personal operating system is ready.\n\n` +
    `Quick start:\n` +
    `📝 <code>/task Buy milk tomorrow</code>\n` +
    `💡 <code>/idea SaaS for students</code>\n` +
    `📅 <code>/today</code> — see your day\n` +
    `⚡ <code>/focus</code> — what to do now\n\n` +
    `Type /help for all commands.`;
}

function _handleHelp() {
  return `<b>📖 LifeOS Commands</b>\n\n` +
    `<b>Tasks</b>\n` +
    `<code>/task</code> <i>text</i> — Create task\n` +
    `<code>/tasks</code> — Today's tasks\n` +
    `<code>/tasks all</code> — All open tasks\n` +
    `<code>/done ID</code> — Complete task\n` +
    `<code>/focus</code> — What to do now\n\n` +
    `<b>Ideas</b>\n` +
    `<code>/idea</code> <i>text</i> — Save idea\n` +
    `<code>/ideas</code> — View ideas\n\n` +
    `<b>Calendar</b>\n` +
    `<code>/event</code> <i>text</i> — Create event\n` +
    `<code>/today</code> — Today's schedule\n` +
    `<code>/tomorrow</code> — Tomorrow\n` +
    `<code>/free</code> — Free time blocks\n` +
    `<code>/schedule ID</code> — Schedule task\n\n` +
    `<b>Reviews</b>\n` +
    `<code>/plan</code> — Morning brief\n` +
    `<code>/review</code> — Night review\n` +
    `<code>/review weekly</code> — Weekly review\n\n` +
    `<b>Other</b>\n` +
    `<code>/note</code> <i>text</i> — Save note\n` +
    `<code>/learn</code> <i>text</i> — Save learning\n` +
    `<code>/search</code> <i>query</i> — Search all\n\n` +
    `Or just type anything — I'll categorize it automatically.`;
}

function _handleEventCommand(text) {
  if (!text || !text.trim()) {
    return '📅 Usage: <code>/event German Class tomorrow 9AM 10:30AM</code>';
  }

  const result = processInboxItem(text, 'telegram');
  // processInboxItem will detect 'event' category and route to calendar
  return result.message;
}

function _handleTomorrowCommand() {
  const events = getTomorrowEvents();
  const tomorrow = new Date(getStartOfToday());
  tomorrow.setDate(tomorrow.getDate() + 1);

  let msg = `<b>📅 Tomorrow — ${formatDate(tomorrow, 'date')}</b>\n\n`;
  if (events.length) {
    msg += formatEventsForTelegram(events);
  } else {
    msg += 'No events scheduled.';
  }
  return msg;
}

function _handleFreeCommand() {
  const blocks = getFreeTimeBlocks();
  if (!blocks.length) return '😅 No free time blocks found today.';

  const totalFree = blocks.reduce((sum, b) => sum + b.minutes, 0);
  let msg = `<b>🟩 Free Time Today</b> (${Math.round(totalFree / 60 * 10) / 10}h)\n\n`;
  msg += formatFreeTimeForTelegram(blocks);
  return msg;
}

function _handleNoteCommand(text) {
  if (!text) return '📌 Usage: <code>/note Remember to call doctor</code>';
  const id = generateId('INB');
  appendRow('Inbox', [id, now(), 'telegram', text, truncate(text, 80), 'note', 'low', 'processed']);
  return `📌 Note saved\n<code>${id}</code>`;
}

function _handleLearnCommand(text) {
  if (!text) return '📚 Usage: <code>/learn The mitochondria is the powerhouse of the cell</code>';
  const id = generateId('LRN');
  appendRow('Learning', [id, now(), 'general', text, 'telegram', '']);
  return `📚 Learned!\n<code>${id}</code>`;
}

function _handleSearchCommand(query) {
  if (!query) return '🔍 Usage: <code>/search german vocabulary</code>';

  const q = query.toLowerCase();
  const results = [];

  // Search Tasks
  getSheetData('Tasks').forEach(t => {
    if ((t.Title && t.Title.toLowerCase().includes(q)) ||
        (t.Description && t.Description.toLowerCase().includes(q))) {
      results.push(`📝 ${escapeHtml(truncate(t.Title, 50))} <code>${t.ID}</code>`);
    }
  });

  // Search Ideas
  getSheetData('Ideas').forEach(i => {
    if (i.RawContent && i.RawContent.toLowerCase().includes(q)) {
      results.push(`💡 ${escapeHtml(truncate(i.RawContent, 50))} <code>${i.ID}</code>`);
    }
  });

  // Search Learning
  getSheetData('Learning').forEach(l => {
    if (l.Content && l.Content.toLowerCase().includes(q)) {
      results.push(`📚 ${escapeHtml(truncate(l.Content, 50))} <code>${l.ID}</code>`);
    }
  });

  // Search Inbox
  getSheetData('Inbox').forEach(i => {
    if (i.RawContent && i.RawContent.toLowerCase().includes(q)) {
      results.push(`📌 ${escapeHtml(truncate(i.RawContent, 50))}`);
    }
  });

  if (!results.length) return `🔍 No results for "${escapeHtml(query)}"`;

  let msg = `<b>🔍 Results for "${escapeHtml(query)}"</b>\n\n`;
  results.slice(0, 10).forEach(r => msg += r + '\n');
  if (results.length > 10) msg += `\n... +${results.length - 10} more`;

  return msg;
}

// ─── Callback Handler ───────────────────────────────────────────

function _handleCallback(parsed) {
  // Handle inline keyboard button presses
  // e.g., mood buttons from night review
  if (['😊', '😐', '😓', 'great', 'okay', 'tough'].includes(parsed.text.toLowerCase())) {
    const response = handleMoodCommand(parsed.text);
    sendTelegram(response);
  }
}

// ─── Server-side functions for Settings HTML ────────────────────

/**
 * Get all settings as key-value object (called from Settings.html).
 */
function getAllSettings() {
  const rows = getSheetData('Settings');
  const settings = {};
  rows.forEach(r => {
    settings[r.Key] = {
      value: r.Value || '',
      description: r.Description || ''
    };
  });
  return settings;
}

/**
 * Save settings from the HTML page (called from Settings.html).
 */
function saveSettings(settingsObj) {
  for (const [key, value] of Object.entries(settingsObj)) {
    setConfig(key, value);
  }
  return { success: true };
}

/**
 * Test Telegram connection (called from Settings.html).
 */
function testTelegramConnection() {
  try {
    sendTelegram('🔗 LifeOS connection test successful!');
    return { success: true, message: 'Test message sent to Telegram!' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Test Gemini connection (called from Settings.html).
 */
function testGeminiConnection() {
  try {
    const result = callGemini('Respond with exactly: OK');
    if (result) {
      return { success: true, message: 'Gemini API connected!' };
    }
    return { success: false, message: 'No response from Gemini' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Install triggers from Settings page.
 */
function installTriggersFromSettings() {
  try {
    const result = installTriggers();
    return { success: true, message: result };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Get the deployed web app URL for webhook setup.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Set Telegram webhook to this web app's URL.
 */
function setupWebhookFromSettings() {
  try {
    const url = getWebAppUrl();
    const result = setTelegramWebhook(url);
    if (result.ok) {
      return { success: true, message: `Webhook set to: ${url}` };
    }
    return { success: false, message: result.description || 'Failed' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
