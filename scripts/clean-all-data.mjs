// Wipes ALL institutions (and, via ON DELETE CASCADE, their contacts,
// interactions, and follow-up tasks) across every user in this sandbox
// database, so the dashboard starts empty. Meant for re-testing the
// spreadsheet import cleanly on a personal dev sandbox — NOT for a
// shared/production database, where this would nuke every recruiter's data.
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

const { data: institutions, error: fetchErr } = await supabase
  .from('institutions')
  .select('id, name, user_id');

if (fetchErr) throw new Error('fetch failed: ' + fetchErr.message);

if (!institutions || institutions.length === 0) {
  console.log('Nothing to clean — institutions table is already empty.');
  process.exit(0);
}

console.log(`Deleting ${institutions.length} institutions (cascades to contacts/interactions/follow-ups):`);
for (const inst of institutions) console.log(`  - ${inst.name} (user ${inst.user_id})`);

const { error: deleteErr } = await supabase
  .from('institutions')
  .delete()
  .not('id', 'is', null); // delete-all guard: Supabase requires an explicit filter

if (deleteErr) throw new Error('delete failed: ' + deleteErr.message);

console.log('Done. Dashboard is now empty and ready for a clean import test.');
