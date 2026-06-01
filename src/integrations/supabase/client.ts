import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
// A anon key é um JWT (somente ASCII: A-Z a-z 0-9 . _ -). Caracteres fora desse
// conjunto (aspas curvas, espaços zero-width, quebras de linha que entram no
// copy-paste das env vars do Vercel) viram bytes inválidos no header `apikey`/
// `Authorization` e disparam "String contains non ISO-8859-1 code point" no fetch.
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?.replace(/[^A-Za-z0-9._-]/g, '');

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});