/**
 * Code.gs (v2)
 * Main entry point for the LifeOS Apps Script project.
 * Handles:
 * - doPost(): Telegram webhook receiver (text, commands, buttons, voice, photos)
 * - doGet(): Settings page (HTML)
 * - Command routing + callback (button) routing
 */

// ─── Webhook Entry Point ────────────────────────────────────────

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

    // Button presses
    if (parsed.isCallback) {
      answerCallback(parsed.callbackId);
      _handleCallback(parsed);
      return ContentService.createTextOutput('OK');
    }

    // Voice notes → transcribe → inbox
    if (parsed.isVoice) {
      _handleVoiceMessage(parsed);
      return ContentService.createTextOutput('OK');
    }

    // Photos → Gemini vision → inbox
    if (parsed.isPhoto) {
      _handlePhotoMessage(parsed);
      return ContentService.createTextOutput('OK');
    }

    // Commands vs free text
    if (parsed.isCommand) {
      _routeCommand(parsed.command, parsed.args, parsed);
    } else {
      const result = processInboxItem(parsed.text, 'telegram');
      _sendInboxConfirmation(result);
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

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Settings')
    .setTitle('LifeOS — Settings')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Command Router ─────────────────────────────────────────────

function _routeCommand(command, args, parsed) {
  let response;

  switch (command) {
    // ── Core ──
    case '/start':   response = _handleStart(); break;
    case '/help':    response = _handleHelp(); break;

    // ── Tasks ──
    case '/task':
    case '/t':       response = handleTaskCommand(args); break;       // sends directly
    case '/tasks':   response = handleTasksList(args); break;
    case '/done':
    case '/d':       response = handleDoneCommand(args); break;
    case '/cancel':  response = handleCancelCommand(args); break;
    case '/focus':
    case '/f':       response = handleFocusCommand(); break;          // sends directly
    case '/schedule':response = handleScheduleCommand(args); break;
    case '/waiting':
    case '/w':       response = handleWaitingCommand(args); break;

    // ── Pomodoro ──
    case '/pomo':
    case '/p':       response = handlePomoCommand(args); break;       // sends directly

    // ── Ideas ──
    case '/idea':
    case '/i':       response = handleIdeaCommand(args); break;
    case '/ideas':   response = handleIdeasList(args); break;

    // ── Calendar ──
    case '/event':
    case '/e':       response = _handleEventCommand(args); break;
    case '/today':   response = handleTodayCommand(); break;
    case '/tomorrow':response = _handleTomorrowCommand(); break;
    case '/free':    response = _handleFreeCommand(); break;

    // ── Habits ──
    case '/habit':   response = handleHabitCommand(args); break;
    case '/habits':  response = handleHabitsList(); break;            // sends directly
    case '/did':     response = handleDidCommand(args); break;
    case '/streaks': response = handleStreaksCommand(); break;

    // ── Goals ──
    case '/goal':    response = handleGoalCommand(args); break;
    case '/goals':   response = handleGoalsList(); break;
    case '/progress':response = handleProgressCommand(args); break;

    // ── Recurring ──
    case '/recur':
    case '/recurring': response = handleRecurCommand(args); break;

    // ── Learning ──
    case '/learn':   response = handleLearnCommand(args); break;
    case '/vocab':
    case '/v':       response = handleVocabCommand(args); break;
    case '/quiz':
    case '/q':       response = handleQuizCommand(); break;           // sends directly

    // ── Stats ──
    case '/stats':
    case '/xp':      response = handleStatsCommand(); break;

    // ── Reviews ──
    case '/review':  handleReviewCommand(args); return;               // sends directly
    case '/plan':    sendMorningBrief(); return;                      // sends directly
    case '/mood':    response = handleMoodCommand(args); break;

    // ── Notes / Search ──
    case '/note':
    case '/n':       response = _handleNoteCommand(args); break;
    case '/search':
    case '/s':       response = _handleSearchCommand(args); break;

    // ── Unknown ──
    default:
      response = `❓ Unknown command: ${escapeHtml(command)}\nUse /help for available commands.`;
      break;
  }

  if (response) {
    sendTelegram(response);
  }
}

// ─── Callback (button) Router ───────────────────────────────────

/**
 * Dispatch inline-keyboard button presses by callback_data prefix.
 * Formats: done:TSK-XX · sched:TSK-XX · cancel:TSK-XX · did:HAB-XX ·
 *          mood:value · triage:target:INB-XX · quizshow:LRN-XX ·
 *          quiz:grade:LRN-XX · quiznext: · pomo:again:TSK-XX
 */
function _handleCallback(parsed) {
  const data = parsed.text || '';
  const segments = data.split(':');
  const action = segments[0];
  const rest = segments.slice(1);

  switch (action) {
    case 'done': {
      const result = completeTask(rest[0]);
      if (result.ok) {
        editTelegramMessage(parsed.messageId, result.message);
      } else {
        sendTelegram(result.message);
      }
      break;
    }

    case 'cancel': {
      const msg = handleCancelCommand(rest[0]);
      editTelegramMessage(parsed.messageId, msg);
      break;
    }

    case 'sched':
      sendTelegram(handleScheduleCommand(rest[0]));
      break;

    case 'did': {
      const habit = findRow('Habits', 'ID', rest[0]);
      if (habit) {
        sendTelegram(completeHabit(habit));
      } else {
        sendTelegram('❌ Habit not found.');
      }
      break;
    }

    case 'mood':
      sendTelegram(handleMoodCommand(rest[0] || ''));
      break;

    case 'triage': {
      // triage:<target>:<INB-ID>
      const msg = convertInboxItem(rest[1], rest[0]);
      editTelegramMessage(parsed.messageId, msg);
      break;
    }

    case 'quizshow':
      handleQuizShowCallback(rest[0], parsed.messageId);
      break;

    case 'quiz':
      // quiz:<grade>:<LRN-ID>
      handleQuizGradeCallback(rest[0], rest[1], parsed.messageId);
      break;

    case 'quiznext':
      handleQuizCommand();
      break;

    case 'pomo':
      handlePomoCallback(rest);
      break;

    default:
      // Legacy mood emojis from old night reviews
      if (['😊', '😐', '😓', 'great', 'okay', 'tough'].includes(data.toLowerCase())) {
        sendTelegram(handleMoodCommand(data));
      }
      break;
  }
}

// ─── Voice & Photo Handlers ─────────────────────────────────────

function _handleVoiceMessage(parsed) {
  sendTelegram('🎙 Transcribing voice note...');

  const blob = getTelegramFileBlob(parsed.fileId);
  if (!blob) {
    sendTelegram('⚠️ Could not download the voice file. Try again?');
    return;
  }

  const transcript = transcribeAudio(blob, parsed.mimeType);
  if (!transcript) {
    sendTelegram('⚠️ Transcription failed. Check the Gemini API key, or type it instead.');
    return;
  }

  const result = processInboxItem(transcript, 'voice');
  result.message = `🎙 <i>"${escapeHtml(truncate(transcript, 200))}"</i>\n\n${result.message}`;
  _sendInboxConfirmation(result);
}

function _handlePhotoMessage(parsed) {
  sendTelegram('🖼 Analyzing image...');

  const blob = getTelegramFileBlob(parsed.fileId);
  if (!blob) {
    sendTelegram('⚠️ Could not download the image.');
    return;
  }

  const analysis = analyzeImage(blob, parsed.text);
  if (!analysis) {
    sendTelegram('⚠️ Image analysis failed. Check the Gemini API key.');
    return;
  }

  const result = processInboxItem(analysis, 'photo');
  result.message = `🖼 <b>From your image:</b>\n<i>${escapeHtml(truncate(analysis, 250))}</i>\n\n${result.message}`;
  _sendInboxConfirmation(result);
}

/**
 * Send the inbox confirmation. Notes get triage buttons (→Task / →Idea / Archive)
 * so misclassified captures can be fixed in one tap.
 */
function _sendInboxConfirmation(result) {
  if (result.category === 'note' && result.inboxId) {
    sendTelegramWithButtons(result.message, [
      [
        { text: '📝 → Task', callback_data: `triage:task:${result.inboxId}` },
        { text: '💡 → Idea', callback_data: `triage:idea:${result.inboxId}` }
      ],
      [{ text: '🗄 Archive', callback_data: `triage:archive:${result.inboxId}` }]
    ]);
  } else if (result.category === 'task' && result.routeResult && result.routeResult.id) {
    sendTelegramWithButtons(result.message, taskActionButtons(result.routeResult.id));
  } else {
    sendTelegram(result.message);
  }
}

// ─── Simple Command Handlers ────────────────────────────────────

function _handleStart() {
  return `🚀 <b>Welcome to LifeOS v2</b>\n\n` +
    `Your personal operating system is ready.\n\n` +
    `Quick start:\n` +
    `📝 <code>/task Buy milk tomorrow</code>\n` +
    `💡 <code>/idea SaaS for students</code>\n` +
    `🎙 Send a <b>voice note</b> — I'll transcribe & file it\n` +
    `🖼 Send a <b>screenshot</b> — I'll extract what matters\n` +
    `🍅 <code>/pomo</code> — start a focus timer\n` +
    `⚡ <code>/focus</code> — what to do right now\n\n` +
    `Type /help for all commands.`;
}

function _handleHelp() {
  return `<b>📖 LifeOS v2 Commands</b>\n\n` +
    `<b>Tasks</b>\n` +
    `<code>/task</code> <i>text</i> — Create (add goal:GOAL-XX to link)\n` +
    `<code>/tasks</code> [all|high|overdue|waiting]\n` +
    `<code>/done ID</code> · <code>/cancel ID</code>\n` +
    `<code>/focus</code> — What to do now\n` +
    `<code>/schedule ID</code> — Into next free slot\n` +
    `<code>/waiting</code> <i>text</i> — Track waiting-for\n\n` +
    `<b>Focus</b>\n` +
    `<code>/pomo [ID] [min]</code> — Pomodoro · <code>/pomo stop</code>\n\n` +
    `<b>Habits</b>\n` +
    `<code>/habit</code> <i>name daily morning</i>\n` +
    `<code>/habits</code> · <code>/did name</code> · <code>/streaks</code>\n\n` +
    `<b>Goals</b>\n` +
    `<code>/goal</code> <i>text</i> · <code>/goals</code>\n` +
    `<code>/progress GOAL-XX 60</code>\n\n` +
    `<b>Recurring</b>\n` +
    `<code>/recur</code> <i>Review inbox daily</i>\n` +
    `<code>/recur list|pause|resume|delete</code>\n\n` +
    `<b>Learning</b>\n` +
    `<code>/learn</code> <i>text</i> · <code>/vocab word - meaning</code>\n` +
    `<code>/quiz</code> — Spaced repetition\n\n` +
    `<b>Calendar</b>\n` +
    `<code>/event</code> <i>text</i> · <code>/today</code> · <code>/tomorrow</code> · <code>/free</code>\n\n` +
    `<b>Ideas & Notes</b>\n` +
    `<code>/idea</code> · <code>/ideas</code> · <code>/note</code> · <code>/search</code>\n\n` +
    `<b>Reviews & Stats</b>\n` +
    `<code>/plan</code> · <code>/review</code> · <code>/review weekly</code> · <code>/stats</code>\n\n` +
    `🎙 Voice notes and 🖼 photos are captured automatically.\n` +
    `Plain text gets AI-categorized into the right place.`;
}

function _handleEventCommand(text) {
  if (!text || !text.trim()) {
    return '📅 Usage: <code>/event German Class tomorrow 9AM 10:30AM</code>';
  }
  const result = processInboxItem(text, 'telegram');
  return result.message;
}

function _handleTomorrowCommand() {
  const events = getTomorrowEvents();
  const tomorrow = new Date(getStartOfToday());
  tomorrow.setDate(tomorrow.getDate() + 1);

  let msg = `<b>📅 Tomorrow — ${formatDate(tomorrow, 'date')}</b>\n\n`;
  msg += events.length ? formatEventsForTelegram(events) : 'No events scheduled.';
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

function _handleSearchCommand(query) {
  if (!query) return '🔍 Usage: <code>/search german vocabulary</code>';

  const q = query.toLowerCase();
  const results = [];

  getSheetData('Tasks').forEach(t => {
    if ((t.Title && t.Title.toLowerCase().includes(q)) ||
        (t.Description && t.Description.toLowerCase().includes(q))) {
      results.push(`📝 ${escapeHtml(truncate(t.Title, 50))} <code>${t.ID}</code>`);
    }
  });

  getSheetData('Ideas').forEach(i => {
    if (i.RawContent && i.RawContent.toLowerCase().includes(q)) {
      results.push(`💡 ${escapeHtml(truncate(i.RawContent, 50))} <code>${i.ID}</code>`);
    }
  });

  getSheetData('Learning').forEach(l => {
    if (l.Content && l.Content.toLowerCase().includes(q)) {
      results.push(`📚 ${escapeHtml(truncate(l.Content, 50))} <code>${l.ID}</code>`);
    }
  });

  getSheetData('Goals').forEach(g => {
    if (g.Title && g.Title.toLowerCase().includes(q)) {
      results.push(`🎯 ${escapeHtml(truncate(g.Title, 50))} <code>${g.GoalID}</code>`);
    }
  });

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

// ─── Server-side functions for Settings HTML ────────────────────

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

function saveSettings(settingsObj) {
  for (const [key, value] of Object.entries(settingsObj)) {
    setConfig(key, value);
  }
  return { success: true };
}

function testTelegramConnection() {
  try {
    sendTelegram('🔗 LifeOS connection test successful!');
    return { success: true, message: 'Test message sent to Telegram!' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

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

function installTriggersFromSettings() {
  try {
    const result = installTriggers();
    return { success: true, message: result };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

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