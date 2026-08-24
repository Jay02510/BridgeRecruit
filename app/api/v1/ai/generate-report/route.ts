import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { generateReportSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { corsHeaders } from '@/lib/cors';
import { getOpenAIClient } from '@/lib/openai/client';
import { buildPartnershipReportPrompt } from '@/lib/openai/prompts';
import { partnershipReportResponseSchema, PartnershipReportResponse } from '@/lib/openai/schemas';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/ai/generate-report
//
// Leadership-facing summary for a date range: pulls real activity stats
// from the DB, then asks the model to turn them into plain-language
// highlights/narrative/watch-list — grounded in the stats, not free-form.
export async function POST(request: NextRequest) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders() });
  }

  const parsed = generateReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { start_date, end_date, tier, country } = parsed.data;
  const supabase = getSupabaseServer();

  // Scope by tier/country when given: resolve matching institution ids
  // first, then filter interactions/follow-ups by those (Supabase JS can't
  // filter on an embedded resource's own columns directly).
  let scopedInstitutionIds: string[] | null = null;
  if (tier || country) {
    let idQuery = supabase.from('institutions').select('id');
    if (tier) idQuery = idQuery.eq('tier', tier);
    if (country) idQuery = idQuery.eq('country', country);
    const { data: scoped } = await idQuery;
    scopedInstitutionIds = (scoped ?? []).map((r) => r.id);
  }

  let newInstQuery = supabase
    .from('institutions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start_date)
    .lte('created_at', end_date);
  let finalizedQuery = supabase
    .from('institutions')
    .select('id', { count: 'exact', head: true })
    .eq('partnership_finalized', true);
  let interactionsQuery = supabase
    .from('interactions')
    .select('channel, subject, summary, interaction_date, institutions(name)')
    .gte('interaction_date', start_date)
    .lte('interaction_date', end_date)
    .order('interaction_date', { ascending: false });
  let followupsQuery = supabase
    .from('tasks_followups')
    .select('status')
    .gte('due_date', start_date)
    .lte('due_date', end_date);
  let healthQuery = supabase.from('institutions_with_health').select('health_status, name');

  if (tier) healthQuery = healthQuery.eq('tier', tier);
  if (country) healthQuery = healthQuery.eq('country', country);
  if (scopedInstitutionIds) {
    newInstQuery = newInstQuery.in('id', scopedInstitutionIds);
    finalizedQuery = finalizedQuery.in('id', scopedInstitutionIds);
    interactionsQuery = interactionsQuery.in('institution_id', scopedInstitutionIds);
    followupsQuery = followupsQuery.in('institution_id', scopedInstitutionIds);
  }

  const [{ count: newInstitutions }, { count: partnershipsFinalized }, { data: interactions }, { data: followups }, { data: healthRows }] =
    await Promise.all([newInstQuery, finalizedQuery, interactionsQuery, followupsQuery, healthQuery]);

  const interactionsByChannel: Record<string, number> = {};
  for (const i of interactions ?? []) {
    interactionsByChannel[i.channel] = (interactionsByChannel[i.channel] ?? 0) + 1;
  }

  const followupsCompleted = (followups ?? []).filter((f) => f.status === 'completed').length;
  const followupsOpen = (followups ?? []).filter((f) => f.status !== 'completed').length;

  const healthCounts: Record<string, number> = {};
  for (const r of healthRows ?? []) {
    healthCounts[r.health_status] = (healthCounts[r.health_status] ?? 0) + 1;
  }
  const stalledInstitutions = (healthRows ?? [])
    .filter((r) => r.health_status === 'stalled_cold')
    .map((r) => r.name)
    .slice(0, 10);

  const notableInteractions = (interactions ?? []).slice(0, 5).map((i) => ({
    institution: (i.institutions as unknown as { name: string } | null)?.name ?? 'Unknown institution',
    subject: i.subject,
    summary: i.summary,
  }));

  const filterSuffix = [tier?.replace(/_/g, ' '), country].filter(Boolean).join(', ');
  const periodLabel = `${new Date(start_date).toLocaleDateString()} – ${new Date(end_date).toLocaleDateString()}${filterSuffix ? ` · ${filterSuffix}` : ''}`;

  const prompt = buildPartnershipReportPrompt({
    periodLabel,
    newInstitutions: newInstitutions ?? 0,
    partnershipsFinalized: partnershipsFinalized ?? 0,
    interactionsByChannel,
    followupsCompleted,
    followupsOpen,
    healthCounts,
    notableInteractions,
    stalledInstitutions,
  });

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_schema', json_schema: partnershipReportResponseSchema },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty completion');

    const result: PartnershipReportResponse = JSON.parse(raw);
    return NextResponse.json(
      {
        ...result,
        period_label: periodLabel,
        stats: {
          new_institutions: newInstitutions ?? 0,
          partnerships_finalized: partnershipsFinalized ?? 0,
          interactions_by_channel: interactionsByChannel,
          followups_completed: followupsCompleted,
          followups_open: followupsOpen,
          health_counts: healthCounts,
        },
      },
      { status: 200, headers: corsHeaders() }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Report generation unavailable', details: (err as Error).message },
      { status: 502, headers: corsHeaders() }
    );
  }
}
