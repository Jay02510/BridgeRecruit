import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ExcelJS from 'exceljs';

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

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.placeholder';
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

async function main() {
  const xlsxPath = path.join(process.env.HOME, 'Desktop', 'TalkFile_Julian_Partner Interactions-sample.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const ws = workbook.getWorksheet('Korea Interactions');

  const headerRow = ws.getRow(1).values; // 1-indexed, [0] empty
  const headers = headerRow.slice(1);

  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    if (!values[0]) return;
    const obj = {};
    headers.forEach((h, i) => {
      let v = values[i];
      if (v && typeof v === 'object' && v.text) v = v.text;
      if (v instanceof Date) v = v.toISOString();
      obj[h] = v;
    });
    rows.push(obj);
  });

  console.log(`Parsed ${rows.length} institution rows from xlsx.`);

  const instIds = {};
  const instRecords = rows.map((d) => {
    const id = crypto.randomUUID();
    instIds[d['Name (University or School)']] = id;
    const itype = d['Type of School'] === 'University' ? 'university_partner' : 'international_high_school';
    const notesParts = [];
    if (clean(d['Type of Collaboration/History'])) notesParts.push(`Collaboration: ${clean(d['Type of Collaboration/History'])}`);
    if (clean(d["University's Program(s) to highlight"])) notesParts.push(`Programs: ${clean(d["University's Program(s) to highlight"])}`);
    if (clean(d['Recent Activity (Exchange Students, StudyUSA, F1, etc.)'])) notesParts.push(`Recent activity: ${clean(d['Recent Activity (Exchange Students, StudyUSA, F1, etc.)'])}`);
    return {
      id,
      user_id: DEV_USER_ID,
      name: clean(d['Name (University or School)']),
      domain: slug(d['Name (University or School)']),
      institution_type: itype,
      tier: 'tier_2_high_potential',
      country: 'South Korea',
      city: clean(d['City']) ?? 'Unknown',
      address: clean(d['Address']),
      notes: notesParts.length ? notesParts.join(' | ') : null,
    };
  });

  const { error: instErr } = await supabase.from('institutions').insert(instRecords);
  if (instErr) throw new Error('institutions insert failed: ' + instErr.message);
  console.log(`Inserted ${instRecords.length} institutions.`);

  const brianId = crypto.randomUUID();
  const { error: contactErr } = await supabase.from('contacts').insert([{
    id: brianId,
    institution_id: instIds['Busan Dong-A University'],
    name: 'Brian Kay',
    email: `unknown@${slug('Busan Dong-A University')}`,
    title: 'International Affairs Coordinator',
    is_primary: true,
  }]);
  if (contactErr) throw new Error('contacts insert failed: ' + contactErr.message);
  console.log('Inserted 1 contact (Brian Kay).');

  const interactionRecords = [];
  for (const d of rows) {
    const name = clean(d['Name (University or School)']);
    const iid = instIds[name];
    const contactId = name === 'Busan Dong-A University' ? brianId : null;

    const meeting = clean(d['Last Meeting Details']);
    if (meeting && d['Last Meeting Dates']) {
      interactionRecords.push({
        institution_id: iid,
        contact_id: contactId,
        user_id: DEV_USER_ID,
        channel: 'in_person_visit',
        subject: `Meeting - ${name}`,
        summary: meeting.slice(0, 500),
        raw_content: meeting,
        interaction_date: d['Last Meeting Dates'],
      });
    }

    const contactNote = clean(d['Last Contact Details']);
    if (contactNote && d['Last Contact Date']) {
      interactionRecords.push({
        institution_id: iid,
        contact_id: contactId,
        user_id: DEV_USER_ID,
        channel: 'email',
        subject: `Contact - ${name}`,
        summary: contactNote.slice(0, 500),
        raw_content: contactNote,
        interaction_date: d['Last Contact Date'],
      });
    }
  }
  const { error: interErr } = await supabase.from('interactions').insert(interactionRecords);
  if (interErr) throw new Error('interactions insert failed: ' + interErr.message);
  console.log(`Inserted ${interactionRecords.length} interactions.`);

  const taskRecords = [];
  for (const d of rows) {
    const name = clean(d['Name (University or School)']);
    const iid = instIds[name];
    const contactId = name === 'Busan Dong-A University' ? brianId : null;
    const due = d['Next Steps Date'] || d['Next Meeting Date'];
    if (!due) continue;
    const title = clean(d['Next Meeting Details']) || 'Follow up';
    taskRecords.push({
      user_id: DEV_USER_ID,
      institution_id: iid,
      contact_id: contactId,
      title: title.slice(0, 255),
      focus_agenda: clean(d['Next Steps or Comments']),
      due_date: due,
    });
  }
  const { error: taskErr } = await supabase.from('tasks_followups').insert(taskRecords);
  if (taskErr) throw new Error('tasks_followups insert failed: ' + taskErr.message);
  console.log(`Inserted ${taskRecords.length} tasks_followups.`);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
