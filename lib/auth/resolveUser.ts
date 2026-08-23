import { getSupabaseServer } from '@/lib/supabase/server';

// Looks up the internal users.id for an already-verified token's oid claim.
// Does NOT provision a new row — first-login upsert happens in
// GET /api/v1/me (via the Graph profile call). If a caller hits a write
// endpoint before ever calling /me, we surface a clear error rather than
// silently creating a user with no email/name.
export async function resolveUserId(azureOid: string): Promise<string | null> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('azure_oid', azureOid)
    .maybeSingle();
  return data?.id ?? null;
}
