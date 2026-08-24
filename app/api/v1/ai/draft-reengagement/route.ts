import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { draftReengagementSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { corsHeaders } from '@/lib/cors';
import { getOpenAIClient } from '@/lib/openai/client';
import { buildReengagementPrompt } from '@/lib/openai/prompts';
import { reengagementDraftResponseSchema, ReengagementDraftResponse } from '@/lib/openai/schemas';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/ai/draft-reengagement
//
// Feature 2 of the PRD's LLM Architecture ("Ghosting Defense"): drafts a
// warm, low-pressure re-engagement email for a stalled institution using
// its tier, last touchpoint, and counselor preferences as context.
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

  const parsed = draftReengagementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { institution_id } = parsed.data;
  const supabase = getSupabaseServer();

  const { data: institution } = await supabase
    .from('institutions')
    .select('name, last_interaction_at')
    .eq('id', institution_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404, headers: corsHeaders() });
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('name, preferences_notes')
    .eq('institution_id', institution_id)
    .eq('is_primary', true)
    .maybeSingle();

  const { data: lastInteraction } = await supabase
    .from('interactions')
    .select('summary, interaction_date')
    .eq('institution_id', institution_id)
    .order('interaction_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const daysInactive = institution.last_interaction_at
    ? Math.floor((Date.now() - new Date(institution.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const prompt = buildReengagementPrompt({
    schoolName: institution.name,
    counselorName: contact?.name ?? 'Counseling Office',
    lastInteractionDate: lastInteraction?.interaction_date
      ? new Date(lastInteraction.interaction_date).toLocaleDateString()
      : 'unknown',
    lastInteractionSummary: lastInteraction?.summary ?? 'No prior interaction on file.',
    counselorPreferences: contact?.preferences_notes ?? 'None on file.',
    daysInactive,
  });

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: reengagementDraftResponseSchema },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty completion');

    const result: ReengagementDraftResponse = JSON.parse(raw);
    return NextResponse.json(result, { status: 200, headers: corsHeaders() });
  } catch (err) {
    return NextResponse.json(
      { error: 'AI draft unavailable', details: (err as Error).message },
      { status: 502, headers: corsHeaders() }
    );
  }
}
