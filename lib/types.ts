// Hand-written to match supabase/migrations/0001_init.sql exactly.
// If the schema changes, update this file in the same commit as the migration.

export type InstitutionTier = 'tier_1_feeder' | 'tier_2_high_potential' | 'tier_3_standard';
export type InstitutionType =
  | 'international_high_school'
  | 'foreign_school'
  | 'local_high_school'
  | 'university_partner';
export type InteractionChannel =
  | 'email'
  | 'in_person_visit'
  | 'fair_booth'
  | 'virtual_meeting'
  | 'phone_call';
export type RelationshipStatus = 'active_warm' | 'cooling' | 'stalled_cold';
export type TaskStatus = 'pending' | 'completed' | 'cancelled';

export interface User {
  id: string;
  azure_oid: string;
  email: string;
  full_name: string;
  territory: string | null;
  created_at: string;
  updated_at: string;
}

export interface Institution {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  institution_type: InstitutionType;
  tier: InstitutionTier;
  country: string;
  city: string;
  address: string | null;
  curriculum: string | null;
  reengagement_threshold_days: number;
  last_interaction_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Row shape returned by the `institutions_with_health` view — same as
// Institution plus the query-time-computed health_status.
export interface InstitutionWithHealth extends Institution {
  health_status: RelationshipStatus;
}

export interface Contact {
  id: string;
  institution_id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  kakao_id: string | null;
  is_primary: boolean;
  preferences_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  institution_id: string;
  contact_id: string | null;
  user_id: string;
  channel: InteractionChannel;
  subject: string;
  summary: string;
  raw_content: string | null;
  outlook_internet_message_id: string | null;
  materials_shared: string[] | null;
  interaction_date: string;
  created_at: string;
}

export interface TaskFollowup {
  id: string;
  user_id: string;
  institution_id: string;
  contact_id: string | null;
  interaction_id: string | null;
  title: string;
  focus_agenda: string | null;
  due_date: string;
  status: TaskStatus;
  outlook_event_id: string | null;
  is_stalled_reengagement: boolean;
  created_at: string;
  updated_at: string;
}
