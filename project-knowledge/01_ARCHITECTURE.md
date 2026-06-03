# Architecture

## System Flow

```
Telegram (User Input)
       ↓
   Webhook (HTTPS POST)
       ↓
   Code.gs → Router
       ↓
   Command Handler (Tasks.gs / Inbox.gs / Ideas.gs / Review.gs)
       ↓
   Sheets.gs (Read/Write Google Sheets)
       ↓
   Gemini.gs (AI Processing — categorize, summarize, plan)
       ↓
   Calendar.gs (Create/Update Google Calendar events)
       ↓
   Telegram.gs (Send response back to user)
```

## Scheduled Flows

```
Scheduler.gs (Time-based triggers)
       ↓
   08:00 → Morning Brief → Gemini → Telegram
   22:00 → Night Review prompt → Telegram
   Sunday 20:00 → Weekly Review → Gemini → Telegram
```

## Component Responsibilities

| File | Role | Talks To |
|------|------|----------|
| Code.gs | Entry point, webhook handler, router | Everything |
| Config.gs | All configuration constants | Read by everything |
| Telegram.gs | Send/receive Telegram messages | Code.gs |
| Sheets.gs | CRUD operations on Google Sheets | Tasks, Inbox, Ideas, Review |
| Calendar.gs | Google Calendar CRUD + free time detection | Tasks.gs, Scheduler.gs |
| Gemini.gs | AI calls (categorize, summarize, plan) | Tasks, Inbox, Review |
| Tasks.gs | Task creation, completion, scheduling | Sheets, Calendar, Gemini |
| Inbox.gs | Inbox capture and processing | Sheets, Gemini |
| Ideas.gs | Idea storage and retrieval | Sheets, Gemini |
| Review.gs | Daily/weekly review generation | Sheets, Calendar, Gemini |
| Scheduler.gs | Time-based trigger management | Review, Telegram |
| Utils.gs | ID generation, date formatting, helpers | Everyone |
| Settings.html | Web-based configuration UI | Config.gs (via server calls) |
| Setup.gs | First-time setup: create sheets, set triggers | Sheets, Scheduler |

## Key Design Decisions

1. **Apps Script as backend** — Free, always-on, direct Google API access, no server management
2. **Google Sheets as database** — Free, inspectable, editable, no migrations needed
3. **Telegram as UI** — Zero friction, always in pocket, supports commands and inline keyboards
4. **Gemini as AI** — Free tier, Google-native, good enough for categorization/summarization
5. **Google Calendar as scheduler** — Already used for university, visual time blocking
6. **Settings.html via HtmlService** — One web page for configuration, served by Apps Script doGet()

## Apps Script Limits to Know

- Execution time: 6 minutes per run
- URL Fetch calls: 20,000/day
- Triggers: 20 per project
- Spreadsheet cells: 10 million per spreadsheet
- These limits are MORE than enough for a personal system
