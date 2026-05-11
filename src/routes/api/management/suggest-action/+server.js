// src/routes/api/management/suggest-action/+server.js
//
// AI-suggested action text from an issue comment.
// Reads the new comment + issue context + currently-open actions, asks
// Claude Haiku whether the comment implies a concrete action, and returns
// either { shouldSuggest: true, action_text, reasoning } or
// { shouldSuggest: false, action_text: '', reasoning } so the client can
// hide the suggestion card.
//
// Day 1 of the AI-suggested-actions plan. Feature-flagged: if
// ANTHROPIC_API_KEY is unset the route returns 503 and the client falls
// back to the Day 0.5 verbatim-comment-text path.
//
// Auth: caller posts { requesting_user_id }; the route verifies that the
// id maps to a real profile before calling the LLM. We don't gate by
// is_admin — every authenticated user can use this when their permissions
// allow them to add comments.
//
// Rate limit: 60 calls / user / hour. In-memory bucket; resets on server
// restart, which is fine for this scale.
//
// Audit: every call (success or refusal) writes an audit_logs row with
// app_id='management', event_type='ai_suggest', so usage is traceable.

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { env as privateEnv } from '$env/dynamic/private';
import { logAudit } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('SuggestActionAPI');

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Rate limit ────────────────────────────────────────────────────────────
const RATE_LIMIT_PER_HOUR = 60;
const rateBuckets = new Map(); // userId -> [timestamps]

function checkRateLimit(userId) {
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const recent = (rateBuckets.get(userId) || []).filter(t => t > oneHourAgo);
  recent.push(now);
  rateBuckets.set(userId, recent);
  return recent.length <= RATE_LIMIT_PER_HOUR;
}

// ── Prompt + tool definition ──────────────────────────────────────────────
// Static prefix — wrapped in cache_control so subsequent calls within the
// 5-minute cache window pay the cheaper cache-read rate for these tokens.
const SYSTEM_PROMPT = `You are an assistant for a property-management portal. Property managers leave comments on Issues. Your job is to read a new comment and decide whether it implies a single concrete piece of work that should become a new Action on the Issue.

An Action is concrete, imperative, and self-contained. Examples:
- "Inspect 3rd floor lift mechanism for clunking noise on startup"
- "Replace damaged window seal in flat 4B"
- "Schedule contractor visit for boiler annual service"

A comment is NOT actionable when any of these are true:
- It is a confirmation, acknowledgement, or thanks ("Tuesday 9am works", "Thanks for the update")
- It is a status report with no next step ("All sorted now", "Tenant confirmed quiet again")
- It asks a question without a clear ask of someone in particular
- It would duplicate an action that is already open on this issue

Output rules:
- Always respond by calling the suggest_action tool. Never reply in plain text.
- shouldSuggest = true only when a clear action is implied AND it is not already covered by the existing open actions list.
- action_text: a single sentence in imperative voice (~5–18 words), plain English, no bullet points. Empty string when shouldSuggest is false.
- reasoning: one short sentence explaining your choice. Used for audit only.

Worked examples follow.

<example>
<comment>The lift on the 3rd floor is making a clunking noise when starting</comment>
<existing_actions>none</existing_actions>
<output>{"shouldSuggest": true, "action_text": "Inspect 3rd floor lift mechanism for clunking noise on startup", "reasoning": "Specific reported fault with clear location."}</output>
</example>

<example>
<comment>Thanks, that's helpful</comment>
<existing_actions>none</existing_actions>
<output>{"shouldSuggest": false, "action_text": "", "reasoning": "Acknowledgement only; no work implied."}</output>
</example>

<example>
<comment>Confirmed Tuesday 9am with the contractor</comment>
<existing_actions>Schedule contractor visit for boiler service</existing_actions>
<output>{"shouldSuggest": false, "action_text": "", "reasoning": "Confirms an existing open action; no new work."}</output>
</example>

<example>
<comment>Tenant in 4B reported damp on the north wall this morning</comment>
<existing_actions>none</existing_actions>
<output>{"shouldSuggest": true, "action_text": "Inspect north wall in flat 4B for reported damp", "reasoning": "Specific tenant-reported fault with clear location."}</output>
</example>

<example>
<comment>Will review next week</comment>
<existing_actions>none</existing_actions>
<output>{"shouldSuggest": false, "action_text": "", "reasoning": "Vague intent without concrete deliverable."}</output>
</example>`;

