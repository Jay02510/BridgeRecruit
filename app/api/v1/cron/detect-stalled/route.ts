import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { detectStalledPartnerships } from '@/lib/stall-detection/detect-stalled';

// GET /api/v1/cron/detect-stalled
//
// Phase 7: nightly stall/ghosting detection (Vercel Cron — see vercel.json).
// For every stalled institution (tier-aware decay-score threshold exceeded)
// with no existing pending stalled-reengagement task, creates one — this is
// what feeds the "Needs Attention" queue's underlying data, not the queue's
// query itself (that still reads health_status directly, per the plan, to
// avoid two sources of truth for the same UI).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  const { data: users, error: usersError } = await supabase.from('users').select('id');
  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const user of users ?? []) {
    try {
      const stalled = await detectStalledPartnerships(user.id);

      for (const inst of stalled) {
        const { data: existing } = await supabase
          .from('tasks_followups')
          .select('id')
          .eq('institution_id', inst.id)
          .eq('is_stalled_reengagement', true)
          .eq('status', 'pending')
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { error: insertError } = await supabase.from('tasks_followups').insert({
          user_id: user.id,
          institution_id: inst.id,
          contact_id: inst.primary_contact_id,
          title: `Re-engage: ${inst.name}`,
          focus_agenda: `${inst.days_inactive} days inactive (decay score ${inst.decay_score}). No reply from ${inst.primary_contact_name}.`,
          due_date: new Date().toISOString(),
          is_stalled_reengagement: true,
        });

        if (insertError) {
          errors.push(`${inst.name}: ${insertError.message}`);
        } else {
          created++;
        }
      }
    } catch (err) {
      errors.push(`user ${user.id}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ created, skipped, errors }, { status: 200 });
}
