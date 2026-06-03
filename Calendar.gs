/**
 * Calendar.gs
 * Google Calendar API operations.
 * Create, read, update events. Detect free time blocks.
 */

/**
 * Get the calendar ID for a given category.
 * Falls back to 'primary' if specific calendar not configured.
 */
function getCalendarId(category) {
  const keyMap = {
    'class': 'CALENDAR_ID_CLASSES',
    'study': 'CALENDAR_ID_STUDY',
    'career': 'CALENDAR_ID_CAREER',
    'personal': 'CALENDAR_ID_PERSONAL',
    'health': 'CALENDAR_ID_HEALTH'
  };
  const key = keyMap[category] || 'CALENDAR_ID_PERSONAL';
  return getConfig(key, 'primary');
}

/**
 * Get all calendar IDs that are configured.
 * Returns unique set for querying across all calendars.
 */
function getAllCalendarIds() {
  const ids = new Set();
  ['CALENDAR_ID_CLASSES', 'CALENDAR_ID_STUDY', 'CALENDAR_ID_CAREER',
   'CALENDAR_ID_PERSONAL', 'CALENDAR_ID_HEALTH'].forEach(key => {
    ids.add(getConfig(key, 'primary'));
  });
  return Array.from(ids);
}

/**
 * Create a calendar event.
 * @param {Object} params
 * @param {string} params.title
 * @param {Date} params.startTime
 * @param {Date} params.endTime
 * @param {string} [params.category='personal']
 * @param {string} [params.description]
 * @returns {string} The created event ID
 */
function createCalendarEvent(params) {
  const calId = getCalendarId(params.category || 'personal');

  try {
    const calendar = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
    const event = calendar.createEvent(
      params.title,
      params.startTime,
      params.endTime,
      { description: params.description || '' }
    );

    log('Calendar', 'Event created', { id: event.getId(), title: params.title });
    return event.getId();

  } catch (e) {
    log('Calendar', 'Create event failed', e.message);
    // Fallback to default calendar
    try {
      const event = CalendarApp.getDefaultCalendar().createEvent(
        params.title,
        params.startTime,
        params.endTime,
        { description: params.description || '' }
      );
      return event.getId();
    } catch (e2) {
      log('Calendar', 'Fallback create also failed', e2.message);
      return null;
    }
  }
}

/**
 * Get events for a specific date range.
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Object[]} Array of event objects
 */
function getCalendarEvents(startDate, endDate) {
  const events = [];
  const calIds = getAllCalendarIds();

  for (const calId of calIds) {
    try {
      const calendar = CalendarApp.getCalendarById(calId) || CalendarApp.getDefaultCalendar();
      const calEvents = calendar.getEvents(startDate, endDate);

      calEvents.forEach(e => {
        events.push({
          id: e.getId(),
          title: e.getTitle(),
          startTime: e.getStartTime(),
          endTime: e.getEndTime(),
          description: e.getDescription(),
          isAllDay: e.isAllDayEvent(),
          calendarId: calId
        });
      });
    } catch (e) {
      log('Calendar', `Failed to read calendar ${calId}`, e.message);
    }
  }

  // Sort by start time
  events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Deduplicate by event ID
  const seen = new Set();
  return events.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

/**
 * Get today's events.
 */
function getTodayEvents() {
  return getCalendarEvents(getStartOfToday(), getEndOfToday());
}

/**
 * Get tomorrow's events.
 */
function getTomorrowEvents() {
  const start = getStartOfToday();
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return getCalendarEvents(start, end);
}

/**
 * Find free time blocks for a given date.
 * @param {Date} [date] - Date to check (default: today)
 * @param {number} [minMinutes=30] - Minimum block size in minutes
 * @returns {Object[]} Array of { start: Date, end: Date, minutes: number }
 */
function getFreeTimeBlocks(date, minMinutes = 30) {
  const start = date ? new Date(date) : getStartOfToday();
  start.setHours(8, 0, 0, 0); // Day starts at 8am
  const end = new Date(start);
  end.setHours(22, 0, 0, 0); // Day ends at 10pm

  const events = getCalendarEvents(start, end).filter(e => !e.isAllDay);
  const freeBlocks = [];

  let cursor = new Date(Math.max(start.getTime(), Date.now())); // Don't show past free time

  for (const event of events) {
    if (event.startTime > cursor) {
      const gap = Math.round((event.startTime - cursor) / 60000);
      if (gap >= minMinutes) {
        freeBlocks.push({
          start: new Date(cursor),
          end: new Date(event.startTime),
          minutes: gap
        });
      }
    }
    if (event.endTime > cursor) {
      cursor = new Date(event.endTime);
    }
  }

  // Check remaining time after last event
  if (cursor < end) {
    const gap = Math.round((end - cursor) / 60000);
    if (gap >= minMinutes) {
      freeBlocks.push({
        start: new Date(cursor),
        end: new Date(end),
        minutes: gap
      });
    }
  }

  return freeBlocks;
}

/**
 * Delete a calendar event by ID.
 */
function deleteCalendarEvent(eventId) {
  try {
    const calIds = getAllCalendarIds();
    for (const calId of calIds) {
      const calendar = CalendarApp.getCalendarById(calId);
      if (!calendar) continue;
      const event = calendar.getEventById(eventId);
      if (event) {
        event.deleteEvent();
        return true;
      }
    }
    // Try default calendar
    const event = CalendarApp.getDefaultCalendar().getEventById(eventId);
    if (event) {
      event.deleteEvent();
      return true;
    }
  } catch (e) {
    log('Calendar', 'Delete event failed', e.message);
  }
  return false;
}

/**
 * Format events list for Telegram display.
 */
function formatEventsForTelegram(events) {
  if (!events.length) return 'No events.';
  return events.map(e => {
    if (e.isAllDay) return `📅 <b>${escapeHtml(e.title)}</b> (all day)`;
    const start = formatDate(e.startTime, 'time');
    const end = formatDate(e.endTime, 'time');
    return `📅 ${start} - ${end}  <b>${escapeHtml(e.title)}</b>`;
  }).join('\n');
}

/**
 * Format free time blocks for Telegram.
 */
function formatFreeTimeForTelegram(blocks) {
  if (!blocks.length) return 'No free time blocks found.';
  return blocks.map(b => {
    const start = formatDate(b.start, 'time');
    const end = formatDate(b.end, 'time');
    return `🟩 ${start} - ${end} (${b.minutes}min)`;
  }).join('\n');
}
