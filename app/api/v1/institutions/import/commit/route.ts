import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createInstitutionSchema, createInteractionSchema, createFollowupTaskSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { corsHeaders } from '@/lib/cors';
import { parseSpreadsheet } from '@/lib/import/parseSpreadsheet';
import { applyMapping, type ColumnTarget } from '@/lib/import/mapping';
import { detectKnownSheet, extractKnownSheetRow } from '@/lib/import/knownSheets';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/institutions/import/commit
//
// Two paths:
// 1. Known sheet (currently: Julian's "Korea Interactions" export) — exact
//    named columns, and "Last Meeting"/"Last Contact"/"Next Steps" become
//    real interactions/follow-ups instead of flattened notes text. This is
//    what makes last_interaction_at (and therefore health_status) correct
//    on day one instead of defaulting every imported institution to
//    stalled_cold.
// 2. Generic mapping — the fuzzy-matched, user-confirmed column mapping
//    from the preview screen, for any other sheet shape. Unmapped columns
//    the user left as "notes" get appended rather than dropped.
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

  const formData = await request.formData();
  const file = formData.get('file');
  const mappingRaw = formData.get('mapping'); // absent/empty for the known-sheet path
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400, headers: corsHeaders() });
  }

  const supabase = getSupabaseServer();
  const { headers, rows } = await parseSpreadsheet(file);

  if (detectKnownSheet(headers)) {
    return commitKnownSheet(supabase, userId, rows);
  }

  if (typeof mappingRaw !== 'string') {
    return NextResponse.json({ error: 'Missing mapping' }, { status: 400, headers: corsHeaders() });
  }
  let mapping: Record<string, ColumnTarget>;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return NextResponse.json({ error: 'Invalid mapping JSON' }, { status: 400, headers: corsHeaders() });
  }
  return commitGenericMapping(supabase, userId, rows, mapping);
}

async function commitGenericMapping(
  supabase: ReturnType<typeof getSupabaseServer>,
  userId: string,
  rows: Record<string, unknown>[],
  mapping: Record<string, ColumnTarget>
) {
  const validRows: Record<string, unknown>[] = [];
  const rowErrors: { row: number; error: string }[] = [];

  rows.forEach((row, idx) => {
    const mapped = applyMapping(row, mapping);
    if (!mapped.name) {
      rowErrors.push({ row: idx + 2, error: 'No value mapped to Name' });
      return;
    }
    const result = createInstitutionSchema.safeParse(mapped);
    if (result.success) {
      validRows.push({ ...result.data, user_id: userId });
    } else {
      rowErrors.push({ row: idx + 2, error: result.error.issues.map((i) => i.message).join('; ') });
    }
  });

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: 'No valid rows found', row_errors: rowErrors },
      { status: 400, headers: corsHeaders() }
    );
  }

  const { data, error } = await supabase
    .from('institutions')
    .upsert(validRows, { onConflict: 'domain', ignoreDuplicates: false })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  return NextResponse.json(
    { imported: data?.length ?? 0, skipped: rowErrors.length, row_errors: rowErrors },
    { status: 200, headers: corsHeaders() }
  );
}

async function commitKnownSheet(
  supabase: ReturnType<typeof getSupabaseServer>,
  userId: string,
  rows: Record<string, unknown>[]
) {
  const rowErrors: { row: number; error: string }[] = [];
  const extractedByDomain = new Map<string, ReturnType<typeof extractKnownSheetRow>>();

  rows.forEach((row, idx) => {
    const extracted = extractKnownSheetRow(row);
    if (!extracted) {
      // Name is required and missing — help identify the row without
      // making them open the spreadsheet by echoing whatever else is there.
      const otherValues = Object.entries(row)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
        .join(', ');
      rowErrors.push({
        row: idx + 2,
        error: otherValues ? `No value found for Name (row has: ${otherValues})` : 'No value found for Name (row appears empty)',
      });
      return;
    }
    // Later rows with the same generated domain overwrite earlier ones in
    // this pass, same as the upsert below — surfaced here as a skip so it
    // isn't silently invisible in the result count.
    if (extractedByDomain.has(extracted.institution.domain)) {
      rowErrors.push({ row: idx + 2, error: `Duplicate institution name maps to an existing row (${extracted.institution.name})` });
    }
    extractedByDomain.set(extracted.institution.domain, extracted);
  });

  const extracted = Array.from(extractedByDomain.values()).filter((r): r is NonNullable<typeof r> => r !== null);
  if (extracted.length === 0) {
    return NextResponse.json(
      { error: 'No valid rows found', row_errors: rowErrors },
      { status: 400, headers: corsHeaders() }
    );
  }

  const institutionRows = extracted.map((r) => ({ ...r.institution, user_id: userId }));
  const { data: institutionData, error: instError } = await supabase
    .from('institutions')
    .upsert(institutionRows, { onConflict: 'domain', ignoreDuplicates: false })
    .select();

  if (instError) {
    return NextResponse.json({ error: instError.message }, { status: 500, headers: corsHeaders() });
  }

  const idByDomain = new Map<string, string>((institutionData ?? []).map((i) => [i.domain, i.id]));

  const interactionRows: Record<string, unknown>[] = [];
  const followupRows: Record<string, unknown>[] = [];

  for (const r of extracted) {
    const institutionId = idByDomain.get(r.institution.domain);
    if (!institutionId) continue;

    for (const interaction of r.interactions) {
      const parsed = createInteractionSchema.safeParse({ ...interaction, institution_id: institutionId });
      if (parsed.success) interactionRows.push({ ...parsed.data, user_id: userId });
    }

    if (r.followup) {
      const parsed = createFollowupTaskSchema.safeParse({ ...r.followup, institution_id: institutionId });
      if (parsed.success) {
        // sync_to_calendar is a request-only flag the live /tasks/followup route
        // uses to decide whether to push a Graph event — it isn't a column on
        // tasks_followups. A historical backfill import shouldn't push calendar
        // events for old "next steps" anyway, so it's omitted here, not synced.
        followupRows.push({
          institution_id: parsed.data.institution_id,
          contact_id: parsed.data.contact_id,
          interaction_id: parsed.data.interaction_id,
          title: parsed.data.title,
          focus_agenda: parsed.data.focus_agenda,
          due_date: parsed.data.due_date,
          user_id: userId,
        });
      }
    }
  }

  if (interactionRows.length > 0) {
    const { error: interError } = await supabase.from('interactions').insert(interactionRows);
    if (interError) {
      return NextResponse.json(
        { error: `Institutions imported, but interactions failed: ${interError.message}` },
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  if (followupRows.length > 0) {
    const { error: taskError } = await supabase.from('tasks_followups').insert(followupRows);
    if (taskError) {
      return NextResponse.json(
        { error: `Institutions and interactions imported, but follow-ups failed: ${taskError.message}` },
        { status: 500, headers: corsHeaders() }
      );
    }
  }

  return NextResponse.json(
    {
      imported: institutionData?.length ?? 0,
      skipped: rowErrors.length,
      row_errors: rowErrors,
      interactionsCreated: interactionRows.length,
      followupsCreated: followupRows.length,
    },
    { status: 200, headers: corsHeaders() }
  );
}
