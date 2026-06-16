/**
 * Cache.gs
 * Two-tier cache for sheet snapshots.
 *  - Per-execution memory map: full fidelity, primary, free.
 *  - CacheService: cross-execution, JSON, ~100KB/key, TTL.
 * Writes invalidate the affected sheet's key. Date strings are revived on read.
 */

const Cache = (function () {
  const TTL_SECONDS = 300;            // 5 min cross-execution
  const MAX_BYTES = 95000;            // stay under CacheService ~100KB limit
  const mem = {};                     // per-execution memory cache

  function _svc() {
    try { return CacheService.getScriptCache(); } catch (e) { return null; }
  }

  // Revive ISO date strings back into Date objects after JSON parse.
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  function _revive(rows) {
    rows.forEach(r => {
      for (const k in r) {
        if (typeof r[k] === 'string' && ISO.test(r[k])) {
          const d = new Date(r[k]);
          if (!isNaN(d.getTime())) r[k] = d;
        }
      }
    });
    return rows;
  }

  /**
   * Return cached rows for a sheet, or load + cache them via loaderFn().
   * loaderFn must return an array of row objects.
   */
  function snapshot(sheetName, loaderFn) {
    if (mem[sheetName]) return mem[sheetName];

    const svc = _svc();
    if (svc) {
      try {
        const cached = svc.get('snap:' + sheetName);
        if (cached) {
          const rows = _revive(JSON.parse(cached));
          mem[sheetName] = rows;
          return rows;
        }
      } catch (e) { /* fall through to load */ }
    }

    const rows = loaderFn();
    mem[sheetName] = rows;

    if (svc) {
      try {
        const json = JSON.stringify(rows);
        if (json.length <= MAX_BYTES) svc.put('snap:' + sheetName, json, TTL_SECONDS);
      } catch (e) { /* too big or serialization issue — memory cache still serves */ }
    }
    return rows;
  }

  /** Invalidate a sheet's cache after a write. */
  function invalidate(sheetName) {
    delete mem[sheetName];
    const svc = _svc();
    if (svc) { try { svc.remove('snap:' + sheetName); } catch (e) {} }
  }

  function invalidateAll() {
    Object.keys(mem).forEach(k => delete mem[k]);
  }

  return { snapshot, invalidate, invalidateAll };
})();
