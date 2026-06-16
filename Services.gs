/**
 * Services.gs
 * Phase 0/1 business logic: capture pipeline + task/idea/learning + search + XP.
 * Later phases add Vocab/Application/Health/Planning/Review/Focus services.
 */

// ─── Shared builders ─────────────────────────────────────────────

const DEFAULT_DOMAIN = () => getConfig('DEFAULT_DOMAIN', 'personal');

function _taskDtoFromAI(text, ai) {
  ai = ai || {};
  const due = ai.dueDate
    ? new Date(ai.dueTime ? `${ai.dueDate}T${ai.dueTime}` : `${ai.dueDate}T23:59`)
    : (parseDate(text) || '');
  return {
    CreatedAt: now(),
    Title: ai.summary || truncate(text, 100),
    Description: text,
    Priority: ai.priority || getConfig('DEFAULT_PRIORITY', 'medium'),
    Energy: 'medium',
    Duration: ai.duration || getConfigNumber('DEFAULT_TASK_DURATION', 30),
    DueDate: due,
    Status: 'todo',
    Domain: ai.domain || DEFAULT_DOMAIN(),
    ProjectID: '', GoalID: '', ParentTaskID: '', DependsOn: '',
    Recurrence: 'none', RecurrenceConfig: '', WaitingOn: '',
    CalendarEventID: '', CompletedAt: ''
  };
}

function _guessIdeaCategory(tags) {
  const t = String(tags || '').toLowerCase();
  if (/business|saas|startup/.test(t)) return 'business';
  if (/project|code|app/.test(t)) return 'project';
  if (/learn|study|course/.test(t)) return 'learning';
  return 'other';
}

const CATEGORY_EMOJI = { task: '📝', idea: '💡', event: '📅', note: '📌', learning: '📚', vocab: '🇩🇪', application: '💼', health: '🩺' };

// ─── InboxService (capture > organize) ───────────────────────────

class InboxService extends BaseService {
  constructor(repos) { super(); this.repos = repos; }

  /**
   * Capture raw input, categorize with AI, route, and return a confirmation
   * payload (message + triage buttons).
   */
  capture(text, source = 'telegram') {
    if (!text || !text.trim()) return fail('EMPTY', 'Nothing to capture');

    // 1. Save to Inbox immediately
    const inbox = this.repos.inbox.create({
      Timestamp: now(), Source: source, RawContent: text,
      AI_Summary: '', Category: '', Priority: '', Domain: '', Status: 'new', RoutedID: ''
    });

    // 2. Categorize
    let cat = 'note', summary = truncate(text, 80), priority = getConfig('DEFAULT_PRIORITY', 'medium');
    let domain = DEFAULT_DOMAIN(), ai = null;
    if (getConfigBool('AI_CATEGORIZE', true)) {
      ai = aiCategorize(text);
      if (ai) {
        cat = ai.category || cat; summary = ai.summary || summary;
        priority = ai.priority || priority; domain = ai.domain || domain;
      }
    }

    // 3. Route
    const routed = this._route(cat, text, ai);

    // 4. Update inbox row
    this.repos.inbox.update(inbox.ID, {
      AI_Summary: summary, Category: cat, Priority: priority,
      Domain: domain, Status: 'processed', RoutedID: (routed && routed.id) || ''
    });

    // 5. XP + event
    Container.statsService().award('inbox.captured');
    this.emit('inbox.captured', { id: inbox.ID, category: cat, domain });

    // 6. Confirmation + triage buttons
    const emoji = CATEGORY_EMOJI[cat] || '📌';
    let msg = `${emoji} <b>${cat.toUpperCase()}</b> · ${domain}\n${escapeHtml(summary)}`;
    if (routed && routed.id) msg += `\n<code>${routed.id}</code>`;
    if (routed && routed.extra) msg += `\n${routed.extra}`;

    const buttons = [[
      { text: '📝 Task', data: `triage:${inbox.ID}:task` },
      { text: '💡 Idea', data: `triage:${inbox.ID}:idea` },
      { text: '🗑', data: `triage:${inbox.ID}:trash` }
    ]];

    return ok({ inboxId: inbox.ID, category: cat, summary, routedId: routed && routed.id, message: msg, buttons });
  }

  _route(category, text, ai) {
    switch (category) {
      case 'task': return this._toTask(text, ai);
      case 'idea': return this._toIdea(text, ai);
      case 'event': return this._toEvent(text, ai);
      case 'learning': return this._toLearning(text, ai);
      // vocab/application/health routing arrives in later phases — kept as notes for now
      default: return null;
    }
  }

