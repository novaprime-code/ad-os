/**
 * Setup.gs
 * First-time setup: creates all sheets with correct headers.
 * Run this ONCE when setting up a new LifeOS spreadsheet.
 *
 * Usage: Open Apps Script editor → Run → setupLifeOS()
 */

/**
 * Main setup function. Creates all sheets and populates Settings with defaults.
 */
function setupLifeOS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('This script must be bound to a Google Spreadsheet. Open a spreadsheet, then Extensions → Apps Script.');
  }

  // Store spreadsheet ID in script properties (bootstrap for Config.gs)
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  // Create all sheets
  _createSheet(ss, 'Inbox', ['ID', 'Timestamp', 'Source', 'RawContent', 'AI_Summary', 'Category', 'Priority', 'Status']);
  _createSheet(ss, 'Tasks', ['ID', 'CreatedAt', 'Title', 'Description', 'Priority', 'Energy', 'Duration', 'DueDate', 'Status', 'GoalID', 'CalendarEventID', 'CompletedAt']);
  _createSheet(ss, 'Events', ['ID', 'Title', 'StartTime', 'EndTime', 'CalendarID', 'Category', 'Status']);
  _createSheet(ss, 'Goals', ['GoalID', 'GoalType', 'Title', 'Description', 'Deadline', 'Progress', 'Status']);
  _createSheet(ss, 'Habits', ['ID', 'Name', 'Frequency', 'TimeOfDay', 'Streak', 'TotalDone', 'LastDone', 'Status']);
  _createSheet(ss, 'Ideas', ['ID', 'Timestamp', 'RawContent', 'AI_Summary', 'Category', 'Tags', 'Score', 'Status']);
  _createSheet(ss, 'Learning', ['ID', 'Timestamp', 'Topic', 'Content', 'Source', 'Tags']);
  _createSheet(ss, 'Reviews', ['ID', 'Date', 'Type', 'TasksCompleted', 'TasksPlanned', 'CompletionRate', 'AI_Summary', 'Mood', 'Notes']);
  _createSheet(ss, 'Settings', ['Key', 'Value', 'Description', 'UpdatedAt']);

  // Populate default settings
  _populateDefaultSettings(ss);

  // Format header rows
  _formatHeaders(ss);

  // Remove the default "Sheet1" if it exists and is empty
  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() <= 1) {
    try { ss.deleteSheet(sheet1); } catch (e) { /* can't delete last sheet */ }
  }

  log('Setup', 'LifeOS setup complete', { spreadsheetId: ss.getId() });

  SpreadsheetApp.getUi().alert(
    '✅ LifeOS Setup Complete!\n\n' +
    'Next steps:\n' +
    '1. Go to the Settings sheet and fill in your Telegram Bot Token, Chat ID, and Gemini API Key\n' +
    '2. Deploy as web app (Deploy → New deployment → Web app → Execute as: Me, Access: Anyone)\n' +
    '3. Copy the web app URL\n' +
    '4. Open the web app URL in your browser to access the Settings page\n' +
    '5. Use the Settings page to set up the Telegram webhook and install triggers'
  );
}

/**
 * Create a sheet with headers if it doesn't exist.
 * Doesn't overwrite existing sheets.
 */
