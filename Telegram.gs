/**
 * Telegram.gs (v2)
 * All Telegram Bot API communication.
 * v2 additions: editMessageText, file download (voice/photo),
 * voice & photo detection in parseTelegramUpdate.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const TELEGRAM_FILE_BASE = 'https://api.telegram.org/file/bot';

// ─── Sending ────────────────────────────────────────────────────

/**
 * Send a text message to the configured chat.
 * @param {string} text - Message text (HTML format)
 * @param {Object} [options] - Optional: reply_markup, parse_mode override
 */
function sendTelegram(text, options = {}) {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  const chatId = getConfig('TELEGRAM_CHAT_ID');

  if (!token || !chatId) {
    log('Telegram', 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return;
  }

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: true,
    ...options
  };
  if (options.parse_mode === null) delete payload.parse_mode;

  try {
    const url = `${TELEGRAM_API_BASE}${token}/sendMessage`;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    if (!result.ok) {
      log('Telegram', 'Send failed', result);
      // Retry without HTML if parse error
      if (result.description && result.description.includes('parse')) {
        const retryPayload = { ...payload, text: _stripHtml(text) };
        delete retryPayload.parse_mode;
        UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(retryPayload),
          muteHttpExceptions: true
        });
      }
    }
  } catch (e) {
    log('Telegram', 'Send error', e.message);
  }
}

/**
 * Send a message with inline keyboard buttons.
 * @param {string} text
 * @param {Array} buttons - [[{text, callback_data}], ...]
 */
function sendTelegramWithButtons(text, buttons) {
  sendTelegram(text, {
    reply_markup: JSON.stringify({ inline_keyboard: buttons })
  });
}

/**
 * Edit an existing message (used after button presses to update in place).
 * @param {number} messageId
 * @param {string} text - New text (HTML)
 * @param {Object} [options] - e.g. reply_markup for new buttons
 */
function editTelegramMessage(messageId, text, options = {}) {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  const chatId = getConfig('TELEGRAM_CHAT_ID');
  if (!token || !chatId || !messageId) return;

  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  };

  try {
    UrlFetchApp.fetch(`${TELEGRAM_API_BASE}${token}/editMessageText`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    log('Telegram', 'Edit error', e.message);
    // Fall back to a fresh message so the user always gets feedback
    sendTelegram(text, options);
  }
}

// ─── File download (voice notes, photos) ────────────────────────

/**
 * Download a Telegram file by file_id.
 * @param {string} fileId
 * @returns {Blob|null}
 */
