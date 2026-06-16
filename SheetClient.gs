/**
 * SheetClient.gs
 * The ONLY layer that touches SpreadsheetApp directly.
 * Batched reads (one getValues) and writes (ranged setValues). Header-aware.
 * Reads go through Cache; writes invalidate the snapshot.
 */

const SheetClient = (function () {

  function _sheet(name) {
    const sh = getSpreadsheet().getSheetByName(name);
    if (!sh) throw new Error(`Sheet "${name}" not found`);
    return sh;
  }

  /** All rows of a sheet as objects keyed by header, with _row (1-based sheet row). Cached. */
  function readAll(sheetName) {
    return Cache.snapshot(sheetName, () => {
      const sh = getSpreadsheet().getSheetByName(sheetName);
      if (!sh || sh.getLastRow() < 2) return [];
      const values = sh.getDataRange().getValues();
      const headers = values[0].map(h => String(h).trim());
      const rows = [];
      for (let i = 1; i < values.length; i++) {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = values[i][j]; });
        obj._row = i + 1;
        rows.push(obj);
      }
      return rows;
    });
  }

  function headers(sheetName) {
    const sh = _sheet(sheetName);
    return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  }

  /** Append one row from an ordered values array. Returns the new sheet row number. */
  function appendRow(sheetName, values) {
    const sh = _sheet(sheetName);
    sh.appendRow(values);
    Cache.invalidate(sheetName);
    return sh.getLastRow();
  }

  /** Append many rows in a single write. */
  function appendRows(sheetName, rowsValues) {
    if (!rowsValues.length) return;
    const sh = _sheet(sheetName);
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rowsValues.length, rowsValues[0].length).setValues(rowsValues);
    Cache.invalidate(sheetName);
  }

  /**
   * Update one row in a single ranged write.
   * @param {string} sheetName
   * @param {number} rowNumber 1-based sheet row
   * @param {Object} patch { Header: value }
   * @param {string[]} hdrs cached header list (optional, avoids a read)
   */
  function updateRow(sheetName, rowNumber, patch, hdrs) {
    const sh = _sheet(sheetName);
    const cols = hdrs || headers(sheetName);
    const range = sh.getRange(rowNumber, 1, 1, cols.length);
    const rowVals = range.getValues()[0];
    cols.forEach((h, i) => { if (h in patch) rowVals[i] = patch[h]; });
    range.setValues([rowVals]);
    Cache.invalidate(sheetName);
  }

  function deleteRow(sheetName, rowNumber) {
    _sheet(sheetName).deleteRow(rowNumber);
    Cache.invalidate(sheetName);
  }

  function exists(sheetName) {
    return !!getSpreadsheet().getSheetByName(sheetName);
  }

  return { readAll, headers, appendRow, appendRows, updateRow, deleteRow, exists };
})();
