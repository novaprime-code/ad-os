# Google Sheets Database Schema

## Spreadsheet Name: LifeOS_DB

**CRITICAL: DO NOT CHANGE COLUMN NAMES OR ORDER.**
All code references columns by header name via Sheets.gs helper functions.

---

## Sheet: Inbox

Raw capture from Telegram. Everything lands here first before being processed.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (INB-xxxx) |
| B | Timestamp | datetime | When captured |
| C | Source | string | "telegram", "manual", "email" |
| D | RawContent | string | Exact text from user |
| E | AI_Summary | string | Gemini-generated summary |
| F | Category | string | "task", "idea", "event", "note", "learning" |
| G | Priority | string | "high", "medium", "low" |
| H | Status | string | "new", "processed", "archived" |

---

## Sheet: Tasks

Actionable items with tracking.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (TSK-xxxx) |
| B | CreatedAt | datetime | When created |
| C | Title | string | Short task title |
| D | Description | string | Optional details |
| E | Priority | string | "high", "medium", "low" |
| F | Energy | string | "high", "medium", "low" |
| G | Duration | number | Estimated minutes |
| H | DueDate | date | When it's due |
| I | Status | string | "todo", "in_progress", "done", "cancelled" |
| J | GoalID | string | Optional link to Goals sheet |
| K | CalendarEventID | string | Google Calendar event ID if scheduled |
| L | CompletedAt | datetime | When marked done |

---

## Sheet: Events

Calendar events tracked for analytics.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (EVT-xxxx) |
| B | Title | string | Event name |
| C | StartTime | datetime | Start |
| D | EndTime | datetime | End |
| E | CalendarID | string | Which Google Calendar |
| F | Category | string | "class", "study", "career", "personal", "health" |
| G | Status | string | "upcoming", "done", "cancelled" |

---

## Sheet: Goals

Medium and long-term goals.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | GoalID | string | Auto-generated (GOAL-xxxx) |
| B | GoalType | string | "academic", "career", "health", "personal", "financial" |
| C | Title | string | Goal title |
| D | Description | string | Details |
| E | Deadline | date | Target date |
| F | Progress | number | 0-100 percentage |
| G | Status | string | "active", "completed", "paused", "dropped" |

---

## Sheet: Habits

Daily habit tracking.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (HAB-xxxx) |
| B | Name | string | Habit name |
| C | Frequency | string | "daily", "weekdays", "weekly" |
| D | TimeOfDay | string | "morning", "afternoon", "evening", "anytime" |
| E | Streak | number | Current streak count |
| F | TotalDone | number | Lifetime completions |
| G | LastDone | date | Last completion date |
| H | Status | string | "active", "paused" |

---

## Sheet: Ideas

Idea vault. Never delete, only archive.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (IDEA-xxxx) |
| B | Timestamp | datetime | When captured |
| C | RawContent | string | Original text |
| D | AI_Summary | string | Gemini summary |
| E | Category | string | "business", "project", "learning", "life", "other" |
| F | Tags | string | Comma-separated tags |
| G | Score | number | AI-rated potential (1-10) |
| H | Status | string | "new", "exploring", "parked", "archived" |

---

## Sheet: Learning

Knowledge base entries.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (LRN-xxxx) |
| B | Timestamp | datetime | When added |
| C | Topic | string | Subject area |
| D | Content | string | The knowledge/note |
| E | Source | string | Where it came from |
| F | Tags | string | Comma-separated |

---

## Sheet: Reviews

Daily and weekly review logs.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | ID | string | Auto-generated (REV-xxxx) |
| B | Date | date | Review date |
| C | Type | string | "daily", "weekly", "monthly" |
| D | TasksCompleted | number | Count |
| E | TasksPlanned | number | Count |
| F | CompletionRate | number | Percentage |
| G | AI_Summary | string | Gemini-generated review |
| H | Mood | string | Optional self-reported mood |
| I | Notes | string | User's own notes |

---

## Sheet: Settings

Key-value configuration store. The HTML settings page reads/writes here.

| Column | Header | Type | Description |
|--------|--------|------|-------------|
| A | Key | string | Setting name |
| B | Value | string | Setting value |
| C | Description | string | Human-readable description |
| D | UpdatedAt | datetime | Last modified |

### Default Settings Rows:

```
TELEGRAM_BOT_TOKEN | (empty) | Telegram Bot API token from @BotFather
TELEGRAM_CHAT_ID | (empty) | Your Telegram user/chat ID
GEMINI_API_KEY | (empty) | Google AI Studio API key
SPREADSHEET_ID | (empty) | This spreadsheet's ID (auto-filled on setup)
MORNING_BRIEF_HOUR | 8 | Hour for morning brief (0-23)
MORNING_BRIEF_MINUTE | 0 | Minute for morning brief (0-59)
NIGHT_REVIEW_HOUR | 22 | Hour for night review
NIGHT_REVIEW_MINUTE | 0 | Minute for night review
WEEKLY_REVIEW_DAY | 0 | Day for weekly review (0=Sunday, 6=Saturday)
WEEKLY_REVIEW_HOUR | 20 | Hour for weekly review
TIMEZONE | Europe/Berlin | Timezone for all scheduling
DEFAULT_TASK_DURATION | 30 | Default task duration in minutes
DEFAULT_PRIORITY | medium | Default priority for new items
CALENDAR_ID_CLASSES | primary | Calendar ID for classes
CALENDAR_ID_STUDY | primary | Calendar ID for study blocks
CALENDAR_ID_CAREER | primary | Calendar ID for career/work
CALENDAR_ID_PERSONAL | primary | Calendar ID for personal
CALENDAR_ID_HEALTH | primary | Calendar ID for health
AI_MODEL | gemini-2.0-flash | Gemini model to use
AI_CATEGORIZE | true | Auto-categorize inbox items
AI_SUMMARIZE | true | Auto-summarize long inputs
AI_DAILY_PLAN | true | Generate AI daily plans
LANGUAGE | en | Response language (en, de, ne)
```
