# LifeOS — Setup Guide

## Prerequisites

You need:
1. A Google account
2. A Telegram account
3. 30 minutes

That's it. Everything is free.

---

## Step 1: Create Telegram Bot (5 min)

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Choose a name: `LifeOS` (or anything)
4. Choose a username: `lifeos_nova_bot` (must end in `bot`)
5. **Copy the token** — you'll need it. Looks like: `7123456789:AAH_xyz...`
6. Now search for `@userinfobot`, send `/start`
7. **Copy your Chat ID** — a number like `123456789`

---

## Step 2: Get Gemini API Key (3 min)

1. Go to https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Select any Google Cloud project (or create one)
4. **Copy the API key** — starts with `AIza...`

Free tier: 15 requests/minute, 1500/day — more than enough.

---

## Step 3: Create Google Spreadsheet (2 min)

1. Go to https://sheets.google.com
2. Create a new blank spreadsheet
3. Name it `LifeOS_DB`
4. Note the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**THIS_PART_IS_THE_ID**`/edit`

---

## Step 4: Set Up Apps Script (10 min)

1. In your `LifeOS_DB` spreadsheet, go to **Extensions → Apps Script**
2. This opens the Apps Script editor
3. Delete everything in `Code.gs`
4. Create the following files (click `+` → Script or HTML):

### Script files (.gs):
Copy the contents from the provided files into each:
- `Code.gs`
- `Config.gs`
- `Telegram.gs`
- `Sheets.gs`
- `Calendar.gs`
- `Gemini.gs`
- `Tasks.gs`
- `Inbox.gs`
- `Ideas.gs`
- `Review.gs`
- `Scheduler.gs`
- `Utils.gs`
- `Setup.gs`

### HTML file:
- Click `+` → HTML → Name it `Settings` (NOT `Settings.html`, Apps Script adds the extension)
- Paste the contents from `Settings.html`

---

## Step 5: Run Initial Setup (2 min)

1. In the Apps Script editor, select `Setup.gs` from the file list
2. In the function dropdown (top bar), select `setupLifeOS`
3. Click **Run** (▶️)
4. **First time only**: Google will ask for permissions — click "Advanced" → "Go to LifeOS" → "Allow"
5. Wait for the success dialog

This creates all sheets with correct headers and populates default settings.

---

## Step 6: Deploy as Web App (3 min)

1. In Apps Script, click **Deploy → New deployment**
2. Click the gear icon → Select **Web app**
3. Settings:
   - Description: `LifeOS v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. **Copy the Web app URL** — looks like: `https://script.google.com/macros/s/xxx.../exec`

---

## Step 7: Configure via Settings Page (5 min)

1. Open the Web app URL in your browser
2. You'll see the LifeOS Settings page
3. Fill in:
   - Telegram Bot Token
   - Telegram Chat ID
   - Gemini API Key
4. Click **Save All Settings**
5. Click **🔗 Test Telegram** — you should get a message in Telegram!
6. Click **🧠 Test Gemini** — should confirm connection
7. Click **📡 Set Webhook** — connects Telegram to your bot
8. Click **⚡ Install Triggers** — sets up morning/night/weekly reviews

---

## Step 8: Test It! (2 min)

Open Telegram, find your bot, and try:

```
/start
```

Then:
```
/task Buy groceries tomorrow
```

```
/idea Build an app for Nepali students abroad
```

```
/today
```

If everything works, you're done! 🎉

---

## Updating the Deployment

When you change the code later:

1. Apps Script → Deploy → **Manage deployments**
2. Click the pencil icon on your deployment
3. Under "Version", select **New version**
4. Click **Deploy**

**Important**: The URL stays the same, so the Telegram webhook keeps working.

---

## Troubleshooting

### "Bot not responding"
- Check webhook: In Settings page, click "Set Webhook" again
- Make sure Deploy → "Who has access" is "Anyone"
- Check the Apps Script execution log: Executions tab (left sidebar)

### "Permission denied"
- Re-run `setupLifeOS()` and re-authorize permissions
- Make sure all Google services are enabled

### "Gemini not working"
- Check API key at https://aistudio.google.com/apikey
- Free tier has a 15 requests/minute limit — wait and retry
- Try changing AI_MODEL to `gemini-1.5-flash` in settings

### "Triggers not firing"
- Check Apps Script → Triggers (clock icon, left sidebar)
- Make sure timezone is correct in Settings
- Triggers can be off by ±15 minutes (Google's limitation)

---

## Google Drive Folder Structure

Create this manually in Google Drive:

```
LifeOS/
├── Documents/
├── Learning/
│   ├── German/
│   ├── University/
│   └── IELTS/
├── Reviews/
├── Exports/
└── Archive/
```

---

## Claude Project Setup

Create a Claude Project called `LifeOS` and add these files as Project Knowledge:

1. `00_PROJECT_VISION.md`
2. `01_ARCHITECTURE.md`
3. `02_DATABASE.md`
4. `03_FEATURE_ROADMAP.md`
5. `04_CODING_CONVENTIONS.md`
6. `05_SETUP_GUIDE.md` (this file)

This way, when you ask Claude to help you extend LifeOS, it already knows the architecture, database schema, and coding conventions.
