import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

export const DB_OVERRIDE_KEY = 'lh_db_override';

/**
 * Resolve Supabase credentials.
 * On the client, check localStorage for an admin-configured override first.
 * Falls back to the build-time env vars (the normal production config).
 */
function resolveCredentials() {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(DB_OVERRIDE_KEY);
      if (stored) {
        const { url, key } = JSON.parse(stored);
        if (url && key) {
          return { url, key, isOverride: true };
        }
      }
    } catch {
      // Ignore parse errors — fall through to env vars
    }
  }
  return { url: PUBLIC_SUPABASE_URL, key: PUBLIC_SUPABASE_ANON_KEY, isOverride: false };
}

const creds = resolveCredentials();

if (!creds.url || !creds.key) {
  console.error('Missing Supabase credentials!');
}

export const supabase     = createClient(creds.url, creds.key);
export const activeDbUrl  = creds.url;
export const isDbOverride = creds.isOverride;
