import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { updateInstitutionSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function requireUserId(request: NextRequest): Promise<string | NextResponse> {
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
  return userId;
}

// GET /api/v1/institutions/:id
//
// Institution detail page: full record (including address/notes, which the
// directory table doesn't show) plus contacts, full interaction history,
// and follow-up tasks — everything the directory list and the add-in's
// 3-item lookup preview leave out. Scoped to the signed-in recruiter's own
// institution — a mismatched owner reads as 404, not a 403 that would
// confirm the row exists.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request);
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: institution, error: institutionError } = await supabase
    .from('institutions_with_health')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (institutionError) {
    return NextResponse.json({ error: institutionError.message }, { status: 500, headers: corsHeaders() });
  }
  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404, headers: corsHeaders() });
  }

  const [{ data: contacts }, { data: interactions }, { data: followups }] = await Promise.all([
    supabase.from('contacts').select('*').eq('institution_id', id).order('is_primary', { ascending: false }),
    supabase.from('interactions').select('*').eq('institution_id', id).order('interaction_date', { ascending: false }),
    supabase.from('tasks_followups').select('*').eq('institution_id', id).order('due_date', { ascending: false }),
  ]);

  return NextResponse.json(
    {
      institution,
      contacts: contacts ?? [],
      interactions: interactions ?? [],
      followups: followups ?? [],
    },
    { headers: corsHeaders() }
  );
}

// PATCH /api/v1/institutions/:id
//
// Used by the Kanban pipeline view (FR-5.2) to move a card between stages,
// and generally for editing an institution's directory fields. Scoped to
// the signed-in recruiter's own institution.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request);
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
  }

  const parsed = updateInstitutionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('institutions')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
  if (!data) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404, headers: corsHeaders() });
  }

  return NextResponse.json(data, { status: 200, headers: corsHeaders() });
}

// DELETE /api/v1/institutions/:id
//
// Cascades to the institution's contacts, interactions, and follow-up
// tasks (ON DELETE CASCADE) — the dashboard confirms this with the user
// before calling it, since it's not reversible. Scoped to the signed-in
// recruiter's own institution.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(request);
  if (userId instanceof NextResponse) return userId;

  const { id } = await params;
  const supabase = getSupabaseServer();

  const { error, count } = await supabase
    .from('institutions')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
  if (!count) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404, headers: corsHeaders() });
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
