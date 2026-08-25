// Fuzzy column-name matching for the "legacy spreadsheet" institution import.
//
// A client's own sheet almost never uses our schema's field names verbatim
// (e.g. a partner-tracking sample sheet might have "Name (University or
// School)", not "name"). This maps arbitrary header text to our known fields by alias
// first, then loose token/substring similarity, always below user
// confirmation — never auto-committed without review.

export const IMPORT_FIELDS = [
  'name',
  'domain',
  'institution_type',
  'tier',
  'country',
  'city',
  'address',
  'curriculum',
  'ownership_type',
  'partnership_finalized',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

// A mapped column's target: one of our known fields, "notes" (append this
// column's value into the free-text notes field instead of dropping it),
// or "ignore" (deliberately discarded).
export type ColumnTarget = ImportField | 'notes' | 'ignore';

const ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'schoolname', 'institutionname', 'nameuniversityorschool', 'university', 'school', 'organization'],
  domain: ['domain', 'emaildomain', 'website', 'websitedomain'],
  institution_type: ['type', 'typeofschool', 'institutiontype', 'schooltype', 'category'],
  tier: ['tier', 'priority', 'ranking'],
  country: ['country', 'nation'],
  city: ['city', 'location', 'town'],
  address: ['address', 'streetaddress', 'fulladdress'],
  curriculum: ['curriculum', 'program', 'programs'],
  ownership_type: ['ownership', 'ownershiptype', 'publicorprivate', 'publicprivate'],
  partnership_finalized: ['partnershipfinalized', 'partnershipstatus', 'finalized', 'partnered'],
};

const FIELD_LABELS: Record<ImportField, string> = {
  name: 'Name',
  domain: 'Domain (auto-generated if unmapped)',
  institution_type: 'Institution Type',
  tier: 'Tier',
  country: 'Country',
  city: 'City',
  address: 'Address',
  curriculum: 'Curriculum',
  ownership_type: 'Ownership Type',
  partnership_finalized: 'Partnership Finalized',
};

export function fieldLabel(field: ColumnTarget): string {
  if (field === 'notes') return 'Notes (append)';
  if (field === 'ignore') return 'Ignore';
  return FIELD_LABELS[field];
}

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Cheap token-overlap similarity: fraction of the shorter normalized
// string's characters found as a contiguous run in the longer one. Good
// enough to catch "School Name" vs "name" without a real Levenshtein impl.
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter)) return shorter.length / longer.length;
  return 0;
}

export interface ColumnSuggestion {
  header: string;
  suggestedField: ColumnTarget;
  confidence: 'exact' | 'fuzzy' | 'none';
}

export function suggestMapping(headers: string[]): ColumnSuggestion[] {
  const used = new Set<ImportField>();

  return headers.map((header) => {
    const norm = normalize(header);

    for (const field of IMPORT_FIELDS) {
      if (used.has(field)) continue;
      if (ALIASES[field].some((alias) => normalize(alias) === norm)) {
        used.add(field);
        return { header, suggestedField: field, confidence: 'exact' as const };
      }
    }

    let best: { field: ImportField; score: number } | null = null;
    for (const field of IMPORT_FIELDS) {
      if (used.has(field)) continue;
      for (const alias of ALIASES[field]) {
        const score = similarity(norm, normalize(alias));
        if (score >= 0.6 && (!best || score > best.score)) {
          best = { field, score };
        }
      }
    }
    if (best) {
      used.add(best.field);
      return { header, suggestedField: best.field, confidence: 'fuzzy' as const };
    }

    // Unrecognized column: default to appending it into notes rather than
    // silently dropping it. The user can still switch it to "ignore".
    return { header, suggestedField: 'notes' as const, confidence: 'none' as const };
  });
}

function slugDomain(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '.placeholder'
  );
}

const TIER_VALUES = new Set(['tier_1_feeder', 'tier_2_high_potential', 'tier_3_standard']);
const TYPE_VALUES = new Set(['international_high_school', 'foreign_school', 'local_high_school', 'university_partner']);

function coerceEnum(raw: string, allowed: Set<string>): string | undefined {
  const norm = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (allowed.has(norm)) return norm;
  // Loose keyword fallback for common free-text values.
  if (allowed === TYPE_VALUES) {
    if (norm.includes('university')) return 'university_partner';
    if (norm.includes('international')) return 'international_high_school';
    if (norm.includes('foreign')) return 'foreign_school';
    if (norm.includes('local')) return 'local_high_school';
  }
  return undefined;
}

// Applies a confirmed header -> target mapping to one parsed spreadsheet
// row, producing the shape createInstitutionSchema expects. Missing
// required fields (name/domain/city) are backfilled with sane defaults
// rather than rejecting the row outright — city truly is optional in a
// legacy sheet even though our schema requires it.
export function applyMapping(
  row: Record<string, unknown>,
  mapping: Record<string, ColumnTarget>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const notesParts: string[] = [];

  for (const [header, target] of Object.entries(mapping)) {
    const raw = row[header];
    const value = raw == null ? '' : String(raw).trim();
    if (!value) continue;

    if (target === 'ignore') continue;
    if (target === 'notes') {
      notesParts.push(`${header}: ${value}`);
      continue;
    }
    if (target === 'partnership_finalized') {
      out[target] = /^(true|yes|1|y)$/i.test(value);
      continue;
    }
    if (target === 'tier') {
      const coerced = coerceEnum(value, TIER_VALUES);
      if (coerced) out[target] = coerced;
      continue;
    }
    if (target === 'institution_type') {
      const coerced = coerceEnum(value, TYPE_VALUES);
      if (coerced) out[target] = coerced;
      continue;
    }
    if (target === 'ownership_type') {
      const norm = value.toLowerCase();
      if (norm.startsWith('pub')) out[target] = 'public';
      else if (norm.startsWith('priv')) out[target] = 'private';
      continue;
    }
    out[target] = value;
  }

  if (!out.name) return out; // unusable row; caller will surface a validation error
  if (!out.domain) out.domain = slugDomain(String(out.name));
  if (!out.city) out.city = 'Unknown';
  if (notesParts.length) {
    out.notes = out.notes ? `${out.notes} | ${notesParts.join(' | ')}` : notesParts.join(' | ');
  }

  return out;
}
