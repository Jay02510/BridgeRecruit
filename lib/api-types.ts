import { z } from 'zod';

// Zod's built-in z.uuid()/.uuid() enforces RFC-4122 version/variant nibbles
// (e.g. rejects "10000000-0000-0000-0000-000000000002"). Postgres's UUID
// column type does not enforce that, and our seed data uses readable
// non-v4-shaped UUIDs for predictability. Real rows created via
// uuid_generate_v4() are properly v4-shaped anyway, so this relaxed check
// (any UUID-shaped string) covers both without false-rejecting seed data.
const uuid = () =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');

// ============================================================================
// GET /api/v1/institutions/lookup
// ============================================================================
export const institutionLookupQuerySchema = z.object({
  domain: z.string().min(1, 'domain is required'),
  email: z.string().email().optional(),
});
export type InstitutionLookupQuery = z.infer<typeof institutionLookupQuerySchema>;

// ============================================================================
// POST /api/v1/interactions
// ============================================================================
export const createInteractionSchema = z.object({
  institution_id: uuid(),
  contact_id: uuid().nullable().optional(),
  channel: z.enum(['email', 'in_person_visit', 'fair_booth', 'virtual_meeting', 'phone_call']),
  subject: z.string().min(1),
  summary: z.string().min(1),
  raw_content: z.string().nullable().optional(),
  outlook_internet_message_id: z.string().nullable().optional(),
  materials_shared: z.array(z.string()).nullable().optional(),
  interaction_date: z.string().datetime().optional(), // defaults to now() in DB if omitted
});
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;

// ============================================================================
// POST /api/v1/tasks/followup
// ============================================================================
export const createFollowupTaskSchema = z.object({
  institution_id: uuid(),
  contact_id: uuid().nullable().optional(),
  interaction_id: uuid().nullable().optional(),
  title: z.string().min(1),
  focus_agenda: z.string().nullable().optional(),
  due_date: z.string().datetime(),
  sync_to_calendar: z.boolean().optional().default(false), // Graph push wired in Phase 4
});
export type CreateFollowupTaskInput = z.infer<typeof createFollowupTaskSchema>;

// ============================================================================
// POST /api/v1/institutions (unmatched-domain quick-create, used by Phase 4)
// ============================================================================
export const createInstitutionSchema = z.object({
  user_id: uuid(),
  name: z.string().min(1),
  domain: z.string().min(1),
  institution_type: z
    .enum(['international_high_school', 'foreign_school', 'local_high_school', 'university_partner'])
    .default('international_high_school'),
  tier: z
    .enum(['tier_1_feeder', 'tier_2_high_potential', 'tier_3_standard'])
    .default('tier_2_high_potential'),
  country: z.string().default('South Korea'),
  city: z.string().min(1),
  curriculum: z.string().nullable().optional(),
});
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
