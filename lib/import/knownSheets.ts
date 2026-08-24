// Named import path for Julian's actual "Korea Interactions" partner sheet.
//
// Unlike the generic fuzzy mapper (mapping.ts), this isn't guessing — we
// have his real file and know its exact headers (see the original
// scripts/seed-client-sample.mjs, which this ports into a real upload
// path). When his sheet's shape is detected, columns map exactly and his
// "Last Meeting" / "Last Contact" / "Next Steps" columns become real
// interaction and follow-up rows instead of flattened notes text — which
// also means last_interaction_at gets set (via the DB trigger on insert),
// so imported institutions read their true health status on day one
// instead of defaulting to stalled_cold.

const H = {
  name: 'Name (University or School)',
  type: 'Type of School',
  collaboration: 'Type of Collaboration/History',
  programs: "University's Program(s) to highlight",
  recentActivity: 'Recent Activity (Exchange Students, StudyUSA, F1, etc.)',
  ownership: 'Public or Private',
  partnershipFinalized: 'Partnership Finalized?',
  city: 'City',
  address: 'Address',
  lastMeetingDetails: 'Last Meeting Details',
  lastMeetingDate: 'Last Meeting Dates',
  lastContactDetails: 'Last Contact Details',
  lastContactDate: 'Last Contact Date',
  nextMeetingDetails: 'Next Meeting Details',
  nextMeetingDate: 'Next Meeting Date',
  nextStepsDate: 'Next Steps Date',
  nextStepsComments: 'Next Steps or Comments',
} as const;

// A handful of his headers are enough to recognize the sheet; we don't
// require every column present (he may trim or reorder columns).
const SIGNATURE_HEADERS = [H.name, H.lastMeetingDetails, H.lastContactDetails];

export function detectKnownSheet(headers: string[]): 'julian-partner-interactions' | null {
  const set = new Set(headers.map((h) => h.trim()));
  const hits = SIGNATURE_HEADERS.filter((h) => set.has(h)).length;
  return hits >= 2 ? 'julian-partner-interactions' : null;
}

const KNOWN_HEADERS = new Set<string>(Object.values(H));

// Any column in the uploaded file that isn't one of our known headers —
// surfaced so "does every field get captured" has a real answer per
// import, not a one-time comparison against a script that might drift.
export function unrecognizedColumns(headers: string[]): string[] {
  return headers.map((h) => h.trim()).filter((h) => h && !KNOWN_HEADERS.has(h));
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function slugDomain(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '.placeholder'
  );
}

function toIsoDate(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export interface ExtractedInteraction {
  channel: 'email' | 'in_person_visit' | 'fair_booth' | 'virtual_meeting' | 'phone_call';
  subject: string;
  summary: string;
  raw_content: string;
  interaction_date: string;
}

export interface ExtractedRow {
  institution: {
    name: string;
    domain: string;
    institution_type: string;
    tier: string;
    country: string;
    city: string;
    address: string | null;
    ownership_type: 'public' | 'private' | null;
    partnership_finalized: boolean;
    notes: string | null;
  };
  interactions: ExtractedInteraction[];
  followup: { title: string; focus_agenda: string | null; due_date: string } | null;
}

export function extractKnownSheetRow(row: Record<string, unknown>): ExtractedRow | null {
  const name = clean(row[H.name]);
  if (!name) return null;

  const notesParts: string[] = [];
  if (clean(row[H.collaboration])) notesParts.push(`Collaboration: ${clean(row[H.collaboration])}`);
  if (clean(row[H.programs])) notesParts.push(`Programs: ${clean(row[H.programs])}`);
  if (clean(row[H.recentActivity])) notesParts.push(`Recent activity: ${clean(row[H.recentActivity])}`);

  const ownershipRaw = clean(row[H.ownership])?.toLowerCase() ?? null;
  const ownership_type: 'public' | 'private' | null =
    ownershipRaw?.startsWith('pub') ? 'public' : ownershipRaw?.startsWith('priv') ? 'private' : null;

  const institution: ExtractedRow['institution'] = {
    name,
    domain: slugDomain(name),
    institution_type: clean(row[H.type]) === 'University' ? 'university_partner' : 'international_high_school',
    tier: 'tier_2_high_potential',
    country: 'South Korea',
    city: clean(row[H.city]) ?? 'Unknown',
    address: clean(row[H.address]),
    ownership_type,
    partnership_finalized: /^yes$/i.test(clean(row[H.partnershipFinalized]) ?? ''),
    notes: notesParts.length ? notesParts.join(' | ') : null,
  };

  const interactions: ExtractedInteraction[] = [];

  const meetingDetails = clean(row[H.lastMeetingDetails]);
  const meetingDate = toIsoDate(row[H.lastMeetingDate]);
  if (meetingDetails && meetingDate) {
    interactions.push({
      channel: 'in_person_visit',
      subject: `Meeting — ${name}`,
      summary: meetingDetails.slice(0, 500),
      raw_content: meetingDetails,
      interaction_date: meetingDate,
    });
  }

  const contactDetails = clean(row[H.lastContactDetails]);
  const contactDate = toIsoDate(row[H.lastContactDate]);
  if (contactDetails && contactDate) {
    interactions.push({
      channel: 'email',
      subject: `Contact — ${name}`,
      summary: contactDetails.slice(0, 500),
      raw_content: contactDetails,
      interaction_date: contactDate,
    });
  }

  const dueDate = toIsoDate(row[H.nextStepsDate]) ?? toIsoDate(row[H.nextMeetingDate]);
  const followup = dueDate
    ? {
        title: (clean(row[H.nextMeetingDetails]) ?? 'Follow up').slice(0, 255),
        focus_agenda: clean(row[H.nextStepsComments]),
        due_date: dueDate,
      }
    : null;

  return { institution, interactions, followup };
}
