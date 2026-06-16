/**
 * BaseRepository.gs
 * Generic, schema-aware data access over a single sheet.
 * No business logic. Reads are cached; writes are batched and invalidate cache.
 */

class BaseRepository {
  /**
   * @param {string} sheetName
   * @param {string[]} schema ordered header names (must match the sheet exactly)
   * @param {string} idPrefix e.g. 'TSK'
   * @param {string} idField  the ID column name (default 'ID')
   */
  constructor(sheetName, schema, idPrefix, idField = 'ID') {
    this.sheetName = sheetName;
    this.schema = schema;
    this.idPrefix = idPrefix;
    this.idField = idField;
  }

  /** All rows as DTOs (cached snapshot). */
  all() {
    return SheetClient.readAll(this.sheetName);
  }

  /** Build an id→row index for O(1) lookups. */
  _index() {
    const idx = {};
    this.all().forEach(r => { idx[r[this.idField]] = r; });
    return idx;
  }

  find(id) {
    return this._index()[id] || null;
  }

  findBy(field, value) {
    return this.all().find(r => String(r[field]) === String(value)) || null;
  }

  filterBy(field, value) {
    return this.all().filter(r => String(r[field]) === String(value));
  }

  where(predicate) {
    return this.all().filter(predicate);
  }

  count(predicate) {
    return predicate ? this.all().filter(predicate).length : this.all().length;
  }

  /** Convert a DTO into an ordered values array following the schema. */
  _toRow(dto) {
    return this.schema.map(h => (dto[h] === undefined || dto[h] === null) ? '' : dto[h]);
  }

  /** Create a record. Auto-generates the ID if missing. Returns the created DTO. */
  create(dto) {
    if (!dto[this.idField]) dto[this.idField] = generateId(this.idPrefix);
    SheetClient.appendRow(this.sheetName, this._toRow(dto));
    return dto;
  }

  /** Bulk create in one write. */
  bulkCreate(dtos) {
    dtos.forEach(d => { if (!d[this.idField]) d[this.idField] = generateId(this.idPrefix); });
    SheetClient.appendRows(this.sheetName, dtos.map(d => this._toRow(d)));
    return dtos;
  }

  /** Patch a record by id. Returns the updated DTO or null. */
  update(id, patch) {
    const rec = this.find(id);
    if (!rec) return null;
    SheetClient.updateRow(this.sheetName, rec._row, patch, this.schema);
    return { ...rec, ...patch };
  }

  /** Soft delete by setting Status (override-able). Hard delete via destroy(). */
  delete(id, statusField = 'Status', statusValue = 'archived') {
    return this.update(id, { [statusField]: statusValue });
  }

  destroy(id) {
    const rec = this.find(id);
    if (!rec) return false;
    SheetClient.deleteRow(this.sheetName, rec._row);
    return true;
  }
}
