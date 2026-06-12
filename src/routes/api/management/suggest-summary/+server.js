// src/routes/api/management/suggest-summary/+server.js
//
// AI-generated one-line summary for a note or comment activity.
// Sends the activity body to Claude and returns a concise summary string
// (max ~12 words) for use in the fields.summary field.
//
// Mirrors the auth / rate-limit / audit pattern of suggest-action.

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env as privateEnv } from '$env/dynamic/private';
import { requireAuth } from '$lib/server/requireAuth';
import { checkKeyRateLimit, LIMITS } from '$lib/server/publicRateLimit';
import { logAudit } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('SuggestSummaryAPI');

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, privateEnv.SUPABASE_SERVICE_ROLE_KEY);

// ── Prompt + tool ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an assistant for a property-management portal. Property managers write notes and comments about building issues. Your job is to produce a single concise one-line summary of a note or comment so it can be used as a heading in printed reports.

Rules:
- Maximum 12 words
- Plain English — no jargon, no acronyms unless they appear in the original
- Descriptive noun phrase or short sentence — match the tone of the note
- No trailing full stop
- Capture the single most important point; omit detail
- Output ONLY by calling the suggest_summary tool — never reply in plain text

Examples:
Note: "Called contractor — they confirmed the lift motor replacement is booked for Thursday 14th at 9am. Resident in flat 23 to be informed."
→ summary: "Lift motor replacement booked Thursday 14th — resident to be notified"

Note: "Spoke to the tenant again. She says the damp on the north wall is getting worse and there is now visible mould."
→ summary: "Damp on north wall worsening with visible mould"

Note: "All clear. Engineer visited today and confirmed no further action needed on the boiler."
→ summary: "Engineer confirmed no further action needed on boiler"`;

const TOOL_DEFINITION = {
  name: 'suggest_summary',
  description: 'Return a one-line summary of the note or comment.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Concise one-line summary, max 12 words, no trailing full stop.'
      }
    },
    required: ['summary']
  }
};

// ── Model resolution (matches suggest-action pattern) ─────────────────────
const DEFAULT_MODEL  = 'claude-haiku-4-5';
const ALLOWED_MODELS = new Set(['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5']);

async function getConfiguredModel() {
  try {
    const { data } = await supabaseAdmin
      .from('portal_settings')
      .select('value')
      .eq('key', 'ai_model')
      .maybeSingle();
    const v = data?.value;
    if (typeof v === 'string' && ALLOWED_MODELS.has(v)) return v;
  } catch (err) {
    logger('⚠️ Failed to read ai_model; using default:', err.message);
  }
  return DEFAULT_MODEL;
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function POST({ request }) {
  let profile = null;
  let model   = DEFAULT_MODEL;

  function recordAudit(eventAction, severity = 'info', extra = {}) {
    if (!profile) return;
    logAudit({
      userId:        profile.id,
      userEmail:     profile.email,
      eventType:     'ai_suggest_summary',
      eventCategory: 'ai_assist',
      eventAction,
      targetType:    'activity',
      appId:         'management',
      severity,
      metadata:      { model, ...extra }
    }).catch(err => logger('audit log failed (non-fatal):', err.message));
  }

  try {
    // ── Auth: verified bearer token, never a body-supplied id ────────
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    profile = auth.user;

    const { body, activity_type } = await request.json();

    // ── Validate ─────────────────────────────────────────────────────
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return json({ error: 'body is required' }, { status: 400 });
    }
    if (body.length > 4000) {
      return json({ error: 'body must be under 4000 characters' }, { status: 400 });
    }

    // ── Rate limit per user (table-backed) ───────────────────────────
    if (!(await checkKeyRateLimit(`user:${profile.id}`, 'ai_summary'))) {
      recordAudit('rate_limited', 'warning');
      return json(
        { error: `Rate limit exceeded (${LIMITS.ai_summary.max} summaries/hour). Try again later.` },
        { status: 429 }
      );
    }

    // ── Feature flag ──────────────────────────────────────────────────
    const apiKey = privateEnv.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json({ error: 'AI summaries are not configured on this server' }, { status: 503 });
    }

    model = await getConfiguredModel();

    // ── Call Claude ───────────────────────────────────────────────────
    const client = new Anthropic({ apiKey });

    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 80,
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'tool', name: 'suggest_summary' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
        ],
        messages: [
          {
            role: 'user',
            content: `Activity type: ${activity_type || 'note'}\n\n${body}`
          }
        ]
      });
    } catch (apiErr) {
      logger('❌ Anthropic API error:', apiErr.message);
      recordAudit('failed', 'error', { reason: 'anthropic_api_error', error: (apiErr.message || '').slice(0, 200) });
      return json({ error: 'AI service error' }, { status: 502 });
    }

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse) {
      recordAudit('failed', 'error', { reason: 'no_tool_use' });
      return json({ error: 'Model did not return a summary' }, { status: 502 });
    }

    const summary = (toolUse.input?.summary || '').trim();
    logger('✅ Summary generated:', summary);

    recordAudit('suggested', 'info', {
      activity_type,
      input_tokens:          response.usage?.input_tokens,
      output_tokens:         response.usage?.output_tokens,
      cache_read_tokens:     response.usage?.cache_read_input_tokens,
      cache_creation_tokens: response.usage?.cache_creation_input_tokens
    });

    return json({ summary });

  } catch (err) {
    logger('❌ Unexpected error:', err.message);
    recordAudit('failed', 'error', { reason: 'unexpected_error', error: (err.message || '').slice(0, 200) });
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
