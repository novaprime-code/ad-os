/**
 * Scheduler.gs
 * Manages time-based triggers for automated reviews and briefs.
 */

/**
 * Install all scheduled triggers.
 * Call this once from Setup or from the Settings page.
 */
function installTriggers() {
  // Remove existing LifeOS triggers first
  removeTriggers();

  const tz = getConfig('TIMEZONE', 'Europe/Berlin');

  // Morning Brief
  const morningHour = getConfigNumber('MORNING_BRIEF_HOUR', 8);
  const morningMin = getConfigNumber('MORNING_BRIEF_MINUTE', 0);
  ScriptApp.newTrigger('triggerMorningBrief')
    .timeBased()
    .atHour(morningHour)
    .nearMinute(morningMin)
    .everyDays(1)
    .inTimezone(tz)
    .create();

  // Night Review
  const nightHour = getConfigNumber('NIGHT_REVIEW_HOUR', 22);
  const nightMin = getConfigNumber('NIGHT_REVIEW_MINUTE', 0);
  ScriptApp.newTrigger('triggerNightReview')
    .timeBased()
    .atHour(nightHour)
    .nearMinute(nightMin)
    .everyDays(1)
    .inTimezone(tz)
    .create();

  // Weekly Review
  const weeklyDay = getConfigNumber('WEEKLY_REVIEW_DAY', 0); // 0 = Sunday
  const weeklyHour = getConfigNumber('WEEKLY_REVIEW_HOUR', 20);
  ScriptApp.newTrigger('triggerWeeklyReview')
    .timeBased()
    .onWeekDay(_getScriptDay(weeklyDay))
    .atHour(weeklyHour)
    .nearMinute(0)
    .inTimezone(tz)
    .create();

  log('Scheduler', 'Triggers installed', {
    morning: `${morningHour}:${String(morningMin).padStart(2, '0')}`,
    night: `${nightHour}:${String(nightMin).padStart(2, '0')}`,
    weekly: `Day ${weeklyDay} at ${weeklyHour}:00`
  });

  return `✅ Triggers installed:\n` +
    `☀️ Morning Brief: ${morningHour}:${String(morningMin).padStart(2, '0')}\n` +
    `🌙 Night Review: ${nightHour}:${String(nightMin).padStart(2, '0')}\n` +
    `📊 Weekly Review: ${_dayName(weeklyDay)} ${weeklyHour}:00`;
}

/**
 * Remove all LifeOS triggers.
 */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const lifeOsTriggers = ['triggerMorningBrief', 'triggerNightReview', 'triggerWeeklyReview'];

  triggers.forEach(trigger => {
    if (lifeOsTriggers.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  log('Scheduler', 'Triggers removed');
}

/**
 * List current triggers.
 */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) return 'No triggers installed.';

  return triggers.map(t =>
    `${t.getHandlerFunction()} — ${t.getTriggerSource()}`
  ).join('\n');
}

// ─── Trigger Handler Functions ──────────────────────────────────
// These are called by the time-based triggers.

function triggerMorningBrief() {
  try {
    sendMorningBrief();
  } catch (e) {
    log('Scheduler', 'Morning brief failed', e.message);
    sendTelegram(`⚠️ Morning brief generation failed: ${e.message}`);
  }
}

function triggerNightReview() {
  try {
    sendNightReview();
  } catch (e) {
    log('Scheduler', 'Night review failed', e.message);
    sendTelegram(`⚠️ Night review generation failed: ${e.message}`);
  }
}

function triggerWeeklyReview() {
  try {
    sendWeeklyReview();
  } catch (e) {
    log('Scheduler', 'Weekly review failed', e.message);
    sendTelegram(`⚠️ Weekly review generation failed: ${e.message}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Convert 0-6 (Sun-Sat) to ScriptApp.WeekDay.
 */
function _getScriptDay(dayNum) {
  const days = [
    ScriptApp.WeekDay.SUNDAY,
    ScriptApp.WeekDay.MONDAY,
    ScriptApp.WeekDay.TUESDAY,
    ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY,
    ScriptApp.WeekDay.FRIDAY,
    ScriptApp.WeekDay.SATURDAY
  ];
  return days[dayNum] || ScriptApp.WeekDay.SUNDAY;
}

function _dayName(dayNum) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayNum] || 'Sunday';
}
