/**
 * Habits.gs
 * Habit creation, completion, streak tracking, and reminders.
 * Sheet: Habits [ID, Name, Frequency, TimeOfDay, Streak, TotalDone, LastDone, Status]
 */

const HABIT_FREQUENCIES = ['daily', 'weekdays', 'weekly'];
const HABIT_TIMES = ['morning', 'afternoon', 'evening', 'anytime'];

// ─── Commands ───────────────────────────────────────────────────

/**
 * /habit <name> [frequency] [time]
 * e.g. "/habit Meditate daily morning", "/habit German practice weekdays"
 */
function handleHabitCommand(text) {
  if (!text || !text.trim()) {
    return '🔁 Usage: <code>/habit Meditate daily morning</code>\n' +
      'Frequencies: daily, weekdays, weekly\n' +
      'Times: morning, afternoon, evening, anytime';
  }

  let frequency = 'daily';
  let timeOfDay = 'anytime';
  const nameWords = [];

  text.trim().split(/\s+/).forEach(word => {
    const w = word.toLowerCase();
    if (HABIT_FREQUENCIES.includes(w)) frequency = w;
    else if (HABIT_TIMES.includes(w)) timeOfDay = w;
    else nameWords.push(word);
  });

  const name = nameWords.join(' ');
  if (!name) return '🔁 Habit needs a name. e.g. <code>/habit Meditate daily</code>';

  // Prevent duplicates
  const existing = getSheetData('Habits').find(h =>
    h.Name && h.Name.toLowerCase() === name.toLowerCase() && h.Status === 'active'
  );
  if (existing) {
    return `🔁 Habit already exists: <b>${escapeHtml(existing.Name)}</b> <code>${existing.ID}</code>`;
  }

  const id = generateId('HAB');
  appendRow('Habits', [id, name, frequency, timeOfDay, 0, 0, '', 'active']);

  return `🔁 Habit created!\n\n<b>${escapeHtml(name)}</b>\n` +
    `📆 ${frequency} · 🕐 ${timeOfDay}\n<code>${id}</code>\n\n` +
    `Mark it done with <code>/did ${name.split(' ')[0].toLowerCase()}</code>`;
}

/**
 * /habits — show today's habits with one-tap done buttons.
 * Sends directly (uses buttons), returns null.
 */
function handleHabitsList() {
  const habits = getSheetData('Habits', { Status: 'active' });
  if (!habits.length) {
    sendTelegram('🔁 No habits yet. Create one: <code>/habit Meditate daily</code>');
    return null;
  }

  const dueToday = habits.filter(h => isHabitDueToday(h));
  const doneToday = dueToday.filter(h => _habitDoneToday(h));
  const pending = dueToday.filter(h => !_habitDoneToday(h));

  let msg = `<b>🔁 Today's Habits</b> (${doneToday.length}/${dueToday.length} done)\n\n`;

  doneToday.forEach(h => {
    msg += `✅ <b>${escapeHtml(h.Name)}</b> 🔥${h.Streak}\n`;
  });
  pending.forEach(h => {
    msg += `⬜ <b>${escapeHtml(h.Name)}</b> 🔥${h.Streak} · ${h.TimeOfDay}\n`;
  });

  const notDue = habits.filter(h => !isHabitDueToday(h));
  if (notDue.length) {
    msg += `\n<i>Not due today: ${notDue.map(h => escapeHtml(h.Name)).join(', ')}</i>`;
  }

  if (pending.length) {
    const buttons = pending.slice(0, 6).map(h =>
      [{ text: `✅ ${truncate(h.Name, 25)}`, callback_data: `did:${h.ID}` }]
    );
    sendTelegramWithButtons(msg, buttons);
  } else {
    msg += dueToday.length ? '\n\n🎉 All done for today!' : '';
    sendTelegram(msg);
  }
  return null;
}

/**
 * /did <habit name or ID> — mark a habit done (fuzzy name match).
 */
function handleDidCommand(text) {
  if (!text || !text.trim()) {
    return '✅ Usage: <code>/did meditate</code> or <code>/did HAB-XXXX</code>';
  }

  const q = text.trim().toLowerCase();
  const habits = getSheetData('Habits', { Status: 'active' });

  let habit = habits.find(h => String(h.ID).toLowerCase() === q);
  if (!habit) habit = habits.find(h => h.Name && h.Name.toLowerCase() === q);
  if (!habit) habit = habits.find(h => h.Name && h.Name.toLowerCase().includes(q));

  if (!habit) {
    return `❌ No habit matching "<i>${escapeHtml(text)}</i>".\nSee them with /habits`;
  }

  return completeHabit(habit);
}

/**
 * /streaks — show all current streaks.
 */
