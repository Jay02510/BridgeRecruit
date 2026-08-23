// DEMO ONLY — adds one clearly-fake, deliberately stalled institution so
// "Needs Attention" has something to show in a live client demo. Real
// client data has nothing past the 30-day stalled_cold threshold yet, and
// backdating a real institution's history to fake it would misrepresent
// actual client data. Run before a demo, delete after with
// `node scripts/delete-demo-stalled.mjs`.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnv() {
  const raw = readFileSync(path.join(projectRoot, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

const { data: inst, error: instErr } = await supabase
  .from('institutions')
  .insert({
    user_id: DEV_USER_ID,
    name: '[DEMO] Gangnam Prep Academy',
    domain: 'demo-gangnam-prep.placeholder',
    institution_type: 'international_high_school',
    tier: 'tier_1_feeder',
    country: 'South Korea',
    city: 'Seoul',
    last_interaction_at: fortyDaysAgo,
  })
  .select()
  .single();
if (instErr) throw new Error(instErr.message);

const { error: contactErr } = await supabase.from('contacts').insert({
  institution_id: inst.id,
  name: 'Demo Counselor',
  email: 'demo@demo-gangnam-prep.placeholder',
  title: 'Head of College Counseling',
  is_primary: true,
  preferences_notes: 'Interested in STEM scholarships; prefers email over calls.',
});
if (contactErr) throw new Error(contactErr.message);

const { error: interErr } = await supabase.from('interactions').insert({
  institution_id: inst.id,
  user_id: DEV_USER_ID,
  channel: 'email',
  subject: 'Initial outreach',
  summary: 'Introduced the program, counselor expressed interest in STEM scholarships.',
  interaction_date: fortyDaysAgo,
});
if (interErr) throw new Error(interErr.message);

console.log(`Created demo stalled institution: ${inst.name} (${inst.id})`);
console.log('Run `node scripts/delete-demo-stalled.mjs` to remove it after the demo.');
