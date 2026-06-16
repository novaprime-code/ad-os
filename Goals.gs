/**
 * Goals.gs
 * Goal creation, progress tracking, and auto-progress from linked tasks.
 * Sheet: Goals [GoalID, GoalType, Title, Description, Deadline, Progress, Status]
 *
 * Link a task to a goal by adding "goal:GOAL-XXXX" anywhere in /task text.
 */

// ─── Commands ───────────────────────────────────────────────────

/**
 * /goal <text> — create a goal. Gemini extracts type + deadline.
 * e.g. "/goal Finish thesis draft by end of August"
 */
function handleGoalCommand(text) {
  if (!text || !text.trim()) {
    return '🎯 Usage: <code>/goal Finish thesis draft by August 31</code>';
  }

  const goalId = generateId('GOAL');
  let title = truncate(text, 100);
  let goalType = 'personal';
  let deadline = null;

  // AI extraction
  const parsed = parseGoalText(text);
  if (parsed) {
    title = parsed.title || title;
    goalType = parsed.goalType || goalType;
    deadline = parsed.deadline ? new Date(parsed.deadline) : null;
  }

  appendRow('Goals', [goalId, goalType, title, text, deadline, 0, 'active']);

  let msg = `🎯 Goal created!\n\n<b>${escapeHtml(title)}</b>\n`;
  msg += `📂 ${goalType}`;
  if (deadline) msg += ` · ⏳ ${formatDate(deadline, 'date')}`;
  msg += `\n<code>${goalId}</code>\n\n`;
  msg += `Link tasks to it: <code>/task write chapter 1 goal:${goalId}</code>`;
  return msg;
}

/**
 * /goals — list active goals with progress bars and deadline countdowns.
 */
function handleGoalsList() {
  const goals = getSheetData('Goals', { Status: 'active' });
  if (!goals.length) return '🎯 No active goals. Create one: <code>/goal ...</code>';

  // Sort: nearest deadline first, undated last
  goals.sort((a, b) => {
    if (a.Deadline && b.Deadline) return new Date(a.Deadline) - new Date(b.Deadline);
    return a.Deadline ? -1 : 1;
  });

  let msg = `<b>🎯 Active Goals</b>\n\n`;
  goals.forEach(g => {
    const pct = Number(g.Progress) || 0;
    msg += `<b>${escapeHtml(g.Title)}</b>\n`;
    msg += `${progressBar(pct)} ${pct}%`;
    if (g.Deadline) {
      const daysLeft = Math.ceil((new Date(g.Deadline) - new Date()) / 86400000);
      msg += daysLeft >= 0 ? ` · ⏳ ${daysLeft}d left` : ` · ⚠️ ${Math.abs(daysLeft)}d overdue`;
    }
    const linkedOpen = countRows('Tasks', { GoalID: g.GoalID, Status: ['todo', 'in_progress'] });
    if (linkedOpen) msg += ` · 📝 ${linkedOpen} open tasks`;
    msg += `\n<code>${g.GoalID}</code>\n\n`;
  });
  return msg.trim();
}

/**
 * /progress <GOAL-ID> <percent> — manual progress update.
 */
function handleProgressCommand(args) {
  const parts = (args || '').trim().split(/\s+/);
  if (parts.length < 2) {
    return '🎯 Usage: <code>/progress GOAL-XXXX 60</code>';
  }

  const goalId = parts[0].toUpperCase();
  const pct = Math.max(0, Math.min(100, parseInt(parts[1], 10) || 0));

  const goal = findRow('Goals', 'GoalID', goalId);
  if (!goal) return `❌ Goal not found: <code>${escapeHtml(goalId)}</code>`;

  const updates = { 'Progress': pct };
  let msg = `🎯 <b>${escapeHtml(goal.Title)}</b>\n${progressBar(pct)} ${pct}%`;

  if (pct >= 100) {
    updates['Status'] = 'completed';
    addXP(50, `goal completed: ${goal.Title}`);
    msg += `\n\n🏆 <b>GOAL COMPLETED!</b> +50 XP`;
  }

  updateRow('Goals', goal._rowIndex, updates);
  return msg;
}

// ─── Auto-progress from linked tasks ────────────────────────────

/**
 * Recalculate a goal's progress from its linked tasks.
 * Called automatically when a linked task is completed.
 * Manual /progress always wins if it set a higher value.
 */
function updateGoalFromTasks(goalId) {
  if (!goalId) return;
  const goal = findRow('Goals', 'GoalID', goalId);
  if (!goal || goal.Status !== 'active') return;

  const linked = findRows('Tasks', 'GoalID', goalId)
    .filter(t => t.Status !== 'cancelled');
  if (!linked.length) return;

  const done = linked.filter(t => t.Status === 'done').length;
  const autoPct = Math.round(done / linked.length * 100);
  const currentPct = Number(goal.Progress) || 0;

  if (autoPct > currentPct) {
    const updates = { 'Progress': autoPct };
    if (autoPct >= 100) {
      updates['Status'] = 'completed';
      addXP(50, `goal completed: ${goal.Title}`);
      sendTelegram(`🏆 <b>GOAL COMPLETED!</b>\n🎯 ${escapeHtml(goal.Title)}\n+50 XP`);
    }
    updateRow('Goals', goal._rowIndex, updates);
  }
}

/**
 * Extract a "goal:GOAL-XXXX" token from task text.
 * @returns {Object} { goalId: string|'', cleanText: string }
 */
function extractGoalLink(text) {
  const match = (text || '').match(/goal:(GOAL-[A-Z0-9]+)/i);
  if (!match) return { goalId: '', cleanText: text };
  const goalId = match[1].toUpperCase();
  const cleanText = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
  // Verify it exists
  const goal = findRow('Goals', 'GoalID', goalId);
  return { goalId: goal ? goalId : '', cleanText };
}