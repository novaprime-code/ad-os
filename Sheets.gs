/**
 * Sheets.gs
 * Generic CRUD operations for Google Sheets.
 * No business logic — just sheet operations.
 */

/**
 * Get all data from a sheet as array of objects (keyed by header row).
 * @param {string} sheetName
 * @param {Object} [filters] - Optional key-value pairs to filter rows
 * @returns {Object[]} Array of row objects
 */
function getSheetData(sheetName, filters = null) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => {
      row[h] = data[i][j];
    });
    row._rowIndex = i + 1; // 1-based sheet row number for updates

    if (filters) {
      let match = true;
      for (const [key, val] of Object.entries(filters)) {
        if (Array.isArray(val)) {
          if (!val.includes(row[key])) { match = false; break; }
        } else {
          if (String(row[key]) !== String(val)) { match = false; break; }
        }
      }
      if (!match) continue;
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Append a row to a sheet.
 * @param {string} sheetName
 * @param {Array} values - Values in column order
 * @returns {number} The row number of the appended row
 */
function appendRow(sheetName, values) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  sheet.appendRow(values);
  return sheet.getLastRow();
}

/**
 * Update a specific cell by row number and column header name.
 * @param {string} sheetName
 * @param {number} rowIndex - 1-based row number
 * @param {string} columnHeader - Column header name
 * @param {*} value - New value
 */
function updateCell(sheetName, rowIndex, columnHeader, value) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.findIndex(h => String(h).trim() === columnHeader);
  if (colIndex === -1) throw new Error(`Column "${columnHeader}" not found in "${sheetName}"`);

  sheet.getRange(rowIndex, colIndex + 1).setValue(value);
}

/**
 * Update multiple columns in a single row.
 * @param {string} sheetName
 * @param {number} rowIndex - 1-based row number
 * @param {Object} updates - { columnHeader: newValue, ... }
 */
function updateRow(sheetName, rowIndex, updates) {
  for (const [col, val] of Object.entries(updates)) {
    updateCell(sheetName, rowIndex, col, val);
  }
}

/**
 * Find a row by a column value (first match).
 * @param {string} sheetName
 * @param {string} columnHeader
 * @param {*} value
 * @returns {Object|null} Row object or null
 */
function findRow(sheetName, columnHeader, value) {
  const rows = getSheetData(sheetName);
  return rows.find(r => String(r[columnHeader]) === String(value)) || null;
}

/**
 * Find multiple rows matching a column value.
 */
function findRows(sheetName, columnHeader, value) {
  const rows = getSheetData(sheetName);
  return rows.filter(r => String(r[columnHeader]) === String(value));
}

/**
 * Delete a row by its row index (1-based).
 */
function deleteRow(sheetName, rowIndex) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  sheet.deleteRow(rowIndex);
}

/**
 * Count rows matching a filter.
 */
function countRows(sheetName, filters = null) {
  return getSheetData(sheetName, filters).length;
}

/**
 * Get the headers of a sheet.
 */
function getHeaders(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
}
