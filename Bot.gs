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
    } else if (data.startsWith('quiz:')) {
      const [, id, q] = data.split(':');
      Container.vocabService().review(id, q);
      const due = Container.vocabService().due().data;
      if (due.length) _sendCard(due[0], due.length);
      else msg.send('✅ Review complete. <b>Gut gemacht!</b> 🇩🇪');
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
      { const r = Container.taskService().complete(args.trim()); reply = r.ok ? `✅ Done: <b>${escapeHtml(r.data.title)}</b>${r.data.recurredTo ? `\n🔁 Next: ${formatDate(r.data.nextDue, 'date')} · <code>${r.data.recurredTo}</code>` : ''}` : `⚠️ ${r.error.message}`; }
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

    case '/vocab': case '/v':
      if (!args) { reply = '🇩🇪 Usage: <code>/vocab das Rathaus</code>\nor <code>/vocab das Rathaus = town hall</code>'; break; }
      {
        let term = args, translation = '';
        const eq = args.split('=');
        if (eq.length > 1) { term = eq[0].trim(); translation = eq.slice(1).join('=').trim(); }
        const r = Container.vocabService().add(term, translation);
        reply = r.ok
          ? `🇩🇪 Added <b>${escapeHtml(r.data.Term)}</b>${r.data.Translation ? ` — ${escapeHtml(r.data.Translation)}` : ''}${r.data.Example ? `\n<i>${escapeHtml(r.data.Example)}</i>` : ''}\n<code>${r.data.ID}</code>`
          : `⚠️ ${r.error.message}`;
      }
      break;

    case '/quiz': case '/q':
      _startQuiz();
      return;

    case '/focus': case '/f':
      { const r = Container.taskService().focus();
        reply = r.data ? `🎯 <b>Next up</b>\n${_taskLine(r.data)}\n\nComplete with <code>/done ${r.data.ID}</code>` : '🎯 Nothing to focus on right now. Inbox zero energy ✨'; }
      break;

    case '/sub':
      { const [pid, ...rest] = args.split(/\s+/); const text = rest.join(' ');
        if (!pid || !text) { reply = '➕ Usage: <code>/sub TSK-PARENT pick up books</code>'; break; }
        const r = Container.taskService().createSubtask(pid, text);
        reply = r.ok ? `➕ Subtask of <code>${pid}</code>\n<b>${escapeHtml(r.data.Title)}</b>\n<code>${r.data.ID}</code>` : `⚠️ ${r.error.message}`; }
      break;

    case '/block':
      { const [id, dep] = args.split(/\s+/);
        if (!id || !dep) { reply = '⛔ Usage: <code>/block TSK-A TSK-B</code> (A waits for B)'; break; }
        const r = Container.taskService().setDependency(id, dep);
        reply = r.ok ? `⛔ <code>${id}</code> is now blocked until <code>${dep}</code> is done.` : `⚠️ ${r.error.message}`; }
      break;

    case '/wait':
      { const [id, ...who] = args.split(/\s+/);
        if (!id) { reply = '⏳ Usage: <code>/wait TSK-XXXX prof reply</code>'; break; }
        const r = Container.taskService().setWaiting(id, who.join(' '));
        reply = r.ok ? `⏳ <code>${id}</code> marked waiting${r.data.waitingOn ? ` on ${escapeHtml(r.data.waitingOn)}` : ''}.` : `⚠️ ${r.error.message}`; }
      break;

    case '/recur':
      { const [id, rule] = args.split(/\s+/);
        if (!id || !rule) { reply = '🔁 Usage: <code>/recur TSK-XXXX daily</code> (daily|weekdays|weekly|monthly|none)'; break; }
        const r = Container.taskService().setRecurrence(id, rule);
        reply = r.ok ? `🔁 <code>${id}</code> now repeats <b>${escapeHtml(r.data.recurrence)}</b>.` : `⚠️ ${r.error.message}`; }
      break;

    case '/search': case '/s':
      if (!args) { reply = '🔍 Usage: <code>/search query</code>'; break; }
      { const r = Container.searchService().global(args); reply = _formatSearch(r.data, args); }
      break;

    case '/stats':
      { const s = Container.statsService().snapshot(); const v = Container.vocabService().stats(); reply = `📊 Level ${s.level} · ${s.xp} XP\n🇩🇪 German: ${v.due} due · ${v.mastered} mastered · ${v.total} total`; }
      break;

    // Planning/review land in later phases
    case '/today': case '/plan': case '/review':
      reply = '⏳ This command arrives in a later phase. Capture (text/voice/photo), /task, /tasks, /done, /idea, /search and /stats are live now.';
      break;

    default:
      reply = `❓ Unknown command: ${escapeHtml(command)}\nTry /help.`;
  }

  if (reply) msg.send(reply);
}

