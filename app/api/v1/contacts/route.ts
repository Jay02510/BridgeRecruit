import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createContactSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/contacts
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

  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const supabase = getSupabaseServer();

  // institution_id is caller-supplied — verify it's actually theirs before
  // attaching a contact to it, same pattern as /api/v1/interactions.
  const { data: owned } = await supabase
    .from('institutions')
    .select('id')
    .eq('id', parsed.data.institution_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404, headers: corsHeaders() });
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(data, { status: 201, headers: corsHeaders() });
}
