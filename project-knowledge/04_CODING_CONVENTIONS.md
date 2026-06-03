# Coding Conventions

## General Rules

- Google Apps Script uses V8 runtime (modern JS, no ES modules)
- No `import`/`export` — all files share global scope
- Use `const` and `let`, never `var`
- Functions that are entry points (doPost, doGet, triggers) go in Code.gs
- Every other file is a namespace of related functions
- Prefix private/helper functions with underscore: `_parseDate()`

## File Responsibilities (Strict)

| File | Does | Does NOT |
|------|------|----------|
| Code.gs | Routing, doPost, doGet, trigger setup | Business logic |
| Config.gs | Read settings from Settings sheet | Write settings (that's Setup.gs) |
| Telegram.gs | Send/receive messages, format responses | Process commands |
| Sheets.gs | Generic CRUD on any sheet | Know about business entities |
| Calendar.gs | Calendar API operations | Task logic |
| Gemini.gs | AI API calls, prompt construction | Sheet operations |
| Tasks.gs | Task business logic | Direct sheet access (uses Sheets.gs) |
| Inbox.gs | Inbox processing logic | Direct sheet access |
| Ideas.gs | Idea storage/retrieval logic | Direct sheet access |
| Review.gs | Review generation logic | Direct sheet access |
| Scheduler.gs | Trigger management, scheduled jobs | Business logic (delegates to Review.gs etc) |
| Utils.gs | ID generation, date parsing, formatting | API calls |
| Setup.gs | First-time setup, sheet creation | Runtime operations |

## Naming Conventions

- Functions: `camelCase` — `createTask()`, `sendTelegramMessage()`
- Constants: `UPPER_SNAKE` — `SHEET_TASKS`, `COL_STATUS`
- Sheet names: PascalCase — `Tasks`, `Inbox`, `Ideas`
- IDs: PREFIX-NNNN — `TSK-0001`, `IDEA-0042`

## Error Handling

- Every external call (Telegram API, Gemini API, Calendar API) wrapped in try-catch
- Errors logged to console AND sent to Telegram as notification
- Never let an error silently fail — the user should know

## Settings Access Pattern

```javascript
// CORRECT — uses Config.gs helper which reads from Settings sheet
const token = getConfig('TELEGRAM_BOT_TOKEN');

// WRONG — hardcoded
const token = '123456:ABC';
```

## Sheet Access Pattern

```javascript
// CORRECT — uses Sheets.gs
const tasks = getSheetData('Tasks');
appendRow('Tasks', [id, now, title, ...]);

// WRONG — direct SpreadsheetApp
const sheet = SpreadsheetApp.openById(id).getSheetByName('Tasks');
```

## Telegram Response Formatting

- Use simple text formatting (Telegram MarkdownV2 or HTML)
- Keep responses SHORT — max 5-7 lines for confirmations
- Use emojis sparingly but consistently:
  - ✅ = done/success
  - 📝 = task/note
  - 💡 = idea
  - 📅 = calendar/schedule
  - ⚡ = high priority
  - 🔍 = search
  - 📊 = review/stats

## Google Calendar Convention

- Use separate calendar IDs from Settings for different categories
- Default to 'primary' if specific calendar not configured
- Event descriptions include LifeOS metadata: `[LifeOS:TSK-0042]`

## Gemini Prompt Convention

- System prompts stored as constants in Gemini.gs
- Always include timezone and current date in prompts
- Output format always specified (JSON preferred for structured data)
- Temperature: 0.3 for categorization, 0.7 for creative planning
