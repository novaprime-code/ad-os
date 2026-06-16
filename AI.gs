/**
 * AI.gs
 * Provider-agnostic AI layer.
 *  - OpenAICompatibleProvider: Groq, OpenRouter, DeepSeek, Grok, OpenAI, Mistral, Ollama
 *  - GeminiProvider: Google AI Studio
 * Switch provider from Settings. Auto-falls back to AI_FALLBACK_* on HTTP 429.
 */

// ─── Provider interface ──────────────────────────────────────────

class AIProvider {
  chat(messages, opts) { throw new Error('not implemented'); }
  json(messages, opts) {
    const raw = this.chat(messages, { ...(opts || {}), temperature: (opts && opts.temperature) ?? 0.2 });
    if (!raw) return null;
    try {
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      log('AI', 'JSON parse failed', { raw: truncate(raw, 200), error: e.message });
      return null;
    }
  }
}

// ─── OpenAI-compatible (covers most vendors) ─────────────────────

class OpenAICompatibleProvider extends AIProvider {
  constructor(cfg) {
    super();
    this.baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');
    this.apiKey = cfg.apiKey;
    this.model = cfg.model;
    this.label = cfg.label || 'openai-compat';
  }

  chat(messages, opts = {}) {
    if (!this.apiKey || !this.baseUrl) { log('AI', `${this.label}: missing key/baseUrl`); return null; }
    if (typeof messages === 'string') messages = [{ role: 'user', content: messages }];

    const resp = UrlFetchApp.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      payload: JSON.stringify({
        model: this.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens || 1024
      }),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code === 429) { const e = new Error('rate_limited'); e.rateLimited = true; throw e; }
    const body = JSON.parse(resp.getContentText() || '{}');
    if (code >= 400 || body.error) {
      log('AI', `${this.label} error`, body.error || code);
      return null;
    }
    return (body.choices?.[0]?.message?.content || '').trim() || null;
  }
}

// ─── Gemini (native format) ──────────────────────────────────────

class GeminiProvider extends AIProvider {
  constructor(cfg) {
    super();
    this.apiKey = cfg.apiKey;
    this.model = cfg.model || 'gemini-2.0-flash';
    this.label = 'gemini';
  }

  chat(messages, opts = {}) {
    if (!this.apiKey) { log('AI', 'gemini: missing key'); return null; }
    const text = typeof messages === 'string'
      ? messages
      : messages.map(m => m.content).join('\n\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { temperature: opts.temperature ?? 0.3, maxOutputTokens: opts.maxTokens || 1024 }
      }),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    if (code === 429) { const e = new Error('rate_limited'); e.rateLimited = true; throw e; }
    const body = JSON.parse(resp.getContentText() || '{}');
    if (body.error) { log('AI', 'gemini error', body.error); return null; }
    return (body.candidates?.[0]?.content?.parts?.[0]?.text || '').trim() || null;
  }
}

// ─── Factory + fallback wrapper ──────────────────────────────────

function _buildProvider(provider, baseUrl, apiKey, model, label) {
  if (provider === 'gemini') return new GeminiProvider({ apiKey, model, label });
  return new OpenAICompatibleProvider({ baseUrl, apiKey, model, label });
}

/** Build the active AI provider with transparent fallback on 429. */
function buildAI() {
  const primary = _buildProvider(
    getConfig('AI_PROVIDER', 'groq'),
    getConfig('AI_BASE_URL', 'https://api.groq.com/openai/v1'),
    getConfig('AI_API_KEY'),
    getConfig('AI_MODEL', 'llama-3.3-70b-versatile'),
    'primary'
  );

  const fbProvider = getConfig('AI_FALLBACK_PROVIDER');
  const fallback = fbProvider ? _buildProvider(
    fbProvider,
    getConfig('AI_FALLBACK_BASE_URL', 'https://openrouter.ai/api/v1'),
    getConfig('AI_FALLBACK_API_KEY'),
    getConfig('AI_FALLBACK_MODEL', 'openrouter/free'),
    'fallback'
  ) : null;

  const wrap = (method) => (messages, opts) => {
    try {
      return primary[method](messages, opts);
    } catch (e) {
      if (e.rateLimited && fallback) {
        log('AI', 'primary rate-limited, using fallback');
        try { return fallback[method](messages, opts); } catch (e2) { log('AI', 'fallback failed', e2.message); return null; }
      }
      log('AI', 'primary failed', e.message);
      return null;
    }
  };

  return { chat: wrap('chat'), json: wrap('json') };
}

// ─── Prompts (provider-neutral) ──────────────────────────────────

const PROMPT_CATEGORIZE = `You categorize input for a personal productivity system.
Pick EXACTLY one category: task | idea | event | note | learning | vocab | application | health.
Also infer the life domain from this list: {{DOMAINS}}.
Current date: {{DATE}} ({{TZ}}).

Return ONLY valid JSON, no markdown:
{"category":"...","summary":"<=15 words","priority":"high|medium|low","domain":"...","dueDate":"YYYY-MM-DD|null","dueTime":"HH:MM|null","duration":<minutes|null>,"tags":"a,b,c"}

Input: "{{TEXT}}"`;

const PROMPT_PARSE_EVENT = `Extract calendar event details. Current date: {{DATE}} ({{TZ}}).
Text: "{{TEXT}}"
Return ONLY valid JSON:
{"title":"...","startDate":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM|null","category":"class|study|career|personal|health"}`;

// ─── High-level helpers (used by services) ───────────────────────

function aiCategorize(text) {
  const p = PROMPT_CATEGORIZE
    .replace('{{DOMAINS}}', getConfig('DOMAINS', 'personal'))
    .replace('{{DATE}}', todayStr())
    .replace('{{TZ}}', tz())
    .replace('{{TEXT}}', text);
  return Container.ai().json(p, { temperature: getConfigNumber('AI_TEMPERATURE_PARSE', 0.2) });
}

function aiParseEvent(text) {
  const p = PROMPT_PARSE_EVENT
    .replace('{{DATE}}', todayStr())
    .replace('{{TZ}}', tz())
    .replace('{{TEXT}}', text);
  return Container.ai().json(p, { temperature: 0.2 });
}
