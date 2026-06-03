/**
 * Gemini.gs
 * AI layer using Google Gemini API.
 * Handles categorization, summarization, planning, and natural language parsing.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// ─── System Prompts ─────────────────────────────────────────────

const PROMPT_CATEGORIZE = `You are an AI assistant for a personal productivity system.
Categorize the following user input into EXACTLY one of these categories:
- task: something actionable that needs to be done
- idea: a thought, concept, or plan for the future  
- event: a calendar event with a specific time
- note: information to remember, a fact, or observation
- learning: a vocabulary word, concept, or educational content

Also extract:
- summary: a clean, concise version (max 15 words)
- priority: high, medium, or low
- dueDate: if mentioned (ISO format YYYY-MM-DD), or null
- dueTime: if mentioned (HH:MM 24h format), or null
- duration: estimated minutes if it's a task, or null
- tags: relevant comma-separated tags (max 3)

Current date: {{DATE}}
Timezone: {{TIMEZONE}}

Respond ONLY with valid JSON, no markdown, no explanation:
{"category":"...","summary":"...","priority":"...","dueDate":"...","dueTime":"...","duration":null,"tags":"..."}`;

const PROMPT_DAILY_PLAN = `You are a personal AI planner for a university student with ADHD.
Given their calendar events, open tasks, and goals, create a focused daily plan.

Rules:
- Maximum 3 top tasks (ADHD brains get overwhelmed by long lists)
- Consider energy levels: hard tasks in the morning, easy ones after lunch
- Include breaks
- Be encouraging but realistic
- If they have many overdue tasks, don't guilt-trip — just pick the most important 3

Current date: {{DATE}}
Timezone: {{TIMEZONE}}

Calendar events today:
{{EVENTS}}

Open tasks (sorted by priority):
{{TASKS}}

Active goals:
{{GOALS}}

Respond in this format (plain text, not JSON):
Good morning Jay.

📅 Today's Schedule:
[list events with times]

✅ Top 3 Tasks:
1. [task]
2. [task]  
3. [task]

💡 Tip: [one short motivational/practical tip]

Estimated focus time needed: Xh`;

const PROMPT_NIGHT_REVIEW = `You are reviewing a user's day. Be kind, honest, and brief.
Don't guilt-trip about incomplete tasks — just note what moved forward.

Date: {{DATE}}

Tasks completed today:
{{COMPLETED}}

Tasks not completed:
{{INCOMPLETE}}

Ideas captured:
{{IDEAS}}

Calendar events:
{{EVENTS}}

Write a brief evening review (5-7 lines max). End by asking about their mood.`;

const PROMPT_WEEKLY_REVIEW = `You are generating a weekly review for a university student with ADHD.
Be data-driven but encouraging. Celebrate wins, note patterns, suggest adjustments.

Week: {{WEEK_START}} to {{WEEK_END}}

Tasks completed: {{COMPLETED_COUNT}}
Tasks created: {{CREATED_COUNT}}
Completion rate: {{RATE}}%

Ideas captured: {{IDEAS_COUNT}}
Study events: {{STUDY_HOURS}}h

Top completions:
{{TOP_COMPLETIONS}}

Overdue items:
{{OVERDUE}}

Write a concise weekly review. Include 3 priorities for next week.`;

const PROMPT_PARSE_TASK = `Extract task details from this text. Current date: {{DATE}}, timezone: {{TIMEZONE}}.

Text: "{{TEXT}}"

Respond ONLY with valid JSON:
{"title":"...","dueDate":"YYYY-MM-DD or null","dueTime":"HH:MM or null","priority":"high|medium|low","duration":minutes_or_null,"category":"study|career|personal|health|admin"}`;

const PROMPT_PARSE_EVENT = `Extract calendar event details from this text. Current date: {{DATE}}, timezone: {{TIMEZONE}}.

Text: "{{TEXT}}"

Respond ONLY with valid JSON:
{"title":"...","startDate":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","category":"class|study|career|personal|health"}`;


// ─── API Call ───────────────────────────────────────────────────

/**
 * Call Gemini API with a prompt.
 * @param {string} prompt - The full prompt text
 * @param {number} [temperature=0.3] - Creativity level
 * @returns {string} The model's response text
 */
