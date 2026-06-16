/**
 * Setup.gs
 * Run setupLifeOS() ONCE from the editor. Creates every sheet with headers,
 * seeds default settings (without overwriting existing values), generates an
 * API_TOKEN, and records the spreadsheet ID for the bootstrap.
 * Safe to re-run: it only adds what's missing.
 */

const DEFAULT_SETTINGS = [
  // Identity
  ['USER_NAME', 'Nova', 'Name used in briefs/reviews'],
  ['LANGUAGE', 'en', 'Response language (en, de, ne)'],
  ['TIMEZONE', 'Europe/Berlin', 'Timezone for scheduling'],
  // AI primary (Groq, free)
  ['AI_PROVIDER', 'groq', 'groq|openrouter|deepseek|grok|openai|mistral|gemini|custom'],
  ['AI_BASE_URL', 'https://api.groq.com/openai/v1', 'OpenAI-compatible base URL (ignored for gemini)'],
  ['AI_API_KEY', '', 'API key for the active provider'],
  ['AI_MODEL', 'llama-3.3-70b-versatile', 'Model name'],
  ['AI_TEMPERATURE_PARSE', '0.2', 'Temp for categorize/parse'],
  ['AI_TEMPERATURE_PLAN', '0.7', 'Temp for plans/reviews'],
  // AI fallback (OpenRouter, free)
  ['AI_FALLBACK_PROVIDER', 'openrouter', 'Secondary provider used on 429'],
  ['AI_FALLBACK_BASE_URL', 'https://openrouter.ai/api/v1', 'Fallback base URL'],
  ['AI_FALLBACK_API_KEY', '', 'Fallback key'],
  ['AI_FALLBACK_MODEL', 'openrouter/free', 'Fallback model (auto-router)'],
  // Voice & Vision (free)
  ['VOICE_PROVIDER', 'groq', 'Transcription provider'],
  ['VOICE_API_KEY', '', 'Defaults to AI_API_KEY if blank'],
  ['VOICE_MODEL', 'whisper-large-v3', 'Whisper model'],
  ['VISION_PROVIDER', 'openrouter', 'Image-understanding provider'],
  ['VISION_API_KEY', '', 'Defaults to fallback key if blank'],
  ['VISION_MODEL', 'qwen/qwen-2-vl-7b-instruct:free', 'Free vision model'],
  // Messaging (Telegram default)
  ['MSG_PROVIDER', 'telegram', 'telegram|slack|whatsapp'],
  ['TELEGRAM_BOT_TOKEN', '', 'From @BotFather'],
  ['TELEGRAM_CHAT_ID', '', 'Your Telegram chat ID'],
  ['SLACK_BOT_TOKEN', '', 'xoxb- token'],
  ['SLACK_SIGNING_SECRET', '', 'Slack signing secret'],
  ['SLACK_CHANNEL_ID', '', 'Target channel/DM'],
  ['WHATSAPP_TOKEN', '', 'Meta Cloud API token'],
  ['WHATSAPP_PHONE_ID', '', 'Phone number ID'],
  ['WHATSAPP_TO', '', 'Your number'],
  // n8n / API
  ['API_TOKEN', '', 'Bearer token for ?api=1 (auto-generated)'],
  ['N8N_ENABLED', 'false', 'Fire domain events to n8n'],
  ['N8N_WEBHOOK_URL', '', 'n8n inbound webhook'],
  // Domains
  ['DOMAINS', 'studies,german,freelance,jobsearch,studentwerk,health,personal', 'Configurable life domains'],
  ['DEFAULT_DOMAIN', 'personal', 'Fallback domain'],
  ['DOMAIN_WEIGHTS', 'studies:5,german:5,freelance:4,jobsearch:3,studentwerk:3,health:3,personal:1', 'Brief/review weighting'],
  // Schedule (used from Phase 4+)
  ['MORNING_BRIEF_HOUR', '8', '0-23'],
  ['GERMAN_QUIZ_HOUR', '9', 'Daily vocab quiz hour'],
  ['GERMAN_NEW_WORDS_PER_DAY', '15', 'New A2 words/day'],
  ['NIGHT_REVIEW_HOUR', '22', '0-23'],
  ['WEEKLY_REVIEW_DAY', '0', '0=Sun..6=Sat'],
  ['WEEKLY_REVIEW_HOUR', '20', '0-23'],
  // Calendars
  ['CALENDAR_ID_CLASSES', 'primary', ''],
  ['CALENDAR_ID_STUDY', 'primary', ''],
  ['CALENDAR_ID_CAREER', 'primary', ''],
  ['CALENDAR_ID_PERSONAL', 'primary', ''],
  ['CALENDAR_ID_HEALTH', 'primary', ''],
  // Defaults & features
  ['DEFAULT_TASK_DURATION', '30', 'Minutes'],
  ['DEFAULT_PRIORITY', 'medium', 'high|medium|low'],
  ['POMODORO_FOCUS_MIN', '25', 'Focus block length'],
  ['POMODORO_BREAK_MIN', '5', 'Break length'],
  ['GAMIFICATION_ENABLED', 'true', 'XP/levels/streaks'],
  ['AI_CATEGORIZE', 'true', 'Auto-categorize inbox'],
  ['AI_SUMMARIZE', 'true', 'Auto-summarize long inputs'],
  ['SMART_RESCHEDULE', 'true', 'Auto-shift overloaded days']
];

// Sheet creation order
const SETUP_SHEETS = ['Inbox', 'Tasks', 'Projects', 'Events', 'Goals', 'Habits', 'Ideas', 'Learning', 'Vocab', 'Applications', 'Health', 'Sessions', 'Reviews', 'Stats', 'Settings'];

function setupLifeOS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  let created = 0;
  SETUP_SHEETS.forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); created++; }
    const headers = name === 'Settings' ? SCHEMA.Settings : SCHEMA[name];
    // (Re)write header row and format
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1f2433').setFontColor('#e6e8ee');
    sh.setFrozenRows(1);
  });

  // Seed default settings (skip keys that already exist)
  const settingsSheet = ss.getSheetByName('Settings');
  const existing = {};
  if (settingsSheet.getLastRow() >= 2) {
    settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues().forEach(r => { existing[String(r[0]).trim()] = true; });
  }
  const toAdd = DEFAULT_SETTINGS.filter(([k]) => !existing[k]).map(([k, v, d]) => [k, v, d, new Date()]);
  if (toAdd.length) {
    settingsSheet.getRange(settingsSheet.getLastRow() + 1, 1, toAdd.length, 4).setValues(toAdd);
  }

  // Generate API token if missing
  clearConfigCache();
  if (!getConfig('API_TOKEN')) {
    setConfig('API_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }

  // Remove the default empty sheet if present
  const def = ss.getSheetByName('Sheet1');
  if (def && SETUP_SHEETS.indexOf('Sheet1') === -1) { try { ss.deleteSheet(def); } catch (e) {} }

  const summary = `LifeOS setup complete.\n• ${created} sheet(s) created (${SETUP_SHEETS.length} total)\n• ${toAdd.length} default settings added\n\nNext:\n1. Fill AI_API_KEY + TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in the Settings sheet\n2. Deploy as Web App (Execute as Me, Access: Anyone)\n3. Run connectBot() to set the Telegram webhook`;
  try { SpreadsheetApp.getUi().alert(summary); } catch (e) { log('Setup', summary); }
  return summary;
}
