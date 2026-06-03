# Feature Roadmap & Telegram Commands

## Phase 1 — Capture System (Weekend 1)

### Commands:
- `/start` — Welcome message + setup check
- `/help` — List all commands
- `/idea <text>` — Save idea to Ideas sheet
- `/task <text>` — Create task (AI extracts title, due date, priority)
- `/note <text>` — Save to Inbox as note
- Any plain text without command → saved to Inbox, AI categorizes

### Behavior:
- Every message hits Inbox first
- Gemini categorizes: task / idea / event / note / learning
- Confirmation sent back to Telegram with category + summary

---

## Phase 2 — Task Management (Weekend 2)

### Commands:
- `/tasks` — Show today's tasks
- `/done <ID>` — Mark task complete
- `/tasks all` — Show all open tasks
- `/tasks high` — Show high priority only

### Behavior:
- Tasks sorted by priority then due date
- Completing a task updates sheet + removes calendar event if exists

---

## Phase 3 — Calendar Integration (Weekend 3)

### Commands:
- `/event <text>` — Create calendar event (AI extracts time, date, title)
- `/today` — Show today's calendar + tasks combined
- `/tomorrow` — Show tomorrow's schedule
- `/free` — Show free time blocks today
- `/schedule <task_id>` — Schedule a task into next free slot

### Behavior:
- Events created in correct sub-calendar based on category
- Free time detection considers all calendars
- Task scheduling finds best slot based on duration + energy

---

## Phase 4 — Daily Planning (Weekend 4)

### Morning Brief (automatic, 08:00):
```
Good morning Jay.

📅 Today's Schedule:
  09:00 - 10:30  CG1 Lecture
  14:00 - 15:30  Study Block

✅ Top 3 Tasks:
  1. [HIGH] Finish CG1 Exercise 3
  2. [MED]  Review ML lecture notes
  3. [LOW]  Reply to Lemvos email

💡 Free time: 3.5 hours

Have a productive day.
```

### Commands:
- `/plan` — Regenerate today's plan
- `/focus` — What should I work on right now? (based on time, energy, priority)

---

## Phase 5 — Night Review (Weekend 5)

### Night Review (automatic, 22:00):
```
Good evening Jay.

Today's Review:
  ✅ Completed: 2/3 tasks
  📅 Events attended: 2
  💡 Ideas captured: 1
  
  Unfinished:
  - Reply to Lemvos email → moved to tomorrow

  How was your day? Reply with a mood:
  😊 Great | 😐 Okay | 😓 Tough
```

### Commands:
- `/review` — Trigger review manually
- `/mood <emoji or word>` — Log mood

---

## Phase 6 — Weekly Review (Weekend 6)

### Weekly Review (automatic, Sunday 20:00):
```
Weekly Review — Week 23

Tasks: 12/18 completed (67%)
Ideas captured: 5
Study hours: 14.5h
Streak: German practice 5/7 days

Top achievement: Completed CG1 assignment
Needs attention: ML lecture notes behind

Next week's priorities:
1. ...
2. ...
3. ...
```

---

## Phase 7 — Learning Hub

### Commands:
- `/learn <text>` — Save knowledge entry
- `/vocab <word>` — Save vocabulary (German/English)
- `/search <query>` — Search across all sheets
- `/quiz` — Get quizzed on recent vocabulary

---

## Phase 8 — Goal System

### Commands:
- `/goal <text>` — Create new goal
- `/goals` — Show active goals with progress
- `/progress <goal_id> <percent>` — Update progress

---

## Phase 9 — Habit Tracking

### Commands:
- `/habit <name>` — Create new habit
- `/habits` — Show today's habits
- `/did <habit_name>` — Mark habit done today
- `/streaks` — Show all streaks

---

## Phase 10 — AI Memory & Search

### Commands:
- `/remember <text>` — Store in knowledge base with AI tagging
- `/recall <query>` — AI-powered search across everything
- `/ask <question>` — Ask AI about your own data

---

## Command Parsing Rules

When parsing commands, Gemini should extract:
- **Task**: title, due date (default: today), priority (default: medium), estimated duration
- **Event**: title, start time, end time (default: +1 hour), category
- **Idea**: content, category, tags

Examples:
```
/task Finish German homework tomorrow 18:00
→ Title: "Finish German homework"
→ DueDate: tomorrow 18:00
→ Priority: medium
→ Duration: 30 min

/task HIGH submit ML assignment by friday
→ Title: "Submit ML assignment"
→ DueDate: Friday
→ Priority: high
→ Duration: 60 min

/event German Class tomorrow 7AM 8:30AM
→ Title: "German Class"
→ Start: tomorrow 07:00
→ End: tomorrow 08:30
→ Category: class

/idea SaaS for construction company project management
→ Content: "SaaS for construction company project management"
→ Category: business
→ Tags: saas, construction, project-management
```
