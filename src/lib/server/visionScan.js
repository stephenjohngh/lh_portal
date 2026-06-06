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

const logger = getLogger('visionScan');

// Likelihood values returned by the Vision API, in ascending order.
// We reject LIKELY and VERY_LIKELY.
const REJECT_LIKELIHOODS = new Set(['LIKELY', 'VERY_LIKELY']);

// Which SafeSearch categories to check for a building safety portal.
// We check adult content and violence; spoof/racy/medical are ignored.
const CHECKED_CATEGORIES = ['adult', 'violence'];

/**
 * Run Google Cloud Vision SafeSearch on an image buffer.
 *
 * @param {Buffer} buffer  — raw image bytes
 * @returns {Promise<{ safe: boolean, reason?: string, skipped?: boolean }>}
 */
export async function safeSearchScan(buffer) {
  const clientEmail  = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    logger('⚠ Vision scan skipped — GOOGLE_DRIVE credentials not configured');
    return { safe: true, skipped: true };
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  try {
    // Obtain an access token using the service account.
    // The googleapis auth library handles JWT signing and token caching.
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ['https://www.googleapis.com/auth/cloud-vision'],
    });
    const client      = await auth.getClient();
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
