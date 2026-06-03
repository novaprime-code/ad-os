/**
 * Ideas.gs
 * Idea capture, retrieval, and management.
 */

/**
 * Handle /idea command.
 */
function handleIdeaCommand(text) {
  if (!text || !text.trim()) {
    return '💡 Usage: <code>/idea SaaS for construction companies</code>';
  }

  const ideaId = generateId('IDEA');
  let summary = truncate(text, 80);
  let category = 'other';
  let tags = '';

  // AI categorization
  if (getConfigBool('AI_CATEGORIZE', true)) {
    const aiResult = categorizeInput(text);
    if (aiResult) {
      summary = aiResult.summary || summary;
      tags = aiResult.tags || '';
      category = _guessIdeaCategory(tags) || 'other';
    }
  }

  appendRow('Ideas', [
    ideaId, now(), text, summary, category, tags, '', 'new'
  ]);

  // Also log in Inbox
  appendRow('Inbox', [
    generateId('INB'), now(), 'telegram', text, summary, 'idea', 'medium', 'processed'
  ]);

  let msg = `💡 Idea saved!\n\n`;
  msg += `<b>${escapeHtml(summary)}</b>\n`;
  if (tags) msg += `🏷 ${tags}\n`;
  msg += `<code>${ideaId}</code>`;

  return msg;
}

/**
 * Handle /ideas command — list recent ideas.
 */
function handleIdeasList(filter = '') {
  let ideas = getSheetData('Ideas');

  if (filter === 'business') ideas = ideas.filter(i => i.Category === 'business');
  else if (filter === 'project') ideas = ideas.filter(i => i.Category === 'project');

  // Most recent first
  ideas.reverse();

  if (!ideas.length) return '💡 No ideas yet. Use <code>/idea</code> to capture one!';

  let msg = `<b>💡 Idea Vault</b> (${ideas.length} total)\n\n`;
  ideas.slice(0, 10).forEach(idea => {
    msg += formatIdea(idea) + '\n';
  });

  if (ideas.length > 10) msg += `\n... +${ideas.length - 10} more`;

  return msg;
}
