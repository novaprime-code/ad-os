/**
 * Bot.gs
 * The chat "ear and mouth": turns a normalized inbound message into service calls
 * and formats replies. Shares the exact same services as the SPA and n8n.
 */

function handleInbound(parsed) {
  const msg = Container.messaging();

  // Callback (inline button) — currently used for inbox triage.
  if (parsed.isCallback) {
    if (msg.answerCallback) msg.answerCallback(parsed.callbackId);
    const data = String(parsed.callbackData || '');
    if (data.startsWith('triage:')) {
      const [, id, target] = data.split(':');
      const res = Container.inboxService().triage(id, target);
      msg.send(res.ok ? res.data.message : `⚠️ ${res.error.message}`);
    }
    return;
  }

  // Voice → transcribe → capture
  if (parsed.voiceFileId) {
    const blob = msg.downloadFile(parsed.voiceFileId);
    const text = transcribeAudio(blob);
    if (!text) { msg.send('🎙️ Sorry, I couldn’t transcribe that. Try again or type it.'); return; }
    msg.send(`🎙️ <i>${escapeHtml(truncate(text, 120))}</i>`);
    _capture(text, parsed.source);
    return;
  }

  // Photo → vision describe → capture
  if (parsed.photoFileId) {
    const blob = msg.downloadFile(parsed.photoFileId);
    const desc = describeImage(blob, 'Briefly describe this image and transcribe any visible text. Be concise.');
    const text = [parsed.text, desc].filter(Boolean).join(' — ');
    if (!text) { msg.send('🖼️ I couldn’t read that image. Add a caption?'); return; }
    _capture(text, 'image');
    return;
  }

  // Command vs free-text capture
  if (parsed.isCommand) {
    _routeCommand(parsed.command, parsed.args);
  } else if (parsed.text) {
    _capture(parsed.text, parsed.source);
  }
}

function _capture(text, source) {
  const res = Container.inboxService().capture(text, source);
  if (!res.ok) { Container.messaging().send(`⚠️ ${res.error.message}`); return; }
  Container.messaging().sendButtons(res.data.message, res.data.buttons);
}

function _routeCommand(command, args) {
  const msg = Container.messaging();
  let reply;

  switch (command) {
    case '/start': reply = _start(); break;
    case '/help': reply = _help(); break;
    case '/id': reply = `Your chat ID: <code>${getConfig('TELEGRAM_CHAT_ID')}</code>`; break;

    case '/task': case '/t':
      if (!args) { reply = '📝 Usage: <code>/task submit report friday HIGH</code>'; break; }
      { const r = Container.taskService().createFromText(args); reply = r.ok ? `📝 Task saved\n<b>${escapeHtml(r.data.Title)}</b>${r.data.DueDate ? ` · ${formatDate(r.data.DueDate, 'date')}` : ''}\n<code>${r.data.ID}</code>` : `⚠️ ${r.error.message}`; }
      break;

    case '/tasks':
      { const r = Container.taskService().list(args || 'today'); reply = _formatTasks(r.data, args); }
      break;

    case '/done': case '/d':
      if (!args) { reply = '✅ Usage: <code>/done TSK-XXXX</code>'; break; }
      { const r = Container.taskService().complete(args.trim()); reply = r.ok ? `✅ Done: <b>${escapeHtml(r.data.title)}</b>` : `⚠️ ${r.error.message}`; }
      break;

    case '/idea': case '/i':
      if (!args) { reply = '💡 Usage: <code>/idea app that does X</code>'; break; }
      { const r = Container.ideaService().create(args); reply = `💡 Idea saved\n<code>${r.data.ID}</code>`; }
      break;

    case '/note': case '/n':
      if (!args) { reply = '📌 Usage: <code>/note remember to ...</code>'; break; }
      Container.repos().inbox.create({ Timestamp: now(), Source: 'telegram', RawContent: args, AI_Summary: truncate(args, 80), Category: 'note', Priority: 'low', Domain: getConfig('DEFAULT_DOMAIN', 'personal'), Status: 'processed', RoutedID: '' });
      reply = '📌 Note saved.';
      break;

    case '/learn':
      if (!args) { reply = '📚 Usage: <code>/learn ...</code>'; break; }
      { const r = Container.learningService().create(args); reply = `📚 Learned!\n<code>${r.data.ID}</code>`; }
      break;

    case '/search': case '/s':
      if (!args) { reply = '🔍 Usage: <code>/search query</code>'; break; }
      { const r = Container.searchService().global(args); reply = _formatSearch(r.data, args); }
      break;

    case '/stats':
      { const s = Container.statsService().snapshot(); reply = `📊 Level ${s.level} · ${s.xp} XP`; }
      break;

    // Planning/review land in later phases
    case '/today': case '/plan': case '/focus': case '/review':
      reply = '⏳ This command arrives in a later phase. Capture (text/voice/photo), /task, /tasks, /done, /idea, /search and /stats are live now.';
      break;

    default:
      reply = `❓ Unknown command: ${escapeHtml(command)}\nTry /help.`;
  }

  if (reply) msg.send(reply);
}

function _formatTasks(tasks, filter) {
  if (!tasks || !tasks.length) return '🎉 No tasks here.';
  const icon = { high: '🔴', medium: '🟡', low: '🟢' };
  let out = `<b>📝 Tasks${filter ? ' · ' + escapeHtml(filter) : ''}</b>\n\n`;
  tasks.slice(0, 15).forEach(t => {
    out += `${icon[t.Priority] || '⚪'} <b>${escapeHtml(truncate(t.Title, 50))}</b>${t.DueDate ? ` · ${formatDate(t.DueDate, 'date')}` : ''}\n   <code>${t.ID}</code> · ${t.Domain}\n`;
  });
  if (tasks.length > 15) out += `\n…and ${tasks.length - 15} more`;
  return out;
}

function _formatSearch(results, query) {
  if (!results || !results.length) return `🔍 No results for "${escapeHtml(query)}"`;
  let out = `<b>🔍 "${escapeHtml(query)}"</b>\n\n`;
  results.forEach(r => out += `${r.icon} ${escapeHtml(r.text)}${r.id ? ` <code>${r.id}</code>` : ''}\n`);
  return out;
}

function _start() {
  return `🚀 <b>LifeOS is live</b>\n\n` +
    `Just type, speak, or send a photo — I’ll capture and categorize it.\n\n` +
    `📝 <code>/task submit report friday</code>\n` +
    `💡 <code>/idea ...</code>  ·  📚 <code>/learn ...</code>\n` +
    `📋 <code>/tasks</code>  ·  ✅ <code>/done ID</code>\n` +
    `🔍 <code>/search ...</code>  ·  📊 <code>/stats</code>\n\n` +
    `Type /help for everything.`;
}

function _help() {
  return `<b>📖 LifeOS</b>\n\n` +
    `<b>Capture</b>: type anything, send a 🎙️ voice note, or a 🖼️ photo.\n\n` +
    `<b>Tasks</b>\n<code>/task</code> text · <code>/tasks</code> [all|high|overdue|waiting] · <code>/done ID</code>\n\n` +
    `<b>Capture</b>\n<code>/idea</code> · <code>/note</code> · <code>/learn</code>\n\n` +
    `<b>Other</b>\n<code>/search</code> query · <code>/stats</code> · <code>/id</code>\n\n` +
    `<i>Briefs, reviews, German vocab, applications and health arrive in later phases.</i>`;
}
