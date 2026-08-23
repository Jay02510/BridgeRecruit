import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createInteractionSchema } from '@/lib/api-types';

// POST /api/v1/interactions
//
// Logs an email, in-person visit, fair booth, or virtual call. Insert
// triggers trg_after_interaction_insert, which cascades institutions.
// last_interaction_at (and therefore health_status) automatically — no
// application-side bookkeeping needed here.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createInteractionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServer();

  // TODO(Phase 3): derive user_id from the authenticated session instead of
  // hardcoding the dev placeholder recruiter once Entra ID auth lands.
  const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

  const { data, error } = await supabase
    .from('interactions')
    .insert({ ...parsed.data, user_id: DEV_USER_ID })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
