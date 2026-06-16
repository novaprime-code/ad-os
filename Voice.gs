/**
 * Voice.gs
 * Speech-to-text. Default: Groq Whisper (free tier), OpenAI-compatible multipart.
 */

function transcribeAudio(blob) {
  if (!blob) return null;
  const provider = getConfig('VOICE_PROVIDER', 'groq');
  const apiKey = getConfig('VOICE_API_KEY') || getConfig('AI_API_KEY');
  const model = getConfig('VOICE_MODEL', 'whisper-large-v3');
  if (!apiKey) { log('Voice', 'no API key'); return null; }

  // Endpoint: Groq uses the OpenAI-compatible audio/transcriptions route.
  const base = provider === 'groq'
    ? 'https://api.groq.com/openai/v1'
    : getConfig('AI_BASE_URL', 'https://api.groq.com/openai/v1');

  try {
    const resp = UrlFetchApp.fetch(`${base}/audio/transcriptions`, {
      method: 'post',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: { file: blob, model: model, response_format: 'text' },
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const text = resp.getContentText();
    if (code >= 400) { log('Voice', 'transcription error', text); return null; }
    // response_format=text returns plain text (may be JSON for some providers)
    try { const j = JSON.parse(text); return (j.text || '').trim() || null; }
    catch (e) { return text.trim() || null; }
  } catch (e) { log('Voice', 'transcribe failed', e.message); return null; }
}


/**
 * Vision.gs
 * Image understanding. Default: OpenRouter free vision model (OpenAI-compatible,
 * base64 image content). Used to caption/extract text from photos for capture.
 */

function describeImage(blob, prompt) {
  if (!blob) return null;
  const apiKey = getConfig('VISION_API_KEY') || getConfig('AI_FALLBACK_API_KEY');
  const model = getConfig('VISION_MODEL', 'qwen/qwen-2-vl-7b-instruct:free');
  const base = (getConfig('AI_FALLBACK_BASE_URL', 'https://openrouter.ai/api/v1')).replace(/\/+$/, '');
  if (!apiKey) { log('Vision', 'no API key'); return null; }

  const b64 = Utilities.base64Encode(blob.getBytes());
  const mime = blob.getContentType() || 'image/jpeg';

  try {
    const resp = UrlFetchApp.fetch(`${base}/chat/completions`, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: `Bearer ${apiKey}` },
      payload: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt || 'Describe this image in one or two sentences, and transcribe any visible text.' },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }
          ]
        }],
        max_tokens: 400
      }),
      muteHttpExceptions: true
    });
    const body = JSON.parse(resp.getContentText() || '{}');
    if (resp.getResponseCode() >= 400 || body.error) { log('Vision', 'error', body.error || resp.getResponseCode()); return null; }
    return (body.choices?.[0]?.message?.content || '').trim() || null;
  } catch (e) { log('Vision', 'describe failed', e.message); return null; }
}
