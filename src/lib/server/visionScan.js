// src/lib/server/visionScan.js
// Google Cloud Vision SafeSearch for anonymous file uploads.
//
// Reuses the service account credentials already configured for Google Drive
// (GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY). The Cloud Vision
// API must be enabled in the same Google Cloud project.
//
// If credentials are missing or the API call fails, the scan is skipped
// (fail open) — so the endpoint still works before Vision API is enabled.
//
// Usage:
//   const result = await safeSearchScan(buffer);
//   if (!result.safe) return json({ error: result.reason }, { status: 422 });

import { google }    from 'googleapis';
import { getLogger } from '$lib/utils/logger';
import {
  GOOGLE_DRIVE_CLIENT_EMAIL,
  GOOGLE_DRIVE_PRIVATE_KEY,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN,
} from '$env/static/private';

const logger = getLogger('visionScan');

// Likelihood values returned by the Vision API, in ascending order.
// We reject LIKELY and VERY_LIKELY.
const REJECT_LIKELIHOODS = new Set(['LIKELY', 'VERY_LIKELY']);

// Which SafeSearch categories to check for a building safety portal.
// We check adult content and violence; spoof/racy/medical are ignored.
const CHECKED_CATEGORIES = ['adult', 'violence'];

// Module-level singleton — avoid building a new JWT auth client per request.
// Cleared if credentials are missing (so we recheck once they're added).
let _authClient = null;
async function getAuthClient() {
  if (_authClient) return _authClient;

  let auth;
  if (GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REFRESH_TOKEN) {
    // OAuth2 mode — reuse the same credentials as the Drive provider
    const oauth2 = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });
    auth = oauth2;
  } else {
    const clientEmail   = GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = GOOGLE_DRIVE_PRIVATE_KEY;
    if (!clientEmail || !privateKeyRaw) return null;
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/cloud-vision'],
    });
  }
  _authClient = await auth.getClient();
  return _authClient;
}

/**
 * Run Google Cloud Vision SafeSearch on an image buffer.
 *
 * @param {Buffer} buffer  — raw image bytes
 * @returns {Promise<{ safe: boolean, reason?: string, skipped?: boolean }>}
 */
export async function safeSearchScan(buffer) {
  try {
    const client = await getAuthClient();
    if (!client) {
      logger('⚠ Vision scan skipped — GOOGLE_DRIVE credentials not configured');
      return { safe: true, skipped: true };
    }

    // googleapis auth client caches access tokens internally.
    const tokenResult = await client.getAccessToken();
    const token       = tokenResult.token;

    if (!token) {
      logger('⚠ Vision scan skipped — could not obtain access token');
      return { safe: true, skipped: true };
    }

    // Call Vision API SafeSearch Detection
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image:    { content: buffer.toString('base64') },
          features: [{ type: 'SAFE_SEARCH_DETECTION', maxResults: 1 }],
        }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger('⚠ Vision API error:', response.status, text.slice(0, 200));
      // Fail open — don't block uploads if the API call fails
      return { safe: true, skipped: true };
    }

    const data = await response.json();
    const safe = data.responses?.[0]?.safeSearchAnnotation;

    if (!safe) {
      logger('⚠ Vision API returned no safeSearchAnnotation — allowing');
      return { safe: true, skipped: true };
    }

    // Check each category we care about
    for (const category of CHECKED_CATEGORIES) {
      const likelihood = safe[category];
      if (REJECT_LIKELIHOODS.has(likelihood)) {
        logger(`🚫 Vision scan rejected: ${category} = ${likelihood}`);
        return {
          safe:   false,
          reason: `Image was rejected because it may contain inappropriate content (${category}).`,
        };
      }
    }

    return { safe: true };

  } catch (err) {
    logger('⚠ Vision scan exception:', err.message, '— allowing upload');
    return { safe: true, skipped: true };
  }
}
