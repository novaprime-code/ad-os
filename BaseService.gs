/**
 * BaseService.gs
 * Common service behavior: domain-event emission (to n8n) and light validation.
 * Services hold business logic and never touch SpreadsheetApp directly.
 */

class BaseService {
  /** Fire a domain event to n8n if enabled. Best-effort, never throws. */
  emit(event, data) {
    if (!getConfigBool('N8N_ENABLED', false)) return;
    const url = getConfig('N8N_WEBHOOK_URL');
    if (!url) return;
    try {
      UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ event, at: new Date().toISOString(), data }),
        muteHttpExceptions: true
      });
    } catch (e) { log('n8n', 'emit failed', e.message); }
  }

  require(dto, fields) {
    for (const f of fields) {
      if (dto[f] === undefined || dto[f] === null || dto[f] === '') {
        throw new Error(`Missing required field: ${f}`);
      }
    }
  }
}
