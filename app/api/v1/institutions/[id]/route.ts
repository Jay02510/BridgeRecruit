import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { updateInstitutionSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// GET /api/v1/institutions/:id
//
// Institution detail page: full record (including address/notes, which the
// directory table doesn't show) plus contacts, full interaction history,
// and follow-up tasks — everything the directory list and the add-in's
// 3-item lookup preview leave out.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: institution, error: institutionError } = await supabase
    .from('institutions_with_health')
    .select('*')
    .eq('id', id)
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
// and generally for editing an institution's directory fields.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

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
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(data, { status: 200, headers: corsHeaders() });
}

// DELETE /api/v1/institutions/:id
//
// Cascades to the institution's contacts, interactions, and follow-up
// tasks (ON DELETE CASCADE) — the dashboard confirms this with the user
// before calling it, since it's not reversible.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  const { id } = await params;
  const supabase = getSupabaseServer();

  const { error } = await supabase.from('institutions').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
