import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createFollowupTaskSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { exchangeForGraphToken } from '@/lib/graph/obo';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/tasks/followup
//
// Creates a follow-up task and, when sync_to_calendar is true, pushes a
// synced event to Microsoft Graph /me/events with a Pre-Meeting Brief body
// (FR-3.1/FR-3.2) via the OBO-exchanged Graph token from Phase 3.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  let claims;
  try {
    claims = await verifyBearerToken(authHeader);
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

  const parsed = createFollowupTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { sync_to_calendar, ...taskFields } = parsed.data;
  const supabase = getSupabaseServer();

  const { data: task, error } = await supabase
    .from('tasks_followups')
    .insert({ ...taskFields, user_id: userId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  if (!sync_to_calendar) {
    return NextResponse.json(task, { status: 201, headers: corsHeaders() });
  }

  // Build the Pre-Meeting Brief body per FR-3.2: school profile & tier,
  // last 3 touchpoints, pending focus agenda.
  const { data: institution } = await supabase
    .from('institutions')
    .select('name, tier')
    .eq('id', taskFields.institution_id)
    .maybeSingle();

  const { data: recentInteractions } = await supabase
    .from('interactions')
    .select('channel, subject, interaction_date')
    .eq('institution_id', taskFields.institution_id)
    .order('interaction_date', { ascending: false })
    .limit(3);

  const historyLines = (recentInteractions ?? [])
    .map((i, idx) => `${idx + 1}. ${new Date(i.interaction_date).toLocaleDateString()} (${i.channel}): ${i.subject}`)
    .join('\n');

  const briefBody = [
    'BRIDGERECRUIT BRIEF:',
    `- Target: ${institution?.name ?? 'Unknown institution'}${institution?.tier ? ` (${institution.tier.replace(/_/g, ' ')})` : ''}`,
    `- Focus: ${taskFields.focus_agenda ?? taskFields.title}`,
    historyLines ? `- Recent history:\n${historyLines}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const startDate = new Date(taskFields.due_date);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  const toGraphDateTime = (d: Date) => d.toISOString().replace('Z', '');

  try {
    const tenantId = claims.tid as string;
    const inboundToken = authHeader!.slice('Bearer '.length);
    const graphToken = await exchangeForGraphToken(inboundToken, tenantId, ['Calendars.ReadWrite']);

    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphToken.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: `Follow-up: ${institution?.name ?? taskFields.title}`,
        body: { contentType: 'Text', content: briefBody },
        start: { dateTime: toGraphDateTime(startDate), timeZone: 'Asia/Seoul' },
        end: { dateTime: toGraphDateTime(endDate), timeZone: 'Asia/Seoul' },
      }),
    });

    if (!graphResponse.ok) {
      const details = await graphResponse.text();
      return NextResponse.json(
        { ...task, calendar_sync: 'failed', calendar_sync_error: details },
        { status: 201, headers: corsHeaders() }
      );
    }

    const graphEvent = await graphResponse.json();

    const { data: updatedTask } = await supabase
      .from('tasks_followups')
      .update({ outlook_event_id: graphEvent.id })
      .eq('id', task.id)
      .select()
      .single();

    return NextResponse.json(
      { ...(updatedTask ?? task), calendar_sync: 'synced' },
      { status: 201, headers: corsHeaders() }
    );
  } catch (err) {
    return NextResponse.json(
      { ...task, calendar_sync: 'failed', calendar_sync_error: (err as Error).message },
      { status: 201, headers: corsHeaders() }
    );
  }
}