function callGemini(prompt, temperature = 0.3) {
  const apiKey = getConfig('GEMINI_API_KEY');
  const model = getConfig('AI_MODEL', 'gemini-2.0-flash');

  if (!apiKey) {
    log('Gemini', 'No API key configured');
    return null;
  }

  const url = `${GEMINI_API_BASE}${model}:generateContent?key=${apiKey}`;

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: 1024
        }
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    if (result.error) {
      log('Gemini', 'API error', result.error);
      return null;
    }

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;

  } catch (e) {
    log('Gemini', 'Call failed', e.message);
    return null;
  }
}

/**
 * Call Gemini and parse response as JSON.
 * Strips markdown fences if present.
 */
function callGeminiJSON(prompt, temperature = 0.2) {
  const raw = callGemini(prompt, temperature);
  if (!raw) return null;

  try {
    // Strip markdown code fences
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    log('Gemini', 'JSON parse failed', { raw, error: e.message });
    return null;
  }
}


// ─── High-Level Functions ───────────────────────────────────────

/**
 * Categorize and summarize user input.
 */
function categorizeInput(text) {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

  const prompt = PROMPT_CATEGORIZE
    .replace('{{DATE}}', dateStr)
    .replace('{{TIMEZONE}}', tz);

  return callGeminiJSON(prompt + `\n\nUser input: "${text}"`);
}

/**
 * Parse a task from natural language.
 */
function parseTaskText(text) {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

  const prompt = PROMPT_PARSE_TASK
    .replace('{{DATE}}', dateStr)
    .replace('{{TIMEZONE}}', tz)
    .replace('{{TEXT}}', text);

  return callGeminiJSON(prompt);
}

/**
 * Parse an event from natural language.
 */
function parseEventText(text) {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

  const prompt = PROMPT_PARSE_EVENT
    .replace('{{DATE}}', dateStr)
    .replace('{{TIMEZONE}}', tz)
    .replace('{{TEXT}}', text);

  return callGeminiJSON(prompt);
}

/**
 * Generate daily plan.
 */
function generateDailyPlan(events, tasks, goals) {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

  const prompt = PROMPT_DAILY_PLAN
    .replace('{{DATE}}', dateStr)
    .replace('{{TIMEZONE}}', tz)
    .replace('{{EVENTS}}', events || 'No events today.')
    .replace('{{TASKS}}', tasks || 'No open tasks.')
    .replace('{{GOALS}}', goals || 'No active goals.');

  return callGemini(prompt, 0.7);
}

/**
 * Generate night review.
 */
function generateNightReview(completed, incomplete, ideas, events) {
  const tz = getConfig('TIMEZONE', 'Europe/Berlin');
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: tz });

  const prompt = PROMPT_NIGHT_REVIEW
    .replace('{{DATE}}', dateStr)
    .replace('{{COMPLETED}}', completed || 'None')
    .replace('{{INCOMPLETE}}', incomplete || 'None')
    .replace('{{IDEAS}}', ideas || 'None')
    .replace('{{EVENTS}}', events || 'None');

  return callGemini(prompt, 0.7);
}

/**
 * Generate weekly review.
 */
function generateWeeklyReview(stats) {
  const prompt = PROMPT_WEEKLY_REVIEW
    .replace('{{WEEK_START}}', stats.weekStart)
    .replace('{{WEEK_END}}', stats.weekEnd)
    .replace('{{COMPLETED_COUNT}}', stats.completedCount)
    .replace('{{CREATED_COUNT}}', stats.createdCount)
    .replace('{{RATE}}', stats.rate)
    .replace('{{IDEAS_COUNT}}', stats.ideasCount)
    .replace('{{STUDY_HOURS}}', stats.studyHours)
    .replace('{{TOP_COMPLETIONS}}', stats.topCompletions || 'None')
    .replace('{{OVERDUE}}', stats.overdue || 'None');

  return callGemini(prompt, 0.7);
}
