/**
 * Api.gs
 * One dispatcher for all transports (SPA via google.script.run, n8n via ?api=1).
 * Actions are `domain.verb`. Every handler returns a Result envelope.
 */

/** Global entry — callable from google.script.run.api(action, payload). */
function api(action, payload, ctx) {
  const t0 = Date.now();
  payload = payload || {};
  ctx = ctx || { source: 'spa', viaApi: false };
  try {
    const handler = API_ROUTES[action];
    if (!handler) return fail('UNKNOWN_ACTION', `Unknown action: ${action}`);
    const res = handler(payload, ctx);
    if (res && res.ok && res.meta) res.meta.ms = Date.now() - t0;
    return res;
  } catch (e) {
    log('Api', `action ${action} failed`, e.message);
    return fail('EXCEPTION', e.message);
  }
}

const API_ROUTES = {
  // ── system ──
  'system.bootstrap': () => {
    const tasks = Container.taskService().list('today').data;
    const counts = {
      inbox: Container.repos().inbox.unprocessed().length,
      openTasks: Container.repos().tasks.open().length,
      ideas: Container.repos().ideas.count(i => i.Status !== 'archived'),
      vocabDue: Container.repos().vocab.due().length
    };
    return ok({
      settings: _publicSettings(),
      user: getConfig('USER_NAME', 'there'),
      today: tasks.slice(0, 10),
      counts,
      stats: Container.statsService().snapshot()
    });
  },
  'system.health': () => {
    const aiOk = !!Container.ai().chat('Reply with: OK', { maxTokens: 5 });
    return ok({ ai: aiOk, messaging: getConfig('MSG_PROVIDER', 'telegram'), spreadsheet: SheetClient.exists('Settings') });
  },
  'system.installTriggers': () => ok({ message: installTriggers() }),
  'system.setWebhook': () => {
    const r = Container.messaging().setWebhook(getWebAppUrl());
    return r && (r.ok || r.note) ? ok(r) : fail('WEBHOOK', JSON.stringify(r));
  },

  // ── inbox ──
  'inbox.list': (p) => Container.inboxService().list(p.status),
  'inbox.process': (p) => Container.inboxService().capture(p.text, p.source || 'api'),
  'inbox.triage': (p) => Container.inboxService().triage(p.id, p.target),

  // ── tasks ──
  'tasks.list': (p) => Container.taskService().list(p.filter, p.domain),
  'tasks.create': (p) => p.text ? Container.taskService().createFromText(p.text) : Container.taskService().create(p),
  'tasks.complete': (p) => Container.taskService().complete(p.id),
  'tasks.focus': () => Container.taskService().focus(),
  'tasks.subtask': (p) => Container.taskService().createSubtask(p.parentId, p.text),
  'tasks.depend': (p) => Container.taskService().setDependency(p.id, p.dependsOn),
  'tasks.wait': (p) => Container.taskService().setWaiting(p.id, p.who),
  'tasks.recur': (p) => Container.taskService().setRecurrence(p.id, p.rule),

  // ── ideas / learning ──
  'ideas.list': () => Container.ideaService().list(),
  'ideas.create': (p) => Container.ideaService().create(p.text),
  'learning.list': () => ok(Container.repos().learning.all()),
  'learning.create': (p) => Container.learningService().create(p.text, p.topic),

  // ── read-only lists for SPA views ──
  'events.today': () => ok(getTodayEvents()),
  'projects.list': () => ok(Container.repos().projects.active()),
  'goals.list': () => ok(Container.repos().goals.active()),
  'habits.list': () => ok(Container.repos().habits.active()),

  // ── vocab (German A1→A2, SM-2) ──
  'vocab.due': () => Container.vocabService().due(),
  'vocab.add': (p) => Container.vocabService().add(p.term, p.translation, p.example, p.level),
  'vocab.review': (p) => Container.vocabService().review(p.id, p.quality),
  'vocab.stats': () => ok(Container.vocabService().stats()),
  'vocab.seed': (p) => ok({ added: Container.vocabService().seedNewWords(p.n) }),

  // ── search / stats ──
  'search.global': (p) => Container.searchService().global(p.query),
  'stats.get': () => ok(Container.statsService().snapshot()),

  // ── settings ──
  'settings.get': () => ok(_publicSettings()),
  'settings.save': (p) => { setConfigs(p.settings || {}); Container.reset(); return ok({ saved: Object.keys(p.settings || {}).length }); },
  'settings.test': (p) => _testProvider(p.target)
};

// Settings exposed to the SPA — secrets masked.
function _publicSettings() {
  const out = {};
  SheetClient.readAll('Settings').forEach(r => {
    const key = r.Key, val = String(r.Value || '');
    const secret = /TOKEN|API_KEY|SECRET/.test(key);
    out[key] = { value: secret && val ? '••••••' + val.slice(-4) : val, description: r.Description || '', secret };
  });
  return out;
}

function _testProvider(target) {
  try {
    if (target === 'messaging') { Container.messaging().send('🔗 LifeOS messaging test — connected!'); return ok({ message: 'Sent.' }); }
    if (target === 'ai') { const r = Container.ai().chat('Reply with exactly: OK', { maxTokens: 5 }); return r ? ok({ message: 'AI connected: ' + truncate(r, 40) }) : fail('AI', 'No response'); }
    if (target === 'voice') return ok({ message: 'Send a voice note in chat to test transcription.' });
    if (target === 'vision') return ok({ message: 'Send a photo in chat to test vision.' });
    return fail('BAD_TARGET', 'Unknown test target');
  } catch (e) { return fail('TEST_FAILED', e.message); }
}

function getWebAppUrl() { return getConfig('WEBAPP_URL') || ScriptApp.getService().getUrl(); }