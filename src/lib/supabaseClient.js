import { createClient } from '@supabase/supabase-js'
//import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

const PUBLIC_SUPABASE_URL = import.meta.env.PUBLIC_NF_SUPABASE_URL
const PUBLIC_SUPABASE_ANON_KEY = import.meta.env.PUBLIC_NF_SUPABASE_ANON_KEY

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