function handleStreaksCommand() {
  const habits = getSheetData('Habits', { Status: 'active' });
  if (!habits.length) return '🔥 No habits to streak yet. <code>/habit</code> to start one.';

  habits.sort((a, b) => (Number(b.Streak) || 0) - (Number(a.Streak) || 0));

  let msg = `<b>🔥 Streaks</b>\n\n`;
  habits.forEach(h => {
    const streak = Number(h.Streak) || 0;
    const flame = streak >= 30 ? '🔥🔥🔥' : streak >= 7 ? '🔥🔥' : streak >= 1 ? '🔥' : '·';
    msg += `${flame} <b>${escapeHtml(h.Name)}</b> — ${streak} day${streak === 1 ? '' : 's'} (total: ${h.TotalDone || 0})\n`;
  });
  return msg;
}

// ─── Core logic ─────────────────────────────────────────────────

/**
 * Mark a habit complete for today: streak math, XP, milestones.
 * @param {Object} habit - Row object from Habits sheet
 * @returns {string} Confirmation message
 */
function completeHabit(habit) {
  if (_habitDoneToday(habit)) {
    return `Already done today: <b>${escapeHtml(habit.Name)}</b> 🔥${habit.Streak}`;
  }

  const today = getStartOfToday();
  const last = habit.LastDone ? new Date(habit.LastDone) : null;
  let streak = Number(habit.Streak) || 0;

  if (last) {
    const gapDays = Math.round((today - _dateOnly(last)) / 86400000);
    const allowedGap = _allowedStreakGap(habit.Frequency, today);
    streak = (gapDays <= allowedGap) ? streak + 1 : 1;
  } else {
    streak = 1;
  }

  const totalDone = (Number(habit.TotalDone) || 0) + 1;

  updateRow('Habits', habit._rowIndex, {
    'Streak': streak,
    'TotalDone': totalDone,
    'LastDone': today
  });

  // XP + milestones
  incrementStat('HABITS_COMPLETED');
  let xpPoints = 5;
  let milestone = '';
  if (streak === 7) { xpPoints += 20; milestone = '\n🏅 <b>7-day streak!</b> +20 bonus XP'; }
  if (streak === 30) { xpPoints += 100; milestone = '\n🏆 <b>30-DAY STREAK!</b> +100 bonus XP'; }
  if (streak === 100) { xpPoints += 500; milestone = '\n👑 <b>100-DAY STREAK!!</b> +500 bonus XP'; }
  addXP(xpPoints, `habit: ${habit.Name}`);

  return `✅ <b>${escapeHtml(habit.Name)}</b> done!\n🔥 Streak: <b>${streak}</b> · +${xpPoints} XP${milestone}`;
}

/**
 * Is this habit due today, based on its frequency?
 */
function isHabitDueToday(habit) {
  const day = getStartOfToday().getDay(); // 0=Sun
  switch (String(habit.Frequency).toLowerCase()) {
    case 'weekdays':
      return day >= 1 && day <= 5;
    case 'weekly': {
      // Due if not yet done in the last 7 days
      if (!habit.LastDone) return true;
      const gap = Math.round((getStartOfToday() - _dateOnly(new Date(habit.LastDone))) / 86400000);
      return gap >= 7;
    }
    case 'daily':
    default:
      return true;
  }
}

/**
 * Habit reminder (called by evening trigger): list undone habits with buttons.
 */
function sendHabitReminder() {
  const habits = getSheetData('Habits', { Status: 'active' })
    .filter(h => isHabitDueToday(h) && !_habitDoneToday(h));

  if (!habits.length) return; // Nothing to nag about — stay silent

  let msg = `<b>🔔 Habit check-in</b>\n\nStill open today:\n`;
  habits.forEach(h => {
    msg += `⬜ <b>${escapeHtml(h.Name)}</b> 🔥${h.Streak}\n`;
  });
  msg += `\nOne tap to keep the streak alive 👇`;

  const buttons = habits.slice(0, 6).map(h =>
    [{ text: `✅ ${truncate(h.Name, 25)}`, callback_data: `did:${h.ID}` }]
  );
  sendTelegramWithButtons(msg, buttons);
}

// ─── Private helpers ────────────────────────────────────────────

function _habitDoneToday(habit) {
  if (!habit.LastDone) return false;
  return _dateOnly(new Date(habit.LastDone)).getTime() === getStartOfToday().getTime();
}

function _dateOnly(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Max day-gap that still continues a streak.
 * daily: 1 · weekdays: 3 (Fri → Mon) · weekly: 8
 */
function _allowedStreakGap(frequency, today) {
  switch (String(frequency).toLowerCase()) {
    case 'weekdays':
      return (today.getDay() === 1) ? 3 : 1; // Monday can follow Friday
    case 'weekly':
      return 8;
    default:
      return 1;
  }
}