  _toTask(text, ai) {
    const t = this.repos.tasks.create(_taskDtoFromAI(text, ai));
    Container.statsService().award('task.created');
    this.emit('task.created', { id: t.ID, title: t.Title, domain: t.Domain });
    return { id: t.ID, extra: t.DueDate ? `Due: ${formatDate(t.DueDate, 'date')}` : '' };
  }

  _toIdea(text, ai) {
    ai = ai || {};
    const idea = this.repos.ideas.create({
      Timestamp: now(), RawContent: text, AI_Summary: ai.summary || truncate(text, 80),
      Category: _guessIdeaCategory(ai.tags), Domain: ai.domain || DEFAULT_DOMAIN(),
      Tags: ai.tags || '', Score: '', ProjectID: '', Status: 'new'
    });
    this.emit('idea.captured', { id: idea.ID });
    return { id: idea.ID };
  }

  _toLearning(text, ai) {
    ai = ai || {};
    const l = this.repos.learning.create({
      Timestamp: now(), Topic: ai.tags || 'general', Content: text,
      Source: 'capture', Domain: ai.domain || DEFAULT_DOMAIN(), Tags: ai.tags || ''
    });
    return { id: l.ID };
  }

  _toEvent(text, ai) {
    const ev = aiParseEvent(text);
    if (!ev || !ev.startDate || !ev.startTime) return { extra: '⚠️ Couldn’t parse a time — kept as a note.' };
    const start = new Date(`${ev.startDate}T${ev.startTime}`);
    const end = ev.endTime ? new Date(`${ev.startDate}T${ev.endTime}`) : new Date(start.getTime() + 3600000);
    const gid = createCalendarEvent({ title: ev.title || truncate(text, 50), startTime: start, endTime: end, category: ev.category || 'personal', description: `[LifeOS] ${text}` });
    if (!gid) return { extra: '⚠️ Calendar event creation failed.' };
    const rec = this.repos.events.create({
      Title: ev.title || truncate(text, 50), StartTime: start, EndTime: end,
      CalendarID: getCalendarId(ev.category || 'personal'), Category: ev.category || 'personal',
      Domain: DEFAULT_DOMAIN(), Status: 'upcoming'
    });
    return { id: rec.ID, extra: `📅 ${formatDate(start, 'time')}–${formatDate(end, 'time')} · added to Calendar` };
  }

  /** Re-route an inbox item to a target (task/idea/trash) from a triage button. */
  triage(inboxId, target) {
    const item = this.repos.inbox.find(inboxId);
    if (!item) return fail('NOT_FOUND', 'Inbox item not found');
    if (target === 'trash') {
      this.repos.inbox.update(inboxId, { Status: 'archived' });
      return ok({ message: '🗑 Discarded.' });
    }
    const routed = this._route(target, item.RawContent, { summary: item.AI_Summary, domain: item.Domain });
    this.repos.inbox.update(inboxId, { Category: target, Status: 'processed', RoutedID: (routed && routed.id) || '' });
    return ok({ message: `${CATEGORY_EMOJI[target] || '✅'} Moved to ${target}${routed && routed.id ? ` · <code>${routed.id}</code>` : ''}` });
  }

  list(status) {
    const rows = status ? this.repos.inbox.filterBy('Status', status) : this.repos.inbox.unprocessed();
    return ok(rows);
  }
}

// ─── TaskService ─────────────────────────────────────────────────

class TaskService extends BaseService {
  constructor(repos) { super(); this.repos = repos; }

  createFromText(text) {
    const ai = getConfigBool('AI_CATEGORIZE', true) ? aiCategorize(text) : null;
    const t = this.repos.tasks.create(_taskDtoFromAI(text, ai));
    Container.statsService().award('task.created');
    this.emit('task.created', { id: t.ID, title: t.Title });
    return ok(t);
  }

  create(dto) {
    const base = _taskDtoFromAI(dto.Title || '', {});
    const t = this.repos.tasks.create({ ...base, ...dto });
    return ok(t);
  }

