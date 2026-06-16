/**
 * Calendar.gs
 * Thin Google Calendar helpers used by the event-routing path.
 * Maps a category to a configured calendar; embeds [LifeOS:ID] for round-tripping.
 */

function getCalendarId(category) {
  const map = {
    class: 'CALENDAR_ID_CLASSES', study: 'CALENDAR_ID_STUDY',
    career: 'CALENDAR_ID_CAREER', personal: 'CALENDAR_ID_PERSONAL',
    health: 'CALENDAR_ID_HEALTH'
  };
  return getConfig(map[category] || 'CALENDAR_ID_PERSONAL', 'primary');
}

function _calendarFor(category) {
  const id = getCalendarId(category);
  if (id === 'primary') return CalendarApp.getDefaultCalendar();
  const c = CalendarApp.getCalendarById(id);
  return c || CalendarApp.getDefaultCalendar();
}

/** Create a calendar event. Returns the Google event id, or null. */
function createCalendarEvent({ title, startTime, endTime, category, description }) {
  try {
    const cal = _calendarFor(category);
    const ev = cal.createEvent(title, new Date(startTime), new Date(endTime), { description: description || '' });
    return ev.getId();
  } catch (e) { log('Calendar', 'create failed', e.message); return null; }
}

/** Today's events across the configured calendars (for briefs/Today view). */
function getTodayEvents() {
  const start = getStartOfToday(), end = getEndOfToday();
  const ids = ['CALENDAR_ID_CLASSES', 'CALENDAR_ID_STUDY', 'CALENDAR_ID_CAREER', 'CALENDAR_ID_PERSONAL', 'CALENDAR_ID_HEALTH'];
  const seen = {}, out = [];
  ids.forEach(k => {
    const id = getConfig(k, 'primary');
    if (seen[id]) return; seen[id] = true;
    try {
      const cal = id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
      if (!cal) return;
      cal.getEvents(start, end).forEach(e => out.push({
        title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime()
      }));
    } catch (e) { /* skip inaccessible calendar */ }
  });
  return out.sort((a, b) => a.start - b.start);
}