function getTelegramFileBlob(fileId) {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  if (!token || !fileId) return null;

  try {
    const metaResp = UrlFetchApp.fetch(
      `${TELEGRAM_API_BASE}${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { muteHttpExceptions: true }
    );
    const meta = JSON.parse(metaResp.getContentText());
    if (!meta.ok || !meta.result || !meta.result.file_path) {
      log('Telegram', 'getFile failed', meta);
      return null;
    }

    const fileResp = UrlFetchApp.fetch(
      `${TELEGRAM_FILE_BASE}${token}/${meta.result.file_path}`,
      { muteHttpExceptions: true }
    );
    return fileResp.getBlob();
  } catch (e) {
    log('Telegram', 'File download error', e.message);
    return null;
  }
}

// ─── Parsing incoming updates ───────────────────────────────────

/**
 * Parse an incoming Telegram webhook update.
 * Detects: text messages, commands, callback queries, voice notes, photos.
 */
function parseTelegramUpdate(update) {
  const message = update.message || update.edited_message;
  const callback = update.callback_query;

  // Button press
  if (callback) {
    return {
      chatId: String(callback.message.chat.id),
      text: callback.data,
      command: callback.data.startsWith('/') ? callback.data.split(/\s+/)[0].toLowerCase() : null,
      args: callback.data.startsWith('/') ? callback.data.split(/\s+/).slice(1).join(' ') : callback.data,
      isCommand: callback.data.startsWith('/'),
      isCallback: true,
      isVoice: false,
      isPhoto: false,
      callbackId: callback.id,
      messageId: callback.message.message_id,
      from: callback.from
    };
  }

  if (!message) return null;

  // Voice note
  if (message.voice || message.audio) {
    const media = message.voice || message.audio;
    return {
      chatId: String(message.chat.id),
      text: '',
      isCommand: false,
      isCallback: false,
      isVoice: true,
      isPhoto: false,
      fileId: media.file_id,
      mimeType: media.mime_type || 'audio/ogg',
      duration: media.duration || 0,
      messageId: message.message_id,
      from: message.from
    };
  }

  // Photo (Telegram sends multiple sizes; last = largest)
  if (message.photo && message.photo.length) {
    const largest = message.photo[message.photo.length - 1];
    return {
      chatId: String(message.chat.id),
      text: message.caption || '',
      isCommand: false,
      isCallback: false,
      isVoice: false,
      isPhoto: true,
      fileId: largest.file_id,
      mimeType: 'image/jpeg',
      messageId: message.message_id,
      from: message.from
    };
  }

  if (!message.text) return null;

  const text = message.text.trim();
  const parts = text.split(/\s+/);
  const firstWord = parts[0].toLowerCase();
  const isCommand = firstWord.startsWith('/');

  return {
    chatId: String(message.chat.id),
    text: text,
    command: isCommand ? firstWord.split('@')[0] : null,
    args: isCommand ? parts.slice(1).join(' ') : text,
    isCommand: isCommand,
    isCallback: false,
    isVoice: false,
    isPhoto: false,
    messageId: message.message_id,
    from: message.from
  };
}

/**
 * Answer a callback query (acknowledge button press, optional toast text).
 */
function answerCallback(callbackId, text = '') {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  try {
    UrlFetchApp.fetch(`${TELEGRAM_API_BASE}${token}/answerCallbackQuery`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ callback_query_id: callbackId, text: text }),
      muteHttpExceptions: true
    });
  } catch (e) {
    log('Telegram', 'Callback answer error', e.message);
  }
}

// ─── Webhook management ─────────────────────────────────────────

function setTelegramWebhook(webAppUrl) {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  if (!token) {
    log('Telegram', 'Cannot set webhook: no bot token configured');
    return 'ERROR: No bot token';
  }

  const response = UrlFetchApp.fetch(`${TELEGRAM_API_BASE}${token}/setWebhook`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: webAppUrl }),
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());
  log('Telegram', 'Webhook set result', result);
  return result;
}

function removeTelegramWebhook() {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  const response = UrlFetchApp.fetch(`${TELEGRAM_API_BASE}${token}/deleteWebhook`, {
    method: 'post', muteHttpExceptions: true
  });
  return JSON.parse(response.getContentText());
}

/**
 * Security check: verify the message is from the authorized chat.
 */
function isAuthorizedChat(chatId) {
  const allowedChatId = getConfig('TELEGRAM_CHAT_ID');
  return String(chatId) === String(allowedChatId);
}

// ─── Formatting helpers ─────────────────────────────────────────

function _stripHtml(text) {
  return text.replace(/<[^>]*>/g, '');
}

function formatTask(task) {
  const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[task.Priority] || '⚪';
  const statusIcon = task.Status === 'done' ? '✅'
    : task.Status === 'in_progress' ? '▶️'
    : task.Status === 'waiting' ? '⏳' : '📝';
  const due = task.DueDate ? ` (${formatDate(task.DueDate, 'date')})` : '';
  return `${statusIcon} ${priorityIcon} <b>${escapeHtml(task.Title)}</b>${due}\n   <code>${task.ID}</code>`;
}

function formatIdea(idea) {
  return `💡 <b>${escapeHtml(truncate(idea.RawContent, 80))}</b>\n   ${idea.Category || 'uncategorized'} · <code>${idea.ID}</code>`;
}