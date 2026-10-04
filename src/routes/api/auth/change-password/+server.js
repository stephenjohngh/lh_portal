// src/routes/api/auth/change-password/+server.js
//
// A signed-in person changes their own password (Settings).
//
// ⛔ WHY THIS IS A ROUTE (2026-10-02). Settings checked the current password
// with a signInWithPassword from the BROWSER, which:
//   · skipped the lockout — five guesses an hour became unlimited, for anyone
//     holding an unlocked session;
//   · wrote nothing to the audit log, for a password change;
//   · read every Supabase error as "Current password is incorrect", including
//     a switched-off Email provider — the fault the login page was fixed for.
// The current password is now checked by $lib/server/passwordCheck.js, the
// same way the login page checks it.
//
// Who is asking comes from the bearer token, never from the body: the body
// carries only the two passwords. A wrong current password answers 400, not
// 401, because the client reads a 401 as "your session has expired".

import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { logAudit, getIpAddress, getUserAgent } from '$lib/server/auditLogger';
import { checkPassword, adminClient, pauseMinutes } from '$lib/server/passwordCheck';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('ChangePassword');

export async function POST({ request, getClientAddress }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  let currentPassword, newPassword;
  try {
    ({ currentPassword, newPassword } = await request.json());
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!currentPassword || !newPassword) {
    return json({ error: 'Both the current and the new password are required.' }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return json({ error: 'The new password must be different from the current one.', field: 'newPassword' }, { status: 400 });
  }
  if (!user?.email) {
    return json({ error: 'This account has no email address to check the password against.' }, { status: 400 });
  }

  const result = await checkPassword({
    email: user.email, password: currentPassword, request, getClientAddress, purpose: 'change password',
  });
  if (result.kind === 'locked') {
    return json({ error: `Too many wrong passwords. Please try again in ${pauseMinutes()} minutes.`,
                  field: 'currentPassword' }, { status: 429 });
  }
  if (result.kind === 'not_checked') {
    return json({ error: result.outcome.message, passwordChecked: false }, { status: 503 });
  }
  if (result.kind === 'wrong') {
    return json({ error: 'Your current password is incorrect.', field: 'currentPassword',
                  attemptsRemaining: result.attemptsRemaining }, { status: 400 });
  }

  // The current password is right: set the new one on this account, by id.
  const { error } = await adminClient().auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) {
    logger('❌ Password update failed:', error.message);
    // Supabase's own reason (too short, too weak) is the useful one here.
    return json({ error: error.message || 'The new password could not be set.', field: 'newPassword' },
      { status: 400 });
  }

  logAudit({
    userId: user.id, userEmail: user.email,
    ipAddress: getIpAddress(request), userAgent: getUserAgent(request),
    eventType: 'password_change', eventCategory: 'auth', targetType: 'user',
    targetId: user.id, targetName: user.email, appId: 'settings',
  }).catch(err => logger('Audit log failed:', err.message));

  return json({ success: true });
}
