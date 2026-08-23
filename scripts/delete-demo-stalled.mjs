// Removes the [DEMO] institution created by seed-demo-stalled.mjs, plus its
// cascading contacts/interactions/tasks.
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

const { data: institutions } = await supabase
  .from('institutions')
  .select('id, name')
  .ilike('name', '[DEMO]%');

const ids = (institutions ?? []).map((i) => i.id);
if (ids.length === 0) {
  console.log('No demo institutions found.');
  process.exit(0);
}

await supabase.from('tasks_followups').delete().in('institution_id', ids);
await supabase.from('interactions').delete().in('institution_id', ids);
await supabase.from('contacts').delete().in('institution_id', ids);
await supabase.from('institutions').delete().in('id', ids);

console.log(`Deleted ${ids.length} demo institution(s): ${institutions.map((i) => i.name).join(', ')}`);
