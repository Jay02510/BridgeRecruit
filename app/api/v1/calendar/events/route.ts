import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { exchangeForGraphToken } from '@/lib/graph/obo';
import { graphFetchWithRetry } from '@/lib/graph/withRetry';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

interface GraphEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  bodyPreview?: string;
}

// GET /api/v1/calendar/events?start=ISO&end=ISO
//
// Read-only calendar view: reads the signed-in user's real Outlook calendar
// live via Graph (same Calendars.ReadWrite consent already granted for the
// follow-up push), so this always reflects the actual calendar — nothing
// stored or cached here. Cross-references our own tasks_followups by
// outlook_event_id so BridgeRecruit-created events can be labeled with the
// institution they're for, distinct from anything else on the calendar.
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params are required (ISO datetimes)' }, { status: 400, headers: corsHeaders() });
  }

  let events: GraphEvent[];
  try {
    const tenantId = claims.tid as string;
    const inboundToken = authHeader!.slice('Bearer '.length);
    const graphToken = await exchangeForGraphToken(inboundToken, tenantId, ['Calendars.ReadWrite']);

    const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$orderby=start/dateTime&$top=100`;
    const graphResponse = await graphFetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${graphToken.accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });

    if (!graphResponse.ok) {
      const details = await graphResponse.text();
      return NextResponse.json({ error: 'Graph calendar read failed', details }, { status: 502, headers: corsHeaders() });
    }

    const data = await graphResponse.json();
    events = data.value ?? [];
  } catch (err) {
    return NextResponse.json({ error: 'Calendar unavailable', details: (err as Error).message }, { status: 502, headers: corsHeaders() });
  }

  // Match against our own follow-ups by outlook_event_id to label which
  // events are BridgeRecruit-created and which institution they're for.
  const eventIds = events.map((e) => e.id);
  const supabase = getSupabaseServer();
  const { data: matchedTasks } = eventIds.length
    ? await supabase
        .from('tasks_followups')
        .select('outlook_event_id, focus_agenda, institutions(name)')
        .eq('user_id', userId)
        .in('outlook_event_id', eventIds)
    : { data: [] };

  const taskByEventId = new Map(
    (matchedTasks ?? []).map((t) => [
      t.outlook_event_id as string,
      {
        institutionName: (t.institutions as unknown as { name: string } | null)?.name ?? null,
        focusAgenda: t.focus_agenda,
      },
    ])
  );

  const result = events.map((e) => ({
    id: e.id,
    subject: e.subject,
    start: e.start.dateTime,
    end: e.end.dateTime,
    bodyPreview: e.bodyPreview ?? '',
    bridgeRecruit: taskByEventId.get(e.id) ?? null,
  }));

  return NextResponse.json({ events: result }, { status: 200, headers: corsHeaders() });
}
