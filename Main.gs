/**
 * Main.gs  (Phase 2)
 * Entry points ONLY. doGet now serves the SPA shell; doPost unchanged.
 *
 * NOTE: Apps Script doPost(e) cannot read request headers, so the external API
 * authenticates with a `token` in the JSON body (or ?token=), not a Bearer header.
 */

// ─── Web app: serve the SPA ──────────────────────────────────────

function doGet(e) {
  return HtmlService.createTemplateFromFile('App')
    .evaluate()
    .setTitle('LifeOS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Inline a partial (Styles/Scripts) into App.html. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── Inbound webhook + external API ──────────────────────────────

function doPost(e) {
  // External JSON API mode: POST ...?api=1  body {action, payload, token}
  if (e && e.parameter && e.parameter.api === '1') {
    return _handleApiPost(e);
  }

  // Messaging webhook (Telegram/Slack/WhatsApp)
  try {
    const update = JSON.parse(e.postData.contents);
    const provider = Container.messaging();
    const parsed = provider.parseInbound(update);
    if (!parsed) return ContentService.createTextOutput('OK');

    if (provider.isAuthorized && !provider.isAuthorized(parsed.chatId)) {
      log('Main', 'Unauthorized chat', parsed.chatId);
      return ContentService.createTextOutput('OK');
    }

    handleInbound(parsed);
  } catch (err) {
    log('Main', 'doPost error', err.message);
    try { Container.messaging().send(`⚠️ Error: ${escapeHtml(err.message)}`); } catch (e2) {}
  }
  return ContentService.createTextOutput('OK');
}

function _handleApiPost(e) {
  let out;
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const token = body.token || (e.parameter && e.parameter.token);
    if (!token || token !== getConfig('API_TOKEN')) {
      out = fail('UNAUTHORIZED', 'Invalid or missing API token');
    } else {
      out = api(body.action, body.payload, { source: 'api', viaApi: true });
    }
  } catch (err) {
    out = fail('BAD_REQUEST', err.message);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ─── Trigger entry points (wired in later phases) ────────────────
function onMorningBrief() { /* PlanningService.morningBrief() — Phase 4 */ }
function onGermanQuiz() {
  try {
    const added = Container.vocabService().seedNewWords(getConfigNumber('GERMAN_NEW_WORDS_PER_DAY', 15));
    const due = Container.vocabService().due().data;
    if (!due.length) return;
    Container.messaging().send(`☀️ <b>German practice</b>\n${due.length} card(s) due${added ? ` · ${added} new word(s) added` : ''}. Los geht's 🇩🇪`);
    _sendCard(due[0], due.length);
  } catch (e) { log('Vocab', 'daily quiz push failed', e.message); }
}
function onNightReview()  { /* ReviewService.night()  — Phase 5 */ }
function onWeeklyReview() { /* ReviewService.weekly() — Phase 5 */ }