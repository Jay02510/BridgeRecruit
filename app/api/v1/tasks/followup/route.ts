import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createFollowupTaskSchema } from '@/lib/api-types';

// POST /api/v1/tasks/followup
//
// Creates a follow-up task. The PRD's version of this endpoint also pushes
// a synced event to Microsoft Graph /me/events with a Pre-Meeting Brief
// body. That requires the OBO-exchanged Graph token from Phase 3, so it's
// deliberately stubbed here: `sync_to_calendar: true` is accepted and
// stored, but no Graph call is made yet. Phase 4 wires the real push and
// populates outlook_event_id.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createFollowupTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { sync_to_calendar, ...taskFields } = parsed.data;
  const supabase = getSupabaseServer();

  // TODO(Phase 3): derive user_id from the authenticated session instead of
  // hardcoding the dev placeholder recruiter once Entra ID auth lands.
  const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

  const { data, error } = await supabase
    .from('tasks_followups')
    .insert({ ...taskFields, user_id: DEV_USER_ID })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (sync_to_calendar) {
    // Stubbed until Phase 4 (OBO Graph token + /me/events push).
    return NextResponse.json(
      { ...data, calendar_sync: 'not_yet_implemented' },
      { status: 201 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