  complete(id) {
    const t = this.repos.tasks.find(id);
    if (!t) return fail('NOT_FOUND', `Task ${id} not found`);
    this.repos.tasks.update(id, { Status: 'done', CompletedAt: now() });
    if (t.CalendarEventID) {
      try { CalendarApp.getEventById(t.CalendarEventID).deleteEvent(); } catch (e) {}
    }
    Container.statsService().award('task.done', t.Priority === 'high' ? 15 : 10);
    this.emit('task.done', { id, title: t.Title, domain: t.Domain });

    // Recurring → spawn the next instance
    let spawned = null;
    if (t.Recurrence && t.Recurrence !== 'none' && t.Recurrence !== '') {
      const base = toDate(t.DueDate);
      const from = (base && base > getStartOfToday()) ? base : getStartOfToday();
      const next = nextRecurrenceDate(t.Recurrence, from);
      spawned = this.repos.tasks.create({
        CreatedAt: now(), Title: t.Title, Description: t.Description, Priority: t.Priority,
        Energy: t.Energy, Duration: t.Duration, DueDate: next, Status: 'todo', Domain: t.Domain,
        ProjectID: t.ProjectID, GoalID: t.GoalID, ParentTaskID: '', DependsOn: '',
        Recurrence: t.Recurrence, RecurrenceConfig: t.RecurrenceConfig, WaitingOn: '',
        CalendarEventID: '', CompletedAt: ''
      });
    }
    return ok({ id, title: t.Title, recurredTo: spawned && spawned.ID, nextDue: spawned && spawned.DueDate });
  }

  /** Add a subtask under a parent (inherits domain/project). */
  createSubtask(parentId, text) {
    const parent = this.repos.tasks.find(parentId);
    if (!parent) return fail('NOT_FOUND', `Parent ${parentId} not found`);
    if (!text) return fail('EMPTY', 'No subtask text');
    const ai = getConfigBool('AI_CATEGORIZE', true) ? aiCategorize(text) : null;
    const dto = _taskDtoFromAI(text, ai);
    dto.ParentTaskID = parentId;
    dto.Domain = parent.Domain || dto.Domain;
    dto.ProjectID = parent.ProjectID || '';
    const t = this.repos.tasks.create(dto);
    this.emit('task.created', { id: t.ID, parent: parentId });
    return ok(t);
  }

  setDependency(id, dependsOnId) {
    if (!this.repos.tasks.find(id)) return fail('NOT_FOUND', `Task ${id} not found`);
    if (!this.repos.tasks.find(dependsOnId)) return fail('NOT_FOUND', `Blocker ${dependsOnId} not found`);
    this.repos.tasks.update(id, { DependsOn: dependsOnId });
    return ok({ id, dependsOn: dependsOnId });
  }

  setWaiting(id, who) {
    if (!this.repos.tasks.find(id)) return fail('NOT_FOUND', `Task ${id} not found`);
    this.repos.tasks.update(id, { Status: 'waiting', WaitingOn: who || '' });
    return ok({ id, waitingOn: who || '' });
  }

  setRecurrence(id, rule) {
    const valid = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
    rule = String(rule || '').toLowerCase();
    if (!valid.includes(rule)) return fail('BAD_RULE', `Use one of: ${valid.join(', ')}`);
    if (!this.repos.tasks.find(id)) return fail('NOT_FOUND', `Task ${id} not found`);
    this.repos.tasks.update(id, { Recurrence: rule });
    return ok({ id, recurrence: rule });
  }

  /** A task is blocked if its DependsOn target exists and isn't done. */
  _isBlocked(t) {
    if (!t.DependsOn) return false;
    const dep = this.repos.tasks.find(t.DependsOn);
    return !!(dep && dep.Status !== 'done');
  }

  /** Single best next action: highest-ranked open, non-blocked task. */
  focus() {
    const rows = this.repos.tasks.open().filter(t => !this._isBlocked(t));
    rows.sort((a, b) => _taskRank(b) - _taskRank(a));
    return ok(rows[0] || null);
  }

  list(filter, domain) {
    let rows = this.repos.tasks.open();
    if (filter === 'all') rows = this.repos.tasks.all().filter(t => t.Status !== 'archived' && t.Status !== 'done');
    else if (filter === 'high') rows = rows.filter(t => t.Priority === 'high');
    else if (filter === 'waiting') rows = this.repos.tasks.waiting();
    else if (filter === 'overdue') rows = rows.filter(t => toDate(t.DueDate) && toDate(t.DueDate) < getStartOfToday());
    else if (filter === 'today' || !filter) {
      const end = getEndOfToday();
      rows = rows.filter(t => !t.DueDate || (toDate(t.DueDate) && toDate(t.DueDate) <= end));
    }
    if (domain) rows = rows.filter(t => t.Domain === domain);
    // annotate (clone to avoid mutating cached rows); blocked sinks to the bottom
    rows = rows.map(t => Object.assign({}, t, { _blocked: this._isBlocked(t), _hasParent: !!t.ParentTaskID }));
    rows.sort((a, b) => (a._blocked - b._blocked) || (_taskRank(b) - _taskRank(a)));
    return ok(rows);
  }
}