function _taskLine(t) {
  const icon = { high: '🔴', medium: '🟡', low: '🟢' }[t.Priority] || '⚪';
  const marks = `${t._blocked ? ' ⛔' : ''}${t.Recurrence && t.Recurrence !== 'none' ? ' 🔁' : ''}${t._hasParent ? ' ↳' : ''}`;
  return `${icon} <b>${escapeHtml(truncate(t.Title, 50))}</b>${marks}${t.DueDate ? ` · ${formatDate(t.DueDate, 'date')}` : ''}\n   <code>${t.ID}</code> · ${t.Domain}`;
}

function _formatTasks(tasks, filter) {
  if (!tasks || !tasks.length) return '🎉 No tasks here.';
  let out = `<b>📝 Tasks${filter ? ' · ' + escapeHtml(filter) : ''}</b>\n\n`;
  tasks.slice(0, 15).forEach(t => { out += _taskLine(t) + '\n'; });
  if (tasks.length > 15) out += `\n…and ${tasks.length - 15} more`;
  return out;
}

function _formatSearch(results, query) {
  if (!results || !results.length) return `🔍 No results for "${escapeHtml(query)}"`;
  let out = `<b>🔍 "${escapeHtml(query)}"</b>\n\n`;
  results.forEach(r => out += `${r.icon} ${escapeHtml(r.text)}${r.id ? ` <code>${r.id}</code>` : ''}\n`);
  return out;
}

function _startQuiz() {
  const due = Container.vocabService().due().data;
  if (!due.length) { Container.messaging().send('🇩🇪 No cards due right now. <b>Alles erledigt!</b> 🎉'); return; }
  _sendCard(due[0], due.length);
}

function _sendCard(card, remaining) {
  const back = `${escapeHtml(card.Translation || '—')}${card.Example ? `\n${escapeHtml(card.Example)}` : ''}`;
  const msg = `🇩🇪 <b>${escapeHtml(card.Term)}</b>\n\n<tg-spoiler>${back}</tg-spoiler>\n\n<i>${remaining} due · tap to reveal, then rate yourself</i>`;
  Container.messaging().sendButtons(msg, [[
    { text: 'Again', data: `quiz:${card.ID}:1` },
    { text: 'Hard',  data: `quiz:${card.ID}:3` },
    { text: 'Good',  data: `quiz:${card.ID}:4` },
    { text: 'Easy',  data: `quiz:${card.ID}:5` }
  ]]);
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
    `<b>Tasks</b>\n<code>/task</code> text · <code>/tasks</code> [all|high|overdue|waiting] · <code>/done ID</code> · <code>/focus</code>\n` +
    `<code>/sub ID text</code> · <code>/block A B</code> · <code>/wait ID who</code> · <code>/recur ID daily</code>\n\n` +
    `<b>Capture</b>\n<code>/idea</code> · <code>/note</code> · <code>/learn</code>\n\n` +
    `<b>German 🇩🇪</b>\n<code>/vocab das Rathaus</code> add a word · <code>/quiz</code> review due cards\n\n` +
    `<b>Other</b>\n<code>/search</code> query · <code>/stats</code> · <code>/id</code>\n\n` +
    `<i>Briefs, reviews, applications and health arrive in later phases.</i>`;
}