/**
 * Messaging.gs
 * Provider-agnostic chat layer. Telegram is fully implemented; Slack and WhatsApp
 * are scaffolded. parseInbound() normalizes any platform's webhook into one shape:
 *   { source, chatId, text, isCommand, command, args,
 *     isCallback, callbackId, callbackData, voiceFileId, photoFileId }
 */

class MessagingProvider {
  send(text, opts) { throw new Error('not implemented'); }
  sendButtons(text, buttons) { throw new Error('not implemented'); }
  parseInbound(update) { throw new Error('not implemented'); }
  setWebhook(url) { throw new Error('not implemented'); }
  downloadFile(fileId) { return null; }
  isAuthorized(chatId) { return true; }
}

// ─── Telegram ────────────────────────────────────────────────────

class TelegramProvider extends MessagingProvider {
  constructor() {
    super();
    this.token = getConfig('TELEGRAM_BOT_TOKEN');
    this.chatId = getConfig('TELEGRAM_CHAT_ID');
    this.api = `https://api.telegram.org/bot${this.token}`;
  }

  send(text, opts = {}) {
    if (!this.token || !this.chatId) { log('Telegram', 'missing token/chatId'); return; }
    const payload = { chat_id: this.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...opts };
    try {
      const resp = UrlFetchApp.fetch(`${this.api}/sendMessage`, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
      const r = JSON.parse(resp.getContentText());
      if (!r.ok && r.description && r.description.includes('parse')) {
        // retry without HTML
        const retry = { ...payload, text: stripHtml(text) }; delete retry.parse_mode;
        UrlFetchApp.fetch(`${this.api}/sendMessage`, {
          method: 'post', contentType: 'application/json',
          payload: JSON.stringify(retry), muteHttpExceptions: true
        });
      }
    } catch (e) { log('Telegram', 'send error', e.message); }
  }

  /** buttons: [[{text,data}], ...] → inline keyboard. */
  sendButtons(text, buttons) {
    const inline_keyboard = buttons.map(row => row.map(b => ({ text: b.text, callback_data: b.data })));
    this.send(text, { reply_markup: JSON.stringify({ inline_keyboard }) });
  }

  answerCallback(callbackId, text = '') {
    try {
      UrlFetchApp.fetch(`${this.api}/answerCallbackQuery`, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ callback_query_id: callbackId, text }), muteHttpExceptions: true
      });
    } catch (e) { log('Telegram', 'answerCallback error', e.message); }
  }

  parseInbound(update) {
    const cb = update.callback_query;
    if (cb) {
      return {
        source: 'telegram', chatId: String(cb.message.chat.id),
        text: cb.data, isCommand: false, command: null, args: '',
        isCallback: true, callbackId: cb.id, callbackData: cb.data,
        messageId: cb.message.message_id
      };
    }
    const m = update.message || update.edited_message;
    if (!m) return null;

    const base = {
      source: 'telegram', chatId: String(m.chat.id),
      isCallback: false, callbackId: null, callbackData: null,
      messageId: m.message_id, voiceFileId: null, photoFileId: null,
      text: '', isCommand: false, command: null, args: ''
    };

    if (m.voice || m.audio) { base.voiceFileId = (m.voice || m.audio).file_id; base.text = ''; return base; }
    if (m.photo && m.photo.length) { base.photoFileId = m.photo[m.photo.length - 1].file_id; base.text = m.caption || ''; return base; }

    const text = (m.text || '').trim();
    const parts = text.split(/\s+/);
    const isCommand = parts[0] && parts[0].startsWith('/');
    base.text = text;
    base.isCommand = !!isCommand;
    base.command = isCommand ? parts[0].split('@')[0].toLowerCase() : null;
    base.args = isCommand ? parts.slice(1).join(' ') : text;
    return base;
  }

  setWebhook(url) {
    const resp = UrlFetchApp.fetch(`${this.api}/setWebhook`, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ url, allowed_updates: ['message', 'edited_message', 'callback_query'] }),
      muteHttpExceptions: true
    });
    return JSON.parse(resp.getContentText());
  }

  /** Download a Telegram file by file_id → Blob bytes. */
  downloadFile(fileId) {
    try {
      const info = JSON.parse(UrlFetchApp.fetch(`${this.api}/getFile?file_id=${fileId}`, { muteHttpExceptions: true }).getContentText());
      if (!info.ok) return null;
      const path = info.result.file_path;
      const blob = UrlFetchApp.fetch(`https://api.telegram.org/file/bot${this.token}/${path}`, { muteHttpExceptions: true }).getBlob();
      return blob;
    } catch (e) { log('Telegram', 'downloadFile error', e.message); return null; }
  }

  isAuthorized(chatId) { return String(chatId) === String(this.chatId); }
}

