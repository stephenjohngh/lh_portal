// src/routes/api/audit/log/+server.js
// General audit logging API endpoint - handles ALL audit events

import { json } from '@sveltejs/kit';
import { logCreate, logUpdate, logDelete, logAudit } from '$lib/server/auditLogger';
import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('AuditAPI');

export async function POST({ request, locals, cookies }) {
  try {
    logger('📥 Received audit log request');
    
    const auditData = await request.json();
    logger('📦 Audit data received:', auditData);
    
    const { 
      userId,           // Pass from client
      userEmail,        // Pass from client
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
      logger('❌ Missing userId or userEmail in request');
      return json({ error: 'Missing user information' }, { status: 400 });
    }

    logger('✅ User info received:', userId, userEmail);

    // Route to appropriate logging function based on event type
    logger('🔀 Routing to event type:', eventType);
    
    switch (eventType) {
      case 'create':
        console.log('🔵🔵🔵 API: CREATE case hit!');
        logger('📝 Logging CREATE event');
        console.log('🔵 Calling logCreate with:', { userId, userEmail, targetType, targetId, targetName });
        const createResult = await logCreate(
          userId,
          userEmail,
          targetType,
          targetId,
          targetName,
          afterData || metadata
        );
        console.log('🔵 logCreate returned:', createResult);
        logger('✅ CREATE logged successfully');
        break;

      case 'update':
        logger('📝 Logging UPDATE event');
        await logUpdate(
          userId,
          userEmail,
          targetType,
          targetId,
          targetName,
          beforeData,
          afterData
        );
        logger('✅ UPDATE logged successfully');
        break;

      case 'delete':
        logger('📝 Logging DELETE event');
        await logDelete(
          userId,
          userEmail,
          targetType,
          targetId,
          targetName,
          beforeData || metadata
        );
        logger('✅ DELETE logged successfully');
        break;

      default:
        logger('📝 Logging CUSTOM event');
        // For custom events, use generic logAudit
        await logAudit({
          userId: userId,
          userEmail: userEmail,
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || null,
          userAgent: request.headers.get('user-agent') || null,
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
        logger('✅ CUSTOM event logged successfully');
        break;
    }

    logger('✅ Audit log API completed successfully');
    return json({ success: true });

  } catch (err) {
    logger('❌ Error logging audit event:', err);
    // Don't fail the request if audit logging fails
    // This ensures user operations aren't blocked by audit logging issues
    return json({ 
      success: true, 
      warning: 'Audit log failed',
      error: err.message 
    });
  }
}