function _createSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (sheet) {
    // Sheet exists — check if headers match
    const existing = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
    const existingClean = existing.map(h => String(h).trim()).filter(h => h);
    if (existingClean.length === 0) {
      // Empty sheet — add headers
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    return sheet;
  }

  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

/**
 * Populate the Settings sheet with default values.
 */
function _populateDefaultSettings(ss) {
  const sheet = ss.getSheetByName('Settings');
  const existingData = sheet.getDataRange().getValues();

  // Check if settings already exist
  if (existingData.length > 1) return; // Already populated

  const defaults = [
    ['TELEGRAM_BOT_TOKEN', '', 'Telegram Bot API token from @BotFather', ''],
    ['TELEGRAM_CHAT_ID', '', 'Your Telegram user/chat ID (send /start to @userinfobot)', ''],
    ['GEMINI_API_KEY', '', 'Google AI Studio API key (aistudio.google.com)', ''],
    ['SPREADSHEET_ID', ss.getId(), 'This spreadsheet ID (auto-filled)', new Date()],
    ['MORNING_BRIEF_HOUR', '8', 'Hour for morning brief (0-23)', ''],
    ['MORNING_BRIEF_MINUTE', '0', 'Minute for morning brief (0-59)', ''],
    ['NIGHT_REVIEW_HOUR', '22', 'Hour for night review', ''],
    ['NIGHT_REVIEW_MINUTE', '0', 'Minute for night review', ''],
    ['WEEKLY_REVIEW_DAY', '0', 'Day for weekly review (0=Sun, 1=Mon, ...6=Sat)', ''],
    ['WEEKLY_REVIEW_HOUR', '20', 'Hour for weekly review', ''],
    ['TIMEZONE', 'Europe/Berlin', 'Timezone for all scheduling', ''],
    ['DEFAULT_TASK_DURATION', '30', 'Default task duration in minutes', ''],
    ['DEFAULT_PRIORITY', 'medium', 'Default priority for new items (high/medium/low)', ''],
    ['CALENDAR_ID_CLASSES', 'primary', 'Google Calendar ID for classes', ''],
    ['CALENDAR_ID_STUDY', 'primary', 'Google Calendar ID for study blocks', ''],
    ['CALENDAR_ID_CAREER', 'primary', 'Google Calendar ID for career/work', ''],
    ['CALENDAR_ID_PERSONAL', 'primary', 'Google Calendar ID for personal', ''],
    ['CALENDAR_ID_HEALTH', 'primary', 'Google Calendar ID for health', ''],
    ['AI_MODEL', 'gemini-2.0-flash', 'Gemini model (gemini-2.0-flash or gemini-1.5-pro)', ''],
    ['AI_CATEGORIZE', 'true', 'Auto-categorize inbox items with AI', ''],
    ['AI_SUMMARIZE', 'true', 'Auto-summarize long inputs', ''],
    ['AI_DAILY_PLAN', 'true', 'Generate AI-powered daily plans', ''],
    ['LANGUAGE', 'en', 'Response language (en, de, ne)', '']
  ];

  defaults.forEach(row => {
    sheet.appendRow(row);
  });
}

/**
 * Format header rows (bold, freeze, color).
 */
function _formatHeaders(ss) {
  const sheetNames = ['Inbox', 'Tasks', 'Events', 'Goals', 'Habits', 'Ideas', 'Learning', 'Reviews', 'Settings'];

  sheetNames.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#2D2D2D');
    headerRange.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    // Auto-resize columns
    for (let c = 1; c <= sheet.getLastColumn(); c++) {
      sheet.autoResizeColumn(c);
    }
  });
}

/**
 * Quick setup test — verifies sheets exist and settings are populated.
 */
function verifySetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const required = ['Inbox', 'Tasks', 'Events', 'Goals', 'Habits', 'Ideas', 'Learning', 'Reviews', 'Settings'];
  const missing = required.filter(name => !ss.getSheetByName(name));

  if (missing.length) {
    return `❌ Missing sheets: ${missing.join(', ')}. Run setupLifeOS() first.`;
  }

  const token = getConfig('TELEGRAM_BOT_TOKEN');
  const chatId = getConfig('TELEGRAM_CHAT_ID');
  const geminiKey = getConfig('GEMINI_API_KEY');

  const issues = [];
  if (!token) issues.push('TELEGRAM_BOT_TOKEN not set');
  if (!chatId) issues.push('TELEGRAM_CHAT_ID not set');
  if (!geminiKey) issues.push('GEMINI_API_KEY not set');

  if (issues.length) {
    return `⚠️ Setup incomplete:\n${issues.join('\n')}`;
  }

  return '✅ All good! LifeOS is ready.';
}
