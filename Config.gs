/**
 * Config.gs
 * Reads configuration from the Settings sheet.
 * All other files call getConfig('KEY') to access settings.
 * Settings are cached per execution to avoid repeated sheet reads.
 */

let _configCache = null;

/**
 * Get a config value by key from the Settings sheet.
 * @param {string} key - The setting key name
 * @param {string} [fallback] - Default value if key not found
 * @returns {string} The setting value
 */
function getConfig(key, fallback = '') {
  if (!_configCache) {
    _loadConfigCache();
  }
  return _configCache[key] !== undefined ? _configCache[key] : fallback;
}

/**
 * Get a config value as a number.
 */
function getConfigNumber(key, fallback = 0) {
  const val = getConfig(key, String(fallback));
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

/**
 * Get a config value as a boolean.
 */
function getConfigBool(key, fallback = false) {
  const val = getConfig(key, String(fallback));
  return val === 'true' || val === '1' || val === 'yes';
}

/**
 * Load all settings into memory cache.
 */
function _loadConfigCache() {
  _configCache = {};
  try {
    const ss = _getSpreadsheet();
    const sheet = ss.getSheetByName('Settings');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][0]).trim();
      const value = String(data[i][1]).trim();
      if (key) {
        _configCache[key] = value;
      }
    }
  } catch (e) {
    console.error('Config load failed:', e.message);
  }
}

/**
 * Update a config value in the Settings sheet.
 * Also updates the cache and the UpdatedAt column.
 */
function setConfig(key, value) {
  try {
    const ss = _getSpreadsheet();
    const sheet = ss.getSheetByName('Settings');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        sheet.getRange(i + 1, 4).setValue(new Date());
        if (_configCache) _configCache[key] = String(value);
        return;
      }
    }
    // Key doesn't exist yet — add it
    sheet.appendRow([key, value, '', new Date()]);
    if (_configCache) _configCache[key] = String(value);
  } catch (e) {
    console.error('Config save failed:', e.message);
  }
}

/**
 * Get the main spreadsheet. Uses SPREADSHEET_ID from script properties
 * as a bootstrap (since we can't read the sheet to get the sheet ID).
 */
function _getSpreadsheet() {
  // First try script property (set during setup)
  const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (propId) {
    return SpreadsheetApp.openById(propId);
  }
  // Fallback: the spreadsheet this script is bound to
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Returns the spreadsheet for use by other modules.
 */
function getSpreadsheet() {
  return _getSpreadsheet();
}
