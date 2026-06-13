/**
 * DashboardAPI.gs
 * Server-side functions called by Dashboard.html via google.script.run.
 * Provides data for all dashboard views.
 */

// ─── Dashboard Overview ─────────────────────────────────────────

/**
 * Get dashboard overview stats.
 */
function getDashboardStats() {
  const tasks = getSheetData('Tasks');
  const ideas = getSheetData('Ideas');
  const inbox = getSheetData('Inbox');
  const goals = getSheetData('Goals');
  const habits = getSheetData('Habits');
  const reviews = getSheetData('Reviews');

  const today = getStartOfToday();
  const endOfDay = getEndOfToday();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const openTasks = tasks.filter(t => ['todo', 'in_progress'].includes(t.Status));
  const todayTasks = openTasks.filter(t => {
    if (!t.DueDate) return false;
    return new Date(t.DueDate) <= endOfDay;
  });
  const overdueTasks = openTasks.filter(t => {
    if (!t.DueDate) return false;
    return new Date(t.DueDate) < today;
  });
  const completedToday = tasks.filter(t =>
    t.Status === 'done' && t.CompletedAt && new Date(t.CompletedAt) >= today
  );
  const completedThisWeek = tasks.filter(t =>
    t.Status === 'done' && t.CompletedAt && new Date(t.CompletedAt) >= weekAgo
  );
  const createdThisWeek = tasks.filter(t =>
    new Date(t.CreatedAt) >= weekAgo
  );

  const activeGoals = goals.filter(g => g.Status === 'active');
  const activeHabits = habits.filter(h => h.Status === 'active');

  // Completion rate this week
  const weekRate = createdThisWeek.length > 0
    ? Math.round(completedThisWeek.length / createdThisWeek.length * 100)
    : 0;

  // Recent ideas
  const recentIdeas = ideas.filter(i => new Date(i.Timestamp) >= weekAgo);

  // Unprocessed inbox
  const unprocessedInbox = inbox.filter(i => i.Status === 'new');

  return {
    tasks: {
      total: openTasks.length,
      today: todayTasks.length,
      overdue: overdueTasks.length,
      completedToday: completedToday.length,
      completedThisWeek: completedThisWeek.length,
      weekRate: weekRate
    },
    ideas: {
      total: ideas.length,
      recent: recentIdeas.length
    },
    inbox: {
      unprocessed: unprocessedInbox.length,
      total: inbox.length
    },
    goals: {
      active: activeGoals.length,
      total: goals.length
    },
    habits: {
      active: activeHabits.length
    },
    reviews: {
      total: reviews.length
    }
  };
}

// ─── Tasks API ──────────────────────────────────────────────────

/**
 * Get tasks with optional filtering.
 */
function getTasksForDashboard(filter) {
  const tasks = getSheetData('Tasks');
  const today = getStartOfToday();
  const endOfDay = getEndOfToday();
  let filtered;

  switch (filter) {
    case 'today':
      filtered = tasks.filter(t => {
        if (['done', 'cancelled'].includes(t.Status)) return false;
        if (!t.DueDate) return false;
        return new Date(t.DueDate) <= endOfDay;
      });
      break;
    case 'overdue':
      filtered = tasks.filter(t => {
        if (['done', 'cancelled'].includes(t.Status)) return false;
        if (!t.DueDate) return false;
        return new Date(t.DueDate) < today;
      });
      break;
    case 'high':
      filtered = tasks.filter(t =>
        t.Priority === 'high' && ['todo', 'in_progress'].includes(t.Status)
      );
      break;
    case 'done':
      filtered = tasks.filter(t => t.Status === 'done');
      filtered.sort((a, b) => new Date(b.CompletedAt) - new Date(a.CompletedAt));
      filtered = filtered.slice(0, 30);
      break;
    case 'all':
    default:
      filtered = tasks.filter(t => ['todo', 'in_progress'].includes(t.Status));
      break;
  }

  // Sort by priority then due date
  const po = { high: 0, medium: 1, low: 2 };
  if (filter !== 'done') {
    filtered.sort((a, b) => {
      const pDiff = (po[a.Priority] || 2) - (po[b.Priority] || 2);
      if (pDiff !== 0) return pDiff;
      if (a.DueDate && b.DueDate) return new Date(a.DueDate) - new Date(b.DueDate);
      return a.DueDate ? -1 : 1;
    });
  }

  return filtered.map(t => ({
    id: t.ID,
    title: t.Title,
    description: t.Description || '',
    priority: t.Priority,
    energy: t.Energy || 'medium',
    duration: t.Duration || 30,
    dueDate: t.DueDate ? new Date(t.DueDate).toISOString() : null,
    status: t.Status,
    completedAt: t.CompletedAt ? new Date(t.CompletedAt).toISOString() : null,
    goalId: t.GoalID || '',
    _rowIndex: t._rowIndex
  }));
}

/**
 * Create a task from the dashboard.
 */
function createTaskFromDashboard(data) {
  const taskId = generateId('TSK');
  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  appendRow('Tasks', [
    taskId,
    now(),
    data.title,
    data.description || '',
    data.priority || 'medium',
    data.energy || 'medium',
    data.duration || 30,
    dueDate,
    'todo',
    data.goalId || '',
    '',
    ''
  ]);

  return { success: true, id: taskId };
}