// ─── Slack (scaffold — finish in a later phase) ──────────────────

class SlackProvider extends MessagingProvider {
  constructor() {
    super();
    this.token = getConfig('SLACK_BOT_TOKEN');
    this.channel = getConfig('SLACK_CHANNEL_ID');
  }
  send(text) {
    if (!this.token || !this.channel) { log('Slack', 'missing token/channel'); return; }
    UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: `Bearer ${this.token}` },
      payload: JSON.stringify({ channel: this.channel, text: stripHtml(text) }),
      muteHttpExceptions: true
    });
  }
  sendButtons(text, buttons) { this.send(text); } // TODO: Block Kit actions
  parseInbound(update) {
    const ev = update.event;
    if (!ev || ev.type !== 'message' || ev.bot_id) return null;
    const text = (ev.text || '').trim();
    const parts = text.split(/\s+/);
    const isCommand = parts[0] && parts[0].startsWith('/');
    return {
      source: 'slack', chatId: String(ev.channel), text,
      isCommand: !!isCommand, command: isCommand ? parts[0].toLowerCase() : null,
      args: isCommand ? parts.slice(1).join(' ') : text,
      isCallback: false, callbackId: null, callbackData: null
    };
  }
  setWebhook() { return { ok: true, note: 'Configure Slack Event Subscriptions URL manually.' }; }
  isAuthorized() { return true; }
}

// ─── WhatsApp (scaffold — Meta Cloud API, later phase) ───────────

class WhatsAppProvider extends MessagingProvider {
  constructor() {
    super();
    this.token = getConfig('WHATSAPP_TOKEN');
    this.phoneId = getConfig('WHATSAPP_PHONE_ID');
    this.to = getConfig('WHATSAPP_TO');
  }
  send(text) {
    if (!this.token || !this.phoneId) { log('WhatsApp', 'missing token/phoneId'); return; }
    UrlFetchApp.fetch(`https://graph.facebook.com/v20.0/${this.phoneId}/messages`, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: `Bearer ${this.token}` },
      payload: JSON.stringify({ messaging_product: 'whatsapp', to: this.to, text: { body: stripHtml(text) } }),
      muteHttpExceptions: true
    });
  }
  sendButtons(text, buttons) { this.send(text); } // TODO: interactive buttons
  parseInbound(update) {
    const msg = update?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return null;
    const text = (msg.text?.body || '').trim();
    const parts = text.split(/\s+/);
    const isCommand = parts[0] && parts[0].startsWith('/');
    return {
      source: 'whatsapp', chatId: String(msg.from), text,
      isCommand: !!isCommand, command: isCommand ? parts[0].toLowerCase() : null,
      args: isCommand ? parts.slice(1).join(' ') : text,
      isCallback: false, callbackId: null, callbackData: null
    };
  }
  setWebhook() { return { ok: true, note: 'Configure WhatsApp Cloud API webhook in Meta dashboard.' }; }
  isAuthorized() { return true; }
}

// ─── Factory ─────────────────────────────────────────────────────

function buildMessaging() {
  switch (getConfig('MSG_PROVIDER', 'telegram')) {
    case 'slack': return new SlackProvider();
    case 'whatsapp': return new WhatsAppProvider();
    default: return new TelegramProvider();
  }
}
