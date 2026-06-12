// src/routes/api/audit/log/+server.js
// General audit logging API endpoint - handles ALL audit events
//
// Identity is taken from the verified bearer token (requireAuth), never from
// the request body — otherwise anyone could forge audit entries attributing
// actions to arbitrary users, or flood the table anonymously.

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { logAudit, getIpAddress, getUserAgent } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('AuditAPI');

export async function POST({ request }) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;

    const auditData = await request.json();

    const {
      eventType,
      targetType,
      targetId,
      targetName,
      beforeData,
      afterData,
      metadata,
      severity,
      flagged,
      // New fields — passed by plansStore and issuesStore via auditLogger.js
      appId,
      eventCategory,
      eventAction
    } = auditData;

    // userId / userEmail come from the verified token; any values in the
    // body are ignored.
    const userId    = auth.user.id;
    const userEmail = auth.user.email;

    logger('Audit log request:', eventType, 'for', targetType, 'by', userEmail, '| app:', appId);

    // Derive event_category: use explicit value if provided, otherwise fall back
    // to the old behaviour (targetType + 's') so existing events are unaffected.
    const resolvedCategory = eventCategory || (targetType ? targetType + 's' : 'system');
    const resolvedAction   = eventAction   || eventType;
    const resolvedSeverity = severity      || 'info';

    // All branches now use the generic logAudit so we can pass every field through.
    // logCreate/logUpdate/logDelete were convenience wrappers that hardcoded category;
    // by using logAudit directly we keep full control without changing the server helper.
    await logAudit({
      userId,
      userEmail,
      ipAddress:     getIpAddress(request),
      userAgent:     getUserAgent(request),
      eventType,
      eventCategory: resolvedCategory,
      eventAction:   resolvedAction,
      targetType,
      targetId,
      targetName,
      appId:         appId || null,
      changes: (beforeData || afterData)
        ? { before: beforeData || null, after: afterData || null }
        : null,
      metadata:  metadata  || null,
      severity:  resolvedSeverity,
      flagged:   flagged   || false
    });

    logger('✅ Audit logged successfully');
    return json({ success: true });

  } catch (err) {
    logger('❌ Error logging audit:', err.message);
    return json({ error: 'Audit log failed', detail: err.message }, { status: 500 });
  }
}
