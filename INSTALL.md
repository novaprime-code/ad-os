# LifeOS — Phase 0/1 Install

Capture system on the new layered architecture (SheetClient → Repository → Service → Api/Bot).
Text / voice / photo capture → AI categorize → route → confirmation with triage buttons.

## ⚠️ Read first: replace, don't add

Apps Script shares ONE global scope across all files. These files redeclare names
the old files also use (`getConfig`, `_configCache`, `doPost`, classes, consts…).
**Pasting these alongside the old files will fail to load** ("Identifier already declared").

**In the Apps Script editor: delete every existing `.gs` file, then add these 18.**
(This does not affect your running bot until you redeploy.) You can leave or delete the
old `Settings.html` — Phase 0/1 serves a built-in status page instead; the SPA arrives in Phase 2.

> This is the *Apps Script editor*, separate from your *Claude Project knowledge*. Keep the
> old code in the Claude Project as reference until Phase 2+ is deployed, then remove it there too.

## Files (18)

Core: `Utils` `Config` `Cache` `SheetClient` `BaseRepository` `Repositories` `Container`
Providers: `AI` `Messaging` `Voice` (Voice also contains Vision) `Calendar`
Logic: `BaseService` `Services`
Entry: `Api` `Bot` `Main` `Scheduler` `Setup`

## Steps

1. **Sheets**: open your LifeOS spreadsheet → Extensions → Apps Script. Delete old `.gs`, paste these 18.
2. **Run `setupLifeOS()`** once (from the editor, Run menu). Authorize when prompted.
   Creates all 15 sheets + seeds default settings + generates `API_TOKEN`.
3. **Fill keys** in the **Settings** sheet (column B):
   - `AI_API_KEY` → Groq key (free, no card): https://console.groq.com → Keys
   - `AI_FALLBACK_API_KEY` → OpenRouter key (optional but recommended): https://openrouter.ai/keys
   - `TELEGRAM_BOT_TOKEN` → from @BotFather
   - `TELEGRAM_CHAT_ID` → message your bot, then check the value (or temporarily use `/id` after connecting)
   - Verify the free model IDs in each console — free model names drift; update `AI_MODEL` /
     `VOICE_MODEL` / `VISION_MODEL` if a name 404s.
4. **Deploy** → Deploy → New deployment → Web app → Execute as **Me**, Access **Anyone**. Copy the URL.
5. **Run `connectBot()`** once — sets the Telegram webhook to your deployment.
6. **Test in Telegram**: send `/start`, then type "submit report friday", send a 🎙️ voice note,
   send a 🖼️ photo. Try the triage buttons under a captured item.

Re-run `connectBot()` after every *new* deployment (the URL can change).

## What works now
Text/voice/photo capture, AI categorize + route, inline triage buttons, `/task` `/tasks`
`/done` `/idea` `/note` `/learn` `/search` `/stats` `/id`, calendar event routing, XP/levels,
the token-authed JSON API (`POST ?api=1`, body `{action,payload,token}`), and the n8n event hook.

## Known limitations (by design, this phase)
- **Config is via the Settings sheet** — the settings UI lands with the SPA in Phase 2.
- **Re-triage doesn't undo the first route**: if AI auto-creates a task and you tap "Idea",
  you get an idea too; the original isn't deleted. Cleanup comes with the SPA inbox view.
- **No scheduled jobs yet** — briefs, reviews, and the German quiz are Phases 4–6, so
  `installTriggers()` intentionally creates none.
- **API auth uses a body `token`**, not a Bearer header — Apps Script can't read request headers.
- `/today /plan /focus /review` reply "later phase" for now.
