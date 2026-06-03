/**
 * Telegram.gs
 * Handles all Telegram Bot API communication.
 * Send messages, parse incoming updates, format responses.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

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

  // Remove parse_mode from payload if explicitly set to null
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
      // Retry without HTML formatting if parse error
      if (result.description && result.description.includes('parse')) {
        const retryPayload = { ...payload, parse_mode: undefined, text: _stripHtml(text) };
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
 */
function sendTelegramWithButtons(text, buttons) {
  sendTelegram(text, {
    reply_markup: JSON.stringify({
      inline_keyboard: buttons
    })
  });
}

/**
 * Parse an incoming Telegram webhook update.
 * @param {Object} update - The raw update object from doPost
 * @returns {Object} Parsed message: { chatId, text, command, args, isCommand, messageId, from }
 */
function parseTelegramUpdate(update) {
  // Handle regular messages
  const message = update.message || update.edited_message;
  // Handle callback queries (button presses)
  const callback = update.callback_query;

  if (callback) {
    return {
      chatId: String(callback.message.chat.id),
      text: callback.data,
      command: callback.data.startsWith('/') ? callback.data.split(/\s+/)[0].toLowerCase() : null,
      args: callback.data.startsWith('/') ? callback.data.split(/\s+/).slice(1).join(' ') : callback.data,
      isCommand: callback.data.startsWith('/'),
      isCallback: true,
      callbackId: callback.id,
      messageId: callback.message.message_id,
      from: callback.from
    };
  }

  if (!message || !message.text) {
    return null;
  }

  const text = message.text.trim();
  const parts = text.split(/\s+/);
  const firstWord = parts[0].toLowerCase();
  const isCommand = firstWord.startsWith('/');

  return {
    chatId: String(message.chat.id),
    text: text,
    command: isCommand ? firstWord.split('@')[0] : null, // Remove @botname suffix
    args: isCommand ? parts.slice(1).join(' ') : text,
    isCommand: isCommand,
    isCallback: false,
    messageId: message.message_id,
    from: message.from
  };
}

/**
 * Answer a callback query (acknowledge button press).
 */
function answerCallback(callbackId, text = '') {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  try {
    UrlFetchApp.fetch(`${TELEGRAM_API_BASE}${token}/answerCallbackQuery`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        callback_query_id: callbackId,
        text: text
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    log('Telegram', 'Callback answer error', e.message);
  }
}

/**
 * Set the webhook URL for the Telegram bot.
 * Call this once after deploying the Apps Script web app.
 * @param {string} webAppUrl - The deployed Apps Script URL
 */
function setTelegramWebhook(webAppUrl) {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  if (!token) {
    log('Telegram', 'Cannot set webhook: no bot token configured');
    return 'ERROR: No bot token';
  }

  const url = `${TELEGRAM_API_BASE}${token}/setWebhook`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: webAppUrl }),
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());
  log('Telegram', 'Webhook set result', result);
  return result;
}

/**
 * Remove the webhook (useful for debugging).
 */
function removeTelegramWebhook() {
  const token = getConfig('TELEGRAM_BOT_TOKEN');
  const url = `${TELEGRAM_API_BASE}${token}/deleteWebhook`;
  const response = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true });
  return JSON.parse(response.getContentText());
}

/**
 * Security check: verify the message is from the authorized chat.
 */
function isAuthorizedChat(chatId) {
  const allowedChatId = getConfig('TELEGRAM_CHAT_ID');
  return String(chatId) === String(allowedChatId);
}

/**
 * Strip HTML tags from text (fallback for parse errors).
 */
function _stripHtml(text) {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Format a task for Telegram display.
 */
function formatTask(task) {
  const priorityIcon = { high: '🔴', medium: '🟡', low: '🟢' }[task.Priority] || '⚪';
  const statusIcon = task.Status === 'done' ? '✅' : '📝';
  const due = task.DueDate ? ` (${formatDate(task.DueDate, 'date')})` : '';
  return `${statusIcon} ${priorityIcon} <b>${escapeHtml(task.Title)}</b>${due}\n   <code>${task.ID}</code>`;
}

/**
 * Format an idea for Telegram display.
 */
function formatIdea(idea) {
  return `💡 <b>${escapeHtml(truncate(idea.RawContent, 80))}</b>\n   ${idea.Category || 'uncategorized'} · <code>${idea.ID}</code>`;
}