/**
 * Update task status from dashboard.
 */
function updateTaskFromDashboard(taskId, updates) {
  const task = findRow('Tasks', 'ID', taskId);
  if (!task) return { success: false, message: 'Task not found' };

  const rowUpdates = {};
  if (updates.status) {
    rowUpdates['Status'] = updates.status;
    if (updates.status === 'done') {
      rowUpdates['CompletedAt'] = now();
      if (task.CalendarEventID) {
        deleteCalendarEvent(task.CalendarEventID);
      }
    }
  }
  if (updates.priority) rowUpdates['Priority'] = updates.priority;
  if (updates.title) rowUpdates['Title'] = updates.title;

  updateRow('Tasks', task._rowIndex, rowUpdates);
  return { success: true };
}

/**
 * Delete a task.
 */
function deleteTaskFromDashboard(taskId) {
  const task = findRow('Tasks', 'ID', taskId);
  if (!task) return { success: false };
  if (task.CalendarEventID) deleteCalendarEvent(task.CalendarEventID);
  deleteRow('Tasks', task._rowIndex);
  return { success: true };
}

// ─── Ideas API ──────────────────────────────────────────────────

function getIdeasForDashboard(filter) {
  let ideas = getSheetData('Ideas');
  if (filter && filter !== 'all') {
    ideas = ideas.filter(i => i.Category === filter || i.Status === filter);
  }
  ideas.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

  return ideas.map(i => ({
    id: i.ID,
    content: i.RawContent,
    summary: i.AI_Summary || '',
    category: i.Category || 'other',
    tags: i.Tags || '',
    score: i.Score || '',
    status: i.Status || 'new',
    timestamp: new Date(i.Timestamp).toISOString()
  }));
}

function createIdeaFromDashboard(data) {
  const ideaId = generateId('IDEA');
  appendRow('Ideas', [
    ideaId, now(), data.content, data.summary || truncate(data.content, 80),
    data.category || 'other', data.tags || '', '', 'new'
  ]);
  return { success: true, id: ideaId };
}

function updateIdeaFromDashboard(ideaId, updates) {
  const idea = findRow('Ideas', 'ID', ideaId);
  if (!idea) return { success: false };
  const rowUpdates = {};
  if (updates.status) rowUpdates['Status'] = updates.status;
  if (updates.category) rowUpdates['Category'] = updates.category;
  updateRow('Ideas', idea._rowIndex, rowUpdates);
  return { success: true };
}

// ─── Inbox API ──────────────────────────────────────────────────

function getInboxForDashboard(filter) {
  let items = getSheetData('Inbox');
  if (filter === 'new') items = items.filter(i => i.Status === 'new');
  else if (filter === 'processed') items = items.filter(i => i.Status === 'processed');
  items.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

  return items.slice(0, 50).map(i => ({
    id: i.ID,
    content: i.RawContent,
    summary: i.AI_Summary || '',
    category: i.Category || '',
    priority: i.Priority || '',
    status: i.Status || 'new',
    source: i.Source || '',
    timestamp: new Date(i.Timestamp).toISOString()
  }));
}

function processInboxFromDashboard(inboxId, action) {
  const item = findRow('Inbox', 'ID', inboxId);
  if (!item) return { success: false };

  if (action === 'archive') {
    updateRow('Inbox', item._rowIndex, { 'Status': 'archived' });
  } else if (action === 'delete') {
    deleteRow('Inbox', item._rowIndex);
  }
  return { success: true };
}

// ─── Today/Calendar API ─────────────────────────────────────────

function getTodayForDashboard() {
  const events = getTodayEvents();
  const tasks = getSheetData('Tasks').filter(t => {
    if (['done', 'cancelled'].includes(t.Status)) return false;
    if (!t.DueDate) return true;
    return new Date(t.DueDate) <= getEndOfToday();
  });
  const po = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => (po[a.Priority] || 2) - (po[b.Priority] || 2));

  const freeBlocks = getFreeTimeBlocks();

  return {
    date: now().toISOString(),
    events: events.map(e => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      isAllDay: e.isAllDay
    })),
    tasks: tasks.slice(0, 10).map(t => ({
      id: t.ID,
      title: t.Title,
      priority: t.Priority,
      duration: t.Duration || 30,
      status: t.Status,
      dueDate: t.DueDate ? new Date(t.DueDate).toISOString() : null
    })),
    freeBlocks: freeBlocks.map(b => ({
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      minutes: b.minutes
    }))
  };
}

// ─── Goals API ──────────────────────────────────────────────────

function getGoalsForDashboard() {
  const goals = getSheetData('Goals');
  return goals.map(g => ({
    id: g.GoalID,
    type: g.GoalType || '',
    title: g.Title,
    description: g.Description || '',
    deadline: g.Deadline ? new Date(g.Deadline).toISOString() : null,
    progress: g.Progress || 0,
    status: g.Status || 'active',
    _rowIndex: g._rowIndex
  }));
}