/** Compute the next due date for a recurrence rule from a base date. */
function nextRecurrenceDate(rule, from) {
  const d = new Date(from);
  switch (String(rule).toLowerCase()) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'weekdays': do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); break;
    case 'daily': default: d.setDate(d.getDate() + 1);
  }
  d.setHours(23, 59, 0, 0);
  return d;
}

const PRIORITY_SCORE = { high: 3, medium: 2, low: 1 };
function _domainWeight(domain) {
  const map = {};
  getConfig('DOMAIN_WEIGHTS', '').split(',').forEach(p => {
    const [d, w] = p.split(':'); if (d) map[d.trim()] = Number(w) || 1;
  });
  return map[domain] || 1;
}
function _taskRank(t) {
  let r = _domainWeight(t.Domain) * 10 + (PRIORITY_SCORE[t.Priority] || 1);
  const due = toDate(t.DueDate);
  if (due) {
    const days = (due - new Date()) / 86400000;
    if (days < 0) r += 20; else if (days < 1) r += 8; else if (days < 3) r += 4;
  }
  return r;
}

// ─── IdeaService / LearningService ───────────────────────────────

class IdeaService extends BaseService {
  constructor(repos) { super(); this.repos = repos; }
  create(text) {
    const ai = getConfigBool('AI_CATEGORIZE', true) ? aiCategorize(text) : null;
    const idea = this.repos.ideas.create({
      Timestamp: now(), RawContent: text, AI_Summary: (ai && ai.summary) || truncate(text, 80),
      Category: _guessIdeaCategory(ai && ai.tags), Domain: (ai && ai.domain) || DEFAULT_DOMAIN(),
      Tags: (ai && ai.tags) || '', Score: '', ProjectID: '', Status: 'new'
    });
    return ok(idea);
  }
  list() { return ok(this.repos.ideas.where(i => i.Status !== 'archived')); }
}

class LearningService extends BaseService {
  constructor(repos) { super(); this.repos = repos; }
  create(text, topic) {
    const l = this.repos.learning.create({
      Timestamp: now(), Topic: topic || 'general', Content: text,
      Source: 'capture', Domain: DEFAULT_DOMAIN(), Tags: ''
    });
    return ok(l);
  }
}

// ─── SearchService ───────────────────────────────────────────────

class SearchService extends BaseService {
  constructor(repos) { super(); this.repos = repos; }
  global(query) {
    const q = String(query || '').toLowerCase();
    if (!q) return ok([]);
    const out = [];
    this.repos.tasks.all().forEach(t => {
      if ((t.Title && String(t.Title).toLowerCase().includes(q)) || (t.Description && String(t.Description).toLowerCase().includes(q)))
        out.push({ type: 'task', icon: '📝', text: truncate(t.Title, 60), id: t.ID });
    });
    this.repos.ideas.all().forEach(i => {
      if (i.RawContent && String(i.RawContent).toLowerCase().includes(q))
        out.push({ type: 'idea', icon: '💡', text: truncate(i.RawContent, 60), id: i.ID });
    });
    this.repos.learning.all().forEach(l => {
      if (l.Content && String(l.Content).toLowerCase().includes(q))
        out.push({ type: 'learning', icon: '📚', text: truncate(l.Content, 60), id: l.ID });
    });
    return ok(out.slice(0, 25));
  }
}

// ─── GamificationService ─────────────────────────────────────────

const XP_RULES = { 'inbox.captured': 2, 'task.created': 3, 'task.done': 10, 'vocab.reviewed': 2, 'application.sent': 15, 'health.logged': 3, 'habit.done': 5, 'focus.session': 8 };

class GamificationService extends BaseService {
  constructor(repos) { super(); this.repos = repos; }
  award(event, override) {
    if (!getConfigBool('GAMIFICATION_ENABLED', true)) return;
    const pts = override != null ? override : (XP_RULES[event] || 0);
    if (!pts) return;
    const total = Number(this.repos.stats.get('xp_total', 0)) + pts;
    this.repos.stats.set('xp_total', total);
    this.repos.stats.set('level', Math.floor(Math.sqrt(total / 50)));
  }
  snapshot() {
    return {
      xp: Number(this.repos.stats.get('xp_total', 0)),
      level: Number(this.repos.stats.get('level', 0))
    };
  }
}