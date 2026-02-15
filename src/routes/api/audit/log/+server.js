// src/routes/api/audit/log/+server.js
// General audit logging API endpoint - handles ALL audit events
// CLEANED: All console.log replaced with logger

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
      flagged
    } = auditData;

    // Validate we have user info
    if (!userId || !userEmail) {
      logger('❌ Missing userId or userEmail');
      return json({ error: 'Missing user information' }, { status: 400 });
    }

    logger('Audit log request:', eventType, 'for', targetType, 'by', userEmail);

    // Route to appropriate logging function based on event type
    switch (eventType) {
      case 'create':
        await logCreate(
          userId,
          userEmail,
          targetType,
          targetId,
          targetName,
          afterData || metadata
        );
        break;

      case 'update':
        await logUpdate(
          userId,
          userEmail,
          targetType,
          targetId,
          targetName,
          beforeData,
          afterData
        );
        break;

      case 'delete':
        await logDelete(
          userId,
          userEmail,
          targetType,
          targetId,
          targetName,
          beforeData || metadata
        );
        break;

      default:
        // For custom events (login, logout, etc), use generic logAudit
        await logAudit({
          userId: userId,
          userEmail: userEmail,
          ipAddress: getIpAddress(request),
          userAgent: getUserAgent(request),
          eventType: eventType,
          eventCategory: targetType + 's',
          eventAction: 'success',
          targetType: targetType,
          targetId: targetId,
          targetName: targetName,
          changes: beforeData || afterData ? { before: beforeData, after: afterData } : null,
          metadata: metadata,
          severity: severity || 'info',
          flagged: flagged || false
        });
        break;
    }

    logger('✅ Audit logged successfully');
    return json({ success: true });

  } catch (err) {
    logger('❌ Error logging audit:', err.message);
    // Don't fail the request if audit logging fails
    // This ensures user operations aren't blocked by audit logging issues
    return json({ 
      success: true, 
      warning: 'Audit log failed',
      error: err.message 
    });
  }
}
