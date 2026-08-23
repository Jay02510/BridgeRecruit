import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { corsHeaders } from '@/lib/cors';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const CSV_COLUMNS = [
  'name',
  'domain',
  'institution_type',
  'tier',
  'country',
  'city',
  'curriculum',
  'ownership_type',
  'partnership_finalized',
  'pipeline_stage',
  'health_status',
  'last_interaction_at',
] as const;

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// GET /api/v1/institutions/export
//
// FR-5.3 CSV export "for university executive reporting" — 1-click download
// of the full institution directory.
export async function GET(request: NextRequest) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('institutions_with_health')
    .select(CSV_COLUMNS.join(','))
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const lines = [
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((col) => toCsvValue(row[col])).join(',')),
  ];

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="institutions.csv"',
    },
  });
}
