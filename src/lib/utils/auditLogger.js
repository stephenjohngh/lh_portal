// src/lib/utils/auditLogger.js
// Shared audit logging utility — extracted from issuesStore.
// Posts to /api/audit/log and never throws (fire-and-forget safe).
//
// Usage (never await — fire-and-forget):
//   import { logAudit } from '$lib/utils/auditLogger';
//   logAudit('create', 'plan', plan.id, plan.name, { appId: 'plans' });
//   logAudit('update', 'issue', issue.id, issue.name, { beforeData: {...}, afterData: {...} });
//
// The caller's identity is established server-side from the bearer token
// sent in the Authorization header — the endpoint ignores any user fields
// in the body, so audit entries cannot be forged.

import { supabase } from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('auditLogger');

/**
 * Log an audit event via the /api/audit/log endpoint.
 *
 * @param {string} eventType      - 'create' | 'update' | 'delete' | 'login' | etc.
 * @param {string} targetType     - 'issue' | 'plan' | 'plan_element' | 'comment' | etc.
 * @param {string} targetId       - UUID of the affected record.
 * @param {string} targetName     - Human-readable name for the record.
 * @param {object} data           - Optional extra fields passed through to the API:
 *   @param {string}  [data.appId]         - Originating app: 'issues' | 'plans' | 'admin'
 *   @param {string}  [data.eventCategory] - Category override (defaults to appId or targetType)
 *   @param {string}  [data.eventAction]   - Specific action label e.g. 'create_plan'
 *   @param {string}  [data.severity]      - 'info' | 'warning' | 'error' | 'critical'
 *   @param {object}  [data.beforeData]    - State before update/delete
 *   @param {object}  [data.afterData]     - State after create/update
 * @returns {Promise<void>}
 */
export async function logAudit(eventType, targetType, targetId, targetName, data = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      logger('⚠️ No session found, skipping audit log');
      return;
    }

    logger('📝 Logging audit event:', { eventType, targetType, targetId, targetName });

    const response = await fetch('/api/audit/log', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        eventType,
        targetType,
        targetId,
        targetName,
        ...data
      })
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      logger('⚠️ Audit log failed:', result);
    } else {
      logger('✅ Audit logged:', eventType, targetName);
    }
  } catch (err) {
    // Never propagate — a failed audit write must not break the caller
    logger('❌ Failed to log audit event (non-fatal):', err);
  }
}
