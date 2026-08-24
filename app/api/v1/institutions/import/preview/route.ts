import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { corsHeaders } from '@/lib/cors';
import { parseSpreadsheet } from '@/lib/import/parseSpreadsheet';
import { suggestMapping } from '@/lib/import/mapping';
import { detectKnownSheet, extractKnownSheetRow, unrecognizedColumns } from '@/lib/import/knownSheets';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// POST /api/v1/institutions/import/preview
//
// Step 1 of the legacy-spreadsheet import: accepts any .xlsx/.csv, does not
// write anything. Returns a fuzzy-matched column -> field mapping suggestion
// plus a row sample, so the dashboard can show a confirmation screen before
// any data is committed (FR-5.3, extended beyond the exact-header importer
// to handle a client's own sheet shape).
export async function POST(request: NextRequest) {
  try {
    await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401, headers: corsHeaders() });
    }
    throw err;
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400, headers: corsHeaders() });
  }

  const { headers, rows } = await parseSpreadsheet(file);
  if (headers.length === 0) {
    return NextResponse.json({ error: 'Could not read any columns from this file' }, { status: 400, headers: corsHeaders() });
  }

  const recognizedFormat = detectKnownSheet(headers);

  if (recognizedFormat) {
    const extracted = rows.map(extractKnownSheetRow).filter((r): r is NonNullable<typeof r> => r !== null);
    return NextResponse.json(
      {
        recognizedFormat,
        rowCount: rows.length,
        institutionCount: extracted.length,
        interactionCount: extracted.reduce((sum, r) => sum + r.interactions.length, 0),
        followupCount: extracted.filter((r) => r.followup).length,
        sampleInstitutionNames: extracted.slice(0, 5).map((r) => r.institution.name),
        unrecognizedColumns: unrecognizedColumns(headers),
      },
      { status: 200, headers: corsHeaders() }
    );
  }

  const columns = suggestMapping(headers);

  return NextResponse.json(
    {
      recognizedFormat: null,
      columns,
      rowCount: rows.length,
      sampleRows: rows.slice(0, 3),
    },
    { status: 200, headers: corsHeaders() }
  );
}
