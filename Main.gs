/**
 * Main.gs
 * Entry points ONLY. No business logic — delegates to Bot / Api.
 *
 * NOTE: Apps Script doPost(e) cannot read request headers, so the n8n/external API
 * authenticates with a `token` in the JSON body (or ?token= query), not a Bearer header.
 */

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

// ─── Web app (status page in Phase 0/1; SPA arrives in Phase 2) ──

function doGet(e) {
  const name = getConfig('USER_NAME', 'there');
  const url = getWebAppUrl();
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LifeOS</title>
  <style>
    :root{color-scheme:dark}
    body{font-family:-apple-system,system-ui,sans-serif;background:#0f1117;color:#e6e8ee;margin:0;padding:28px;line-height:1.5}
    .card{max-width:560px;margin:0 auto;background:#171a23;border:1px solid #262a36;border-radius:16px;padding:24px}
    h1{margin:0 0 4px;font-size:22px}.muted{color:#8b90a0;font-size:14px}
    .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #20242f;font-size:14px}
    .ok{color:#6ee7a8}.bad{color:#ff8b8b}
    code{background:#0f1117;border:1px solid #262a36;border-radius:6px;padding:2px 6px;font-size:12px;word-break:break-all}
  </style></head><body><div class="card">
    <h1>🚀 LifeOS</h1>
    <p class="muted">Phase 0/1 — capture system is live. The full dashboard SPA ships in Phase 2.</p>
    <div class="row"><span>Spreadsheet</span><span class="${SheetClient.exists('Settings') ? 'ok' : 'bad'}">${SheetClient.exists('Settings') ? 'connected' : 'missing — run setupLifeOS'}</span></div>
    <div class="row"><span>Messaging</span><span>${escapeHtml(getConfig('MSG_PROVIDER', 'telegram'))}</span></div>
    <div class="row"><span>AI provider</span><span>${escapeHtml(getConfig('AI_PROVIDER', 'groq'))} · ${escapeHtml(getConfig('AI_MODEL', '—'))}</span></div>
    <p class="muted" style="margin-top:18px">Configure keys in the <b>Settings</b> sheet, then run <code>connectBot()</code> to set the webhook. Web app URL:</p>
    <p><code>${escapeHtml(url)}</code></p>
  </div></body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle('LifeOS').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Trigger entry points (wired in later phases) ────────────────
// Kept as named functions so Scheduler can attach them when those phases land.
function onMorningBrief() { /* PlanningService.morningBrief() — Phase 4 */ }
function onGermanQuiz()   { /* VocabService.dueQuiz()       — Phase 6 */ }
function onNightReview()  { /* ReviewService.night()        — Phase 5 */ }
function onWeeklyReview() { /* ReviewService.weekly()       — Phase 5 */ }
