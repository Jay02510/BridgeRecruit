import { getSupabaseServer } from '@/lib/supabase/server';

// Ported from the PRD's `detectStalledPartnerships`. Deviation (flagged,
// not silent): the PRD's version reads a per-institution
// reengagement_threshold_days column, but nothing in the app ever sets it
// (it sits at the DB default of 14 for every institution regardless of
// tier), so a Tier 1 school wouldn't flag until day 14 instead of day 10,
// and Tier 3 would falsely flag at day 14 instead of waiting until day 30.
// This version derives the threshold from tier directly every run instead,
// per the PRD's own stated business rules — it can't drift out of sync
// with a column nothing populates.
const TIER_RULES: Record<string, { thresholdDays: number; weight: number }> = {
  tier_1_feeder: { thresholdDays: 10, weight: 1.5 },
  tier_2_high_potential: { thresholdDays: 18, weight: 1.0 },
  tier_3_standard: { thresholdDays: 30, weight: 0.7 },
};

export interface DormantInstitution {
  id: string;
  name: string;
  tier: string;
  primary_contact_id: string | null;
  primary_contact_name: string;
  primary_contact_email: string;
  days_inactive: number;
  decay_score: number;
}

export async function detectStalledPartnerships(userId: string): Promise<DormantInstitution[]> {
  const supabase = getSupabaseServer();

  const { data: institutions, error } = await supabase
    .from('institutions')
    .select('id, name, tier, last_interaction_at, contacts (id, name, email, is_primary)')
    .eq('user_id', userId);

  if (error || !institutions) {
    throw new Error(error?.message || 'Failed to fetch accounts');
  }

  const now = Date.now();
  const stalledList: DormantInstitution[] = [];

  for (const inst of institutions) {
    const rules = TIER_RULES[inst.tier] ?? TIER_RULES.tier_2_high_potential;
    const lastDate = inst.last_interaction_at ? new Date(inst.last_interaction_at).getTime() : 0;
    const daysInactive = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (daysInactive >= rules.thresholdDays) {
      const contacts = Array.isArray(inst.contacts) ? inst.contacts : [];
      const primaryContact = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
      const decayScore = Math.round(daysInactive * rules.weight);

      stalledList.push({
        id: inst.id,
        name: inst.name,
        tier: inst.tier,
        primary_contact_id: primaryContact?.id ?? null,
        primary_contact_name: primaryContact?.name ?? 'Counseling Office',
        primary_contact_email: primaryContact?.email ?? '',
        days_inactive: daysInactive,
        decay_score: decayScore,
      });
    }
  }

  return stalledList.sort((a, b) => b.decay_score - a.decay_score);
}
