import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

// Log to help debug
//console.log('Supabase URL:', PUBLIC_SUPABASE_URL ? 'Set' : 'Missing');
//console.log('Supabase Key:', PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing');

if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables!');
}

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
