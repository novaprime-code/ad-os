/**
 * Repositories.gs
 * Entity repositories + their schemas. Schemas MUST match the sheet headers
 * exactly (see 02_DATABASE.md). Add columns only at the end.
 */

// ─── Schemas (ordered header lists) ──────────────────────────────

const SCHEMA = {
  Inbox:        ['ID', 'Timestamp', 'Source', 'RawContent', 'AI_Summary', 'Category', 'Priority', 'Domain', 'Status', 'RoutedID'],
  Tasks:        ['ID', 'CreatedAt', 'Title', 'Description', 'Priority', 'Energy', 'Duration', 'DueDate', 'Status', 'Domain', 'ProjectID', 'GoalID', 'ParentTaskID', 'DependsOn', 'Recurrence', 'RecurrenceConfig', 'WaitingOn', 'CalendarEventID', 'CompletedAt'],
  Projects:     ['ID', 'Name', 'Domain', 'Description', 'Status', 'Color', 'CreatedAt'],
  Events:       ['ID', 'Title', 'StartTime', 'EndTime', 'CalendarID', 'Category', 'Domain', 'Status'],
  Goals:        ['GoalID', 'GoalType', 'Title', 'Description', 'Deadline', 'Progress', 'Domain', 'Status'],
  Habits:       ['ID', 'Name', 'Frequency', 'TimeOfDay', 'Streak', 'TotalDone', 'LastDone', 'Domain', 'Status'],
  Ideas:        ['ID', 'Timestamp', 'RawContent', 'AI_Summary', 'Category', 'Domain', 'Tags', 'Score', 'ProjectID', 'Status'],
  Learning:     ['ID', 'Timestamp', 'Topic', 'Content', 'Source', 'Domain', 'Tags'],
  Vocab:        ['ID', 'CreatedAt', 'Term', 'Translation', 'Example', 'Level', 'EaseFactor', 'Interval', 'Repetitions', 'DueDate', 'LastReviewed', 'Status'],
  Applications: ['ID', 'CreatedAt', 'Company', 'Role', 'Type', 'Status', 'AppliedDate', 'Deadline', 'Link', 'NextAction', 'NextActionDate', 'Notes'],
  Health:       ['ID', 'Date', 'Weight', 'SleepHours', 'Water', 'Food', 'Hairfall', 'Mood', 'Notes'],
  Sessions:     ['ID', 'TaskID', 'StartTime', 'EndTime', 'Type', 'Minutes', 'Completed', 'Domain'],
  Reviews:      ['ID', 'Date', 'Type', 'TasksCompleted', 'TasksPlanned', 'CompletionRate', 'AI_Summary', 'Mood', 'Notes', 'FocusMinutes'],
  Stats:        ['Key', 'Value', 'UpdatedAt'],
  Settings:     ['Key', 'Value', 'Description', 'UpdatedAt']
};

// ─── Entity repositories ─────────────────────────────────────────

class InboxRepository extends BaseRepository {
  constructor() { super('Inbox', SCHEMA.Inbox, 'INB'); }
  unprocessed() { return this.where(r => r.Status === 'new'); }
}

class TaskRepository extends BaseRepository {
  constructor() { super('Tasks', SCHEMA.Tasks, 'TSK'); }
  open() { return this.where(t => t.Status === 'todo' || t.Status === 'in_progress'); }
  waiting() { return this.where(t => t.Status === 'waiting'); }
  byDomain(d) { return this.filterBy('Domain', d); }
}

class ProjectRepository extends BaseRepository {
  constructor() { super('Projects', SCHEMA.Projects, 'PRJ'); }
  active() { return this.filterBy('Status', 'active'); }
}

class EventRepository extends BaseRepository {
  constructor() { super('Events', SCHEMA.Events, 'EVT'); }
}

class GoalRepository extends BaseRepository {
  constructor() { super('Goals', SCHEMA.Goals, 'GOAL', 'GoalID'); }
  active() { return this.filterBy('Status', 'active'); }
}

class HabitRepository extends BaseRepository {
  constructor() { super('Habits', SCHEMA.Habits, 'HAB'); }
  active() { return this.filterBy('Status', 'active'); }
}

class IdeaRepository extends BaseRepository {
  constructor() { super('Ideas', SCHEMA.Ideas, 'IDEA'); }
}

class LearningRepository extends BaseRepository {
  constructor() { super('Learning', SCHEMA.Learning, 'LRN'); }
}

class VocabRepository extends BaseRepository {
  constructor() { super('Vocab', SCHEMA.Vocab, 'VOC'); }
  due() {
    const end = getEndOfToday();
    return this.where(v => v.Status !== 'suspended' && toDate(v.DueDate) && toDate(v.DueDate) <= end);
  }
}

class ApplicationRepository extends BaseRepository {
  constructor() { super('Applications', SCHEMA.Applications, 'APP'); }
}

class HealthRepository extends BaseRepository {
  constructor() { super('Health', SCHEMA.Health, 'HLT'); }
  forDate(dateStr) { return this.findBy('Date', dateStr); }
}

class SessionRepository extends BaseRepository {
  constructor() { super('Sessions', SCHEMA.Sessions, 'SES'); }
}

class ReviewRepository extends BaseRepository {
  constructor() { super('Reviews', SCHEMA.Reviews, 'REV'); }
}

class StatsRepository extends BaseRepository {
  constructor() { super('Stats', SCHEMA.Stats, 'STAT', 'Key'); }
  get(key, fallback = 0) {
    const r = this.find(key);
    return r ? r.Value : fallback;
  }
  set(key, value) {
    return this.find(key)
      ? this.update(key, { Value: value, UpdatedAt: new Date() })
      : this.create({ Key: key, Value: value, UpdatedAt: new Date() });
  }
}
