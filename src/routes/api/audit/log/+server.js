// src/routes/api/audit/log/+server.js
// General audit logging API endpoint - handles ALL audit events
// UPDATED: passes appId and eventCategory through to server-side logging functions

import { json } from '@sveltejs/kit';
import { logCreate, logUpdate, logDelete, logAudit, getIpAddress, getUserAgent } from '$lib/server/auditLogger';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('AuditAPI');

export async function POST({ request }) {
  try {
    const auditData = await request.json();
    
    const { 
      userId,
      userEmail,
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

    if (!userId || !userEmail) {
      logger('❌ Missing userId or userEmail');
      return json({ error: 'Missing user information' }, { status: 400 });
    }

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
