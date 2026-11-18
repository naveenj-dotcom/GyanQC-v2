import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zrlxcobmhqickkpepadk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LR_3neYvHJgWYXd4zIHsOA_sxAOqejC';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
