import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createInstitutionSchema } from '@/lib/api-types';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { resolveUserId } from '@/lib/auth/resolveUser';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/institutions/import
//
// FR-5.3 "1-click import from legacy Excel sheets" — accepts CSV text
// (export from Excel), upserts institutions by domain scoped to the
// signed-in recruiter. Malformed rows are skipped and reported, not
// silently dropped or aborting the whole import.
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

  const csvText = await request.text();
  if (!csvText.trim()) {
    return NextResponse.json({ error: 'Empty CSV body' }, { status: 400, headers: corsHeaders() });
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const validRows: Record<string, unknown>[] = [];
  const rowErrors: { row: number; error: string }[] = [];

  parsed.data.forEach((row, idx) => {
    const result = createInstitutionSchema.safeParse({
      name: row.name,
      domain: row.domain,
      institution_type: row.institution_type || undefined,
      tier: row.tier || undefined,
      country: row.country || undefined,
      city: row.city,
      curriculum: row.curriculum || undefined,
    });
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

  const supabase = getSupabaseServer();
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
