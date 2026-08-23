import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { institutionLookupQuerySchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// GET /api/v1/institutions/lookup?domain=X&email=Y
//
// Auto-invoked by the Outlook add-in when the recruiter opens an email.
// Matches domain against institutions, returns the school card, primary
// (or email-matched) contact, and last 3 interactions. Perf-critical path
// (<300ms target) — relies on idx_institutions_domain.
//
// Requires a valid bearer token (proves the add-in's dialog-based sign-in
// succeeded) but does NOT yet scope institutions by the signed-in user's
// own user_id — same MVP single-recruiter simplification already used by
// the interactions/tasks routes' hardcoded DEV_USER_ID, not a new gap.
export async function GET(request: NextRequest) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  const { searchParams } = new URL(request.url);
  const parsed = institutionLookupQuerySchema.safeParse({
    domain: searchParams.get('domain') ?? undefined,
    email: searchParams.get('email') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { domain, email } = parsed.data;
  const supabase = getSupabaseServer();

  const { data: institution, error: institutionError } = await supabase
    .from('institutions_with_health')
    .select('*')
    .ilike('domain', domain)
    .maybeSingle();

  if (institutionError) {
    return NextResponse.json({ error: institutionError.message }, { status: 500, headers: corsHeaders() });
  }

  if (!institution) {
    return NextResponse.json(
      { matched: false, institution: null, contact: null, recent_interactions: [] },
      { headers: corsHeaders() }
    );
  }

  // Prefer a contact matching the sender's exact email; fall back to primary.
  let contact = null;
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('institution_id', institution.id)
      .ilike('email', email)
      .maybeSingle();
    contact = data;
  }
  if (!contact) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('institution_id', institution.id)
      .eq('is_primary', true)
      .maybeSingle();
    contact = data;
  }

  const { data: recentInteractions, error: interactionsError } = await supabase
    .from('interactions')
    .select('id, channel, subject, summary, interaction_date')
    .eq('institution_id', institution.id)
    .order('interaction_date', { ascending: false })
    .limit(3);

  if (interactionsError) {
    return NextResponse.json({ error: interactionsError.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(
    {
      matched: true,
      institution,
      contact,
      recent_interactions: recentInteractions ?? [],
    },
    { headers: corsHeaders() }
  );
}
