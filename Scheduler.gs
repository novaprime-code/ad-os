/**
 * Scheduler.gs
 * Trigger management + webhook connection helpers.
 * Phase 0/1 has no scheduled features yet; this clears stale triggers and exposes
 * connectBot() to set the messaging webhook. Time triggers are added in Phases 4–6.
 */

/** Remove all project triggers (clean slate). */
function _clearTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
}

/**
 * Install scheduled triggers. In later phases this attaches:
 *   onMorningBrief @ MORNING_BRIEF_HOUR, onGermanQuiz @ GERMAN_QUIZ_HOUR,
 *   onNightReview @ NIGHT_REVIEW_HOUR, onWeeklyReview @ WEEKLY_REVIEW_DAY/HOUR.
 */
function installTriggers() {
  _clearTriggers();
  // No time-based features in Phase 0/1 — capture is event-driven via the webhook.
  return 'Triggers cleared. No scheduled jobs in this phase (briefs/reviews/quiz arrive in Phases 4–6).';
}

/** Set the messaging webhook to this deployment's URL. Run after each new deploy. */
function connectBot() {
  const url = getWebAppUrl();
  const r = Container.messaging().setWebhook(url);
  log('Scheduler', 'setWebhook', r);
  return r;
}

/** Remove the messaging webhook (debugging). */
function disconnectBot() {
  const p = Container.messaging();
  if (p instanceof TelegramProvider) {
    return JSON.parse(UrlFetchApp.fetch(`https://api.telegram.org/bot${getConfig('TELEGRAM_BOT_TOKEN')}/deleteWebhook`, { method: 'post', muteHttpExceptions: true }).getContentText());
  }
  return { ok: true, note: 'Remove the webhook in the provider dashboard.' };
}