function createGoalFromDashboard(data) {
  const goalId = generateId('GOAL');
  appendRow('Goals', [
    goalId, data.type || 'personal', data.title,
    data.description || '', data.deadline ? new Date(data.deadline) : '',
    0, 'active'
  ]);
  return { success: true, id: goalId };
}

function updateGoalFromDashboard(goalId, updates) {
  const goal = findRow('Goals', 'GoalID', goalId);
  if (!goal) return { success: false };
  const rowUpdates = {};
  if (updates.progress !== undefined) rowUpdates['Progress'] = updates.progress;
  if (updates.status) rowUpdates['Status'] = updates.status;
  if (updates.title) rowUpdates['Title'] = updates.title;
  updateRow('Goals', goal._rowIndex, rowUpdates);
  return { success: true };
}

// ─── Habits API ─────────────────────────────────────────────────

function getHabitsForDashboard() {
  const habits = getSheetData('Habits');
  return habits.map(h => ({
    id: h.ID,
    name: h.Name,
    frequency: h.Frequency || 'daily',
    timeOfDay: h.TimeOfDay || 'anytime',
    streak: h.Streak || 0,
    totalDone: h.TotalDone || 0,
    lastDone: h.LastDone ? new Date(h.LastDone).toISOString() : null,
    status: h.Status || 'active',
    _rowIndex: h._rowIndex
  }));
}

function createHabitFromDashboard(data) {
  const habitId = generateId('HAB');
  appendRow('Habits', [
    habitId, data.name, data.frequency || 'daily',
    data.timeOfDay || 'anytime', 0, 0, '', 'active'
  ]);
  return { success: true, id: habitId };
}

function completeHabitFromDashboard(habitId) {
  const habit = findRow('Habits', 'ID', habitId);
  if (!habit) return { success: false };

  const today = getStartOfToday();
  const lastDone = habit.LastDone ? new Date(habit.LastDone) : null;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let newStreak = (habit.Streak || 0);
  if (!lastDone || lastDone < yesterday) {
    newStreak = 1;
  } else if (lastDone >= yesterday && lastDone < today) {
    newStreak += 1;
  }
  // If already done today, don't double-count
  if (lastDone && lastDone >= today) {
    return { success: true, alreadyDone: true };
  }

  updateRow('Habits', habit._rowIndex, {
    'Streak': newStreak,
    'TotalDone': (habit.TotalDone || 0) + 1,
    'LastDone': now()
  });
  return { success: true, streak: newStreak };
}

// ─── Reviews API ────────────────────────────────────────────────

function getReviewsForDashboard() {
  const reviews = getSheetData('Reviews');
  reviews.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  return reviews.slice(0, 30).map(r => ({
    id: r.ID,
    date: r.Date ? new Date(r.Date).toISOString() : '',
    type: r.Type || 'daily',
    tasksCompleted: r.TasksCompleted || 0,
    tasksPlanned: r.TasksPlanned || 0,
    completionRate: r.CompletionRate || 0,
    summary: r.AI_Summary || '',
    mood: r.Mood || '',
    notes: r.Notes || ''
  }));
}

// ─── Learning API ───────────────────────────────────────────────

function getLearningForDashboard() {
  const items = getSheetData('Learning');
  items.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

  return items.slice(0, 50).map(l => ({
    id: l.ID,
    topic: l.Topic || '',
    content: l.Content || '',
    source: l.Source || '',
    tags: l.Tags || '',
    timestamp: new Date(l.Timestamp).toISOString()
  }));
}

function createLearningFromDashboard(data) {
  const learnId = generateId('LRN');
  appendRow('Learning', [
    learnId, now(), data.topic || 'general',
    data.content, data.source || 'dashboard', data.tags || ''
  ]);
  return { success: true, id: learnId };
}

// ─── Search API ─────────────────────────────────────────────────

function searchAllForDashboard(query) {
  const q = query.toLowerCase();
  const results = [];

  getSheetData('Tasks').forEach(t => {
    if ((t.Title && t.Title.toLowerCase().includes(q)) ||
        (t.Description && t.Description.toLowerCase().includes(q))) {
      results.push({ type: 'task', id: t.ID, text: t.Title, status: t.Status, priority: t.Priority });
    }
  });

  getSheetData('Ideas').forEach(i => {
    if (i.RawContent && i.RawContent.toLowerCase().includes(q)) {
      results.push({ type: 'idea', id: i.ID, text: truncate(i.RawContent, 80), category: i.Category });
    }
  });

  getSheetData('Learning').forEach(l => {
    if ((l.Content && l.Content.toLowerCase().includes(q)) ||
        (l.Topic && l.Topic.toLowerCase().includes(q))) {
      results.push({ type: 'learning', id: l.ID, text: truncate(l.Content, 80), topic: l.Topic });
    }
  });

  getSheetData('Inbox').forEach(i => {
    if (i.RawContent && i.RawContent.toLowerCase().includes(q)) {
      results.push({ type: 'inbox', id: i.ID, text: truncate(i.RawContent, 80), category: i.Category });
    }
  });

  return results.slice(0, 30);
}