const TOOL_DEFINITION = {
  name: 'suggest_action',
  description: 'Return a single action suggestion (or decline) for the given comment.',
  input_schema: {
    type: 'object',
    properties: {
      shouldSuggest: {
        type: 'boolean',
        description: 'true when the comment implies a concrete piece of work not already covered by an existing open action; false otherwise.'
      },
      action_text: {
        type: 'string',
        description: 'Imperative-voice action description, ~5–18 words. Empty string when shouldSuggest is false.'
      },
      reasoning: {
        type: 'string',
        description: 'One short sentence explaining the choice. Used for audit/debug.'
      }
    },
    required: ['shouldSuggest', 'action_text', 'reasoning']
  }
};

// Default model when no override is saved in portal_settings.
const DEFAULT_MODEL = 'claude-haiku-4-5';

// Allowlist — admins can only switch among these. Anything else falls
// back to DEFAULT_MODEL so a typo or stale row can't break the route.
// Keep ordered cheapest → most expensive; the admin UI mirrors this.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-opus-4-5'
]);

/**
 * Read the configured Claude model from portal_settings.ai_model.
 * Returns DEFAULT_MODEL when the row is missing, the value isn't a
 * string, or it isn't in the allowlist.
 */
async function getConfiguredModel() {
  try {
    const { data, error } = await supabaseAdmin
      .from('portal_settings')
      .select('value')
      .eq('key', 'ai_model')
      .maybeSingle();
    if (error) throw error;
    const v = data?.value;
    if (typeof v === 'string' && ALLOWED_MODELS.has(v)) return v;
  } catch (err) {
    logger('⚠️ Failed to read ai_model setting; using default:', err.message);
  }
  return DEFAULT_MODEL;
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function POST({ request }) {
  // Outer-scope state so the audit helper (and the catch block) can see
  // partial information when an exit path is taken before we reach the
  // model call.
  let profile      = null;
  let issue_id     = null;
  let activity_id  = null;
  let issueName    = null;
  let model        = DEFAULT_MODEL;

  /**
   * Fire-and-forget audit row. Skipped silently when we don't yet know
   * who the caller is (i.e. before auth has succeeded) — those failures
   * are noisy in server logs but don't pollute the audit table.
   */
  function recordAudit(eventAction, severity = 'info', extraMetadata = {}) {
    if (!profile) return;
    logAudit({
      userId:        profile.id,
      userEmail:     profile.email,
      eventType:     'ai_suggest',
      eventCategory: 'ai_assist',
      eventAction,
      targetType:    'activity',
      targetId:      activity_id || null,
      targetName:    issueName ? `Issue: ${issueName}`.slice(0, 200) : 'AI suggestion',
      appId:         'management',
      severity,
      metadata: {
        issue_id,
        model,
        ...extraMetadata
      }
    }).catch(err => logger('audit log failed (non-fatal):', err.message));
  }

  try {
    const reqBody = await request.json();
    const requesting_user_id = reqBody.requesting_user_id;
    issue_id     = reqBody.issue_id     ?? null;
    // Accept both old comment_id and new activity_id for transition period
    activity_id  = reqBody.activity_id  ?? reqBody.comment_id ?? null;
    // Accept both old comment_text and new body for transition period
    const activity_text = reqBody.body ?? reqBody.comment_text;

    // ── Validate input ────────────────────────────────────────────────
    if (!requesting_user_id) {
      return json({ error: 'No user ID provided' }, { status: 400 });
    }
    if (!issue_id || !activity_text) {
      return json({ error: 'issue_id and body are required' }, { status: 400 });
    }
    if (typeof activity_text !== 'string' || activity_text.length > 4000) {
      return json({ error: 'body must be a string under 4000 characters' }, { status: 400 });
    }

    // ── Auth: must be a real profile ─────────────────────────────────
    const { data: loadedProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('id', requesting_user_id)
      .single();
    if (profileErr || !loadedProfile) {
      logger('❌ Unknown user:', requesting_user_id, profileErr?.message);
      return json({ error: 'Unauthorized' }, { status: 403 });
    }
    profile = loadedProfile;

    // ── Rate limit per user ──────────────────────────────────────────
    if (!checkRateLimit(requesting_user_id)) {
      logger('⚠️ Rate limited:', profile.email);
      recordAudit('rate_limited', 'warning', { reason: 'per_user_hourly_cap' });
      return json(
        { error: `Rate limit exceeded (${RATE_LIMIT_PER_HOUR} suggestions/hour). Try again later.` },
        { status: 429 }
      );
    }

    // ── Feature flag: bail early if no API key configured ────────────
    const apiKey = privateEnv.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger('ℹ️ ANTHROPIC_API_KEY not set; AI suggestions disabled');
      recordAudit('unconfigured', 'warning', { reason: 'missing_api_key' });
      return json(
        { error: 'AI suggestions are not configured on this server' },
        { status: 503 }
      );
    }

    // ── Build context: issue + recent activities + open actions ─────
    const [
      { data: issue, error: issueErr },
      { data: recentActivities },
      { data: openActions }
    ] = await Promise.all([
      supabaseAdmin.from('issues').select('id, name, description').eq('id', issue_id).single(),
      supabaseAdmin
        .from('activities')
        .select('body, created_at')
        .eq('issue_id', issue_id)
        .eq('activity_type', 'comment')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('actions')
        .select('action_text')
        .eq('issue_id', issue_id)
        .neq('status', 'completed')
    ]);

    if (issueErr || !issue) {
      logger('❌ Issue not found:', issue_id, issueErr?.message);
      recordAudit('failed', 'error', { reason: 'issue_not_found' });
      return json({ error: 'Issue not found' }, { status: 404 });
    }
    issueName = issue.name;

    // Pick up to 3 prior activities, excluding the new one
    const priorCommentLines = (recentActivities || [])
      .filter(a => a.body !== activity_text)
      .slice(0, 3)
      .map(a => `- ${a.body}`);
    const priorCommentsBlock = priorCommentLines.length > 0
      ? priorCommentLines.join('\n')
      : '(none)';

    const openActionsList = (openActions || []).map(a => a.action_text);
    const openActionsLine = openActionsList.length > 0
      ? openActionsList.join('; ')
      : 'none';
    const openActionsBlock = openActionsList.length > 0
      ? openActionsList.map(t => `- ${t}`).join('\n')
      : '(none)';

    const userMessage = `Issue: ${issue.name}
${issue.description ? `Description: ${issue.description}` : ''}

Recent prior comments on this issue:
${priorCommentsBlock}

Currently open actions on this issue:
${openActionsBlock}

<comment>${activity_text}</comment>
<existing_actions>${openActionsLine}</existing_actions>

Use the suggest_action tool.`;

    // ── Resolve the configured model (admin-overridable) ─────────────
    model = await getConfiguredModel();

    // ── Call Claude with prompt caching + structured output ──────────
    const client = new Anthropic({ apiKey });

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 400,
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'tool', name: 'suggest_action' },
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          { role: 'user', content: userMessage }
        ]
      });
    } catch (apiErr) {
      logger('❌ Anthropic API error:', apiErr.message);
      recordAudit('failed', 'error', {
        reason: 'anthropic_api_error',
        error: (apiErr.message || '').slice(0, 500)
      });
      return json(
        { error: 'AI service error', message: apiErr.message },
        { status: 502 }
      );
    }

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse) {
      logger('❌ Model returned no tool_use block');
      recordAudit('failed', 'error', { reason: 'no_tool_use' });
      return json({ error: 'Model did not return a structured suggestion' }, { status: 502 });
    }

    const result = toolUse.input || {};
    const shouldSuggest = result.shouldSuggest === true;
    const actionText    = typeof result.action_text === 'string' ? result.action_text.trim() : '';
    const reasoning     = typeof result.reasoning   === 'string' ? result.reasoning.trim()   : '';

    logger('✅ Suggestion:', shouldSuggest, '—', reasoning);

    recordAudit(shouldSuggest ? 'suggested' : 'declined', 'info', {
      shouldSuggest,
      reasoning:             reasoning.slice(0, 500),
      input_tokens:          response.usage?.input_tokens,
      output_tokens:         response.usage?.output_tokens,
      cache_read_tokens:     response.usage?.cache_read_input_tokens,
      cache_creation_tokens: response.usage?.cache_creation_input_tokens
    });

    return json({
      shouldSuggest,
      action_text: shouldSuggest ? actionText : '',
      reasoning
    });

  } catch (err) {
    logger('❌ Unexpected error:', err.message);
    recordAudit('failed', 'error', {
      reason: 'unexpected_error',
      error: (err.message || '').slice(0, 500)
    });
    return json(
      { error: 'Internal server error', message: err.message },
      { status: 500 }
    );
  }
}
