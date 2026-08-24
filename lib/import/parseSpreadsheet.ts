import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

function cellText(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return (value as { text: unknown }).text;
  }
  if (value && typeof value === 'object' && 'result' in (value as Record<string, unknown>)) {
    return (value as { result: unknown }).result; // formula cell
  }
  return value;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedSpreadsheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headerValues = ws.getRow(1).values as unknown[];
  const headers = headerValues.slice(1).map((h) => String(cellText(h) ?? '').trim()).filter(Boolean);

  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (!values.some((v) => v != null && String(v).trim() !== '')) return;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = cellText(values[i]);
    });
    rows.push(obj);
  });

  return { headers, rows };
}

function parseCsv(text: string): ParsedSpreadsheet {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  return { headers, rows: parsed.data };
}

export async function parseSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.type.includes('sheet');
  if (isXlsx) {
    const buffer = await file.arrayBuffer();
    return parseXlsx(buffer);
  }
  const text = await file.text();
  return parseCsv(text);
}
