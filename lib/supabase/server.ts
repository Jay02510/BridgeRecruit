import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Service-role client for server-side use only (Route Handlers, cron jobs).
// This key bypasses Row-Level Security entirely — never import this module
// from client components or expose it to the browser.
//
// Lazily constructed so importing this module doesn't throw at build time
// if env vars aren't set yet — only when a route handler actually uses it
// at request time.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
