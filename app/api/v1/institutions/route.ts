import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createInstitutionSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// GET /api/v1/institutions
//
// Institution directory for the Territory Management dashboard (Phase 6):
// supports search (name) and filter by tier/health_status/country.
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
  const search = searchParams.get('search');
  const tier = searchParams.get('tier');
  const healthStatus = searchParams.get('health_status');
  const country = searchParams.get('country');

  const supabase = getSupabaseServer();
  let query = supabase.from('institutions_with_health').select('*').order('name', { ascending: true });

  if (search) query = query.ilike('name', `%${search}%`);
  if (tier) query = query.eq('tier', tier);
  if (healthStatus) query = query.eq('health_status', healthStatus);
  if (country) query = query.eq('country', country);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(data, { status: 200, headers: corsHeaders() });
}

// POST /api/v1/institutions
//
// FR-1.1's "1-click Add New Institution" quick-creation form, used by the
// add-in when a sender's domain doesn't match any existing institution.
export async function POST(request: NextRequest) {
  let claims;
  try {
    claims = await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  const userId = await resolveUserId(claims.oid as string);
  if (!userId) {
    return NextResponse.json(
      { error: 'No user record found for this token. Sign in via the dashboard first.' },
      { status: 401, headers: corsHeaders() }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
  }

  const parsed = createInstitutionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('institutions')
    .insert({ ...parsed.data, user_id: userId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(data, { status: 201, headers: corsHeaders() });
}
