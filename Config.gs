/**
 * Config.gs
 * Reads/writes the Settings sheet. Cached per execution.
 * Bootstrap spreadsheet ID lives in ScriptProperties (set during Setup).
 */

let _configCache = null;

function getConfig(key, fallback = '') {
  if (!_configCache) _loadConfigCache();
  const v = _configCache[key];
  return (v === undefined || v === '') ? fallback : v;
}

function getConfigNumber(key, fallback = 0) {
  const n = Number(getConfig(key, String(fallback)));
  return isNaN(n) ? fallback : n;
}

function getConfigBool(key, fallback = false) {
  const v = getConfig(key, String(fallback));
  return v === 'true' || v === '1' || v === 'yes' || v === true;
}

/** Configured life domains as an array. */
function getDomains() {
  return getConfig('DOMAINS', 'personal').split(',').map(s => s.trim()).filter(Boolean);
}

function _loadConfigCache() {
  _configCache = {};
  try {
    const sheet = getSpreadsheet().getSheetByName('Settings');
    if (!sheet || sheet.getLastRow() < 2) return;
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    data.forEach(([k, v]) => {
      const key = String(k).trim();
      if (key) _configCache[key] = String(v).trim();
    });
  } catch (e) {
    console.error('Config load failed:', e.message);
  }
}

/** Write a single setting (updates cache + UpdatedAt). */
function setConfig(key, value) {
  const sheet = getSpreadsheet().getSheetByName('Settings');
  if (!sheet) return;
  const keys = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) {
      sheet.getRange(i + 2, 2).setValue(value);
      sheet.getRange(i + 2, 4).setValue(new Date());
      if (_configCache) _configCache[key] = String(value);
      return;
    }
  }
  sheet.appendRow([key, value, '', new Date()]);
  if (_configCache) _configCache[key] = String(value);
}

/** Bulk write settings. */
function setConfigs(obj) {
  Object.entries(obj || {}).forEach(([k, v]) => setConfig(k, v));
}

/** Reset the per-execution config cache (call after bulk writes). */
function clearConfigCache() { _configCache = null; }

// ─── Spreadsheet bootstrap ───────────────────────────────────────

function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}
