/* global Office, document */

const API_BASE_URL = 'https://localhost:3000';

interface LookupResponse {
  matched: boolean;
  institution: {
    id: string;
    name: string;
    tier: string;
    city: string;
    country: string;
    health_status: string;
  } | null;
  contact: { id: string; name: string; email: string; title: string | null } | null;
  recent_interactions: { subject: string; summary: string; interaction_date: string }[];
}

let accessToken: string | null = null;
let senderDomain = '';
let emailSubject = '';
let currentInstitutionId: string | null = null;
let currentContactId: string | null = null;

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

function setStatus(text: string) {
  document.getElementById('status')!.textContent = text;
}

// ---------------------------------------------------------------------------
// Quick-create (FR-1.1): shown when the sender's domain has no match.
// ---------------------------------------------------------------------------
function renderQuickCreateForm() {
  const cardEl = document.getElementById('school-card')!;
  const guessedName = senderDomain.split('.')[0].replace(/-/g, ' ');
  cardEl.style.display = 'block';
  cardEl.innerHTML = `
    <p>No institution found for <strong>${senderDomain}</strong>.</p>
    <form id="quick-create-form">
      <label>Name<br/><input type="text" id="qc-name" value="${guessedName}" required /></label><br/>
      <label>City<br/><input type="text" id="qc-city" required /></label><br/>
      <label>Type<br/>
        <select id="qc-type">
          <option value="international_high_school">International high school</option>
          <option value="foreign_school">Foreign school</option>
          <option value="local_high_school">Local high school</option>
          <option value="university_partner">University partner</option>
        </select>
      </label><br/>
      <label>Tier<br/>
        <select id="qc-tier">
          <option value="tier_1_feeder">Tier 1 (feeder)</option>
          <option value="tier_2_high_potential" selected>Tier 2 (high potential)</option>
          <option value="tier_3_standard">Tier 3 (standard)</option>
        </select>
      </label><br/>
      <button type="submit">Add New Institution</button>
    </form>
  `;
  document.getElementById('quick-create-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('Creating institution…');
    const name = (document.getElementById('qc-name') as HTMLInputElement).value;
    const city = (document.getElementById('qc-city') as HTMLInputElement).value;
    const institution_type = (document.getElementById('qc-type') as HTMLSelectElement).value;
    const tier = (document.getElementById('qc-tier') as HTMLSelectElement).value;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/institutions`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, domain: senderDomain, city, institution_type, tier }),
      });
      if (!res.ok) {
        setStatus(`Create failed (${res.status}).`);
        return;
      }
      setStatus('Institution created.');
      await lookupInstitution();
    } catch (err) {
      setStatus(`Create error: ${String(err)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Quick actions (FR-2.1, FR-2.2, FR-3.1): shown when matched.
// ---------------------------------------------------------------------------
function renderQuickActions() {
  const actionsEl = document.getElementById('quick-actions')!;
  actionsEl.style.display = 'block';
  actionsEl.innerHTML = `
    <button id="log-email-btn">Log Email Touchpoint</button>
    <button id="log-visit-btn">Log Visit / Meeting</button>
    <button id="followup-btn">Set Follow-Up</button>
    <div id="action-panel"></div>
  `;
  document.getElementById('log-email-btn')!.addEventListener('click', renderLogEmailPanel);
  document.getElementById('log-visit-btn')!.addEventListener('click', renderLogVisitPanel);
  document.getElementById('followup-btn')!.addEventListener('click', renderFollowupPanel);
}

function renderLogEmailPanel() {
  const panel = document.getElementById('action-panel')!;
  panel.innerHTML = `
    <form id="log-email-form">
      <label>Summary (AI auto-summary is stubbed until Phase 5 — enter manually for now)<br/>
        <textarea id="email-summary" rows="3" required></textarea>
      </label><br/>
      <button type="submit">Save</button>
    </form>
  `;
  document.getElementById('log-email-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const summary = (document.getElementById('email-summary') as HTMLTextAreaElement).value;
    await postInteraction({
      channel: 'email',
      subject: emailSubject || 'Email touchpoint',
      summary,
      raw_content: summary,
    });
  });
}

function renderLogVisitPanel() {
  const panel = document.getElementById('action-panel')!;
  panel.innerHTML = `
    <form id="log-visit-form">
      <label>Channel<br/>
        <select id="visit-channel">
          <option value="in_person_visit">In-person visit</option>
          <option value="fair_booth">Fair / booth</option>
          <option value="virtual_meeting">Virtual meeting</option>
          <option value="phone_call">Phone call</option>
        </select>
      </label><br/>
      <label>Discussion notes<br/>
        <textarea id="visit-notes" rows="3" required></textarea>
      </label><br/>
      <label>Materials shared (comma-separated)<br/>
        <input type="text" id="visit-materials" />
      </label><br/>
      <button type="submit">Save</button>
    </form>
  `;
  document.getElementById('log-visit-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const channel = (document.getElementById('visit-channel') as HTMLSelectElement).value;
    const notes = (document.getElementById('visit-notes') as HTMLTextAreaElement).value;
    const materialsRaw = (document.getElementById('visit-materials') as HTMLInputElement).value;
    const materials_shared = materialsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await postInteraction({
      channel,
      subject: `${channel.replace(/_/g, ' ')} — ${new Date().toLocaleDateString()}`,
      summary: notes,
      raw_content: notes,
      materials_shared: materials_shared.length ? materials_shared : undefined,
    });
  });
}

function renderFollowupPanel() {
  const panel = document.getElementById('action-panel')!;
  panel.innerHTML = `
    <form id="followup-form">
      <label>Focus / agenda<br/>
        <textarea id="followup-agenda" rows="2" required></textarea>
      </label><br/>
      <label>Due<br/>
        <select id="followup-preset">
          <option value="3">In 3 days</option>
          <option value="7">In 1 week</option>
          <option value="14">In 2 weeks</option>
        </select>
      </label><br/>
      <label><input type="checkbox" id="followup-sync" checked /> Sync to Outlook Calendar</label><br/>
      <button type="submit">Create Follow-Up Action</button>
    </form>
  `;
  document.getElementById('followup-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const agenda = (document.getElementById('followup-agenda') as HTMLTextAreaElement).value;
    const days = Number((document.getElementById('followup-preset') as HTMLSelectElement).value);
    const sync = (document.getElementById('followup-sync') as HTMLInputElement).checked;
    const dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    setStatus('Creating follow-up…');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/tasks/followup`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          institution_id: currentInstitutionId,
          contact_id: currentContactId,
          title: `Follow up — ${emailSubject || 'BridgeRecruit'}`,
          focus_agenda: agenda,
          due_date: dueDate.toISOString(),
          sync_to_calendar: sync,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Follow-up failed (${res.status}).`);
        return;
      }
      setStatus(
        sync
          ? `Follow-up created (calendar: ${data.calendar_sync ?? 'unknown'}).`
          : 'Follow-up created.'
      );
    } catch (err) {
      setStatus(`Follow-up error: ${String(err)}`);
    }
  });
}

async function postInteraction(fields: {
  channel: string;
  subject: string;
  summary: string;
  raw_content?: string;
  materials_shared?: string[];
}) {
  setStatus('Saving touchpoint…');
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/interactions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        institution_id: currentInstitutionId,
        contact_id: currentContactId,
        ...fields,
      }),
    });
    if (!res.ok) {
      setStatus(`Save failed (${res.status}).`);
      return;
    }
    setStatus('Touchpoint saved.');
    await lookupInstitution();
  } catch (err) {
    setStatus(`Save error: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------

function renderSchoolCard(data: LookupResponse) {
  const cardEl = document.getElementById('school-card')!;
  if (!data.matched || !data.institution) {
    currentInstitutionId = null;
    currentContactId = null;
    document.getElementById('quick-actions')!.style.display = 'none';
    renderQuickCreateForm();
    return;
  }

  currentInstitutionId = data.institution.id;
  currentContactId = data.contact?.id ?? null;

  const inst = data.institution;
  const contactLine = data.contact
    ? `${data.contact.name}${data.contact.title ? ` — ${data.contact.title}` : ''}`
    : 'No primary contact on file';
  const interactionItems = data.recent_interactions
    .map((i) => `<li><strong>${i.subject}</strong> (${new Date(i.interaction_date).toLocaleDateString()})<br/>${i.summary.slice(0, 140)}</li>`)
    .join('');

  cardEl.style.display = 'block';
  cardEl.innerHTML = `
    <h2>${inst.name}</h2>
    <div class="meta">${inst.tier.replace(/_/g, ' ')} · ${inst.city}, ${inst.country} · ${inst.health_status.replace(/_/g, ' ')}</div>
    <div>${contactLine}</div>
    <ul>${interactionItems || '<li>No logged interactions yet.</li>'}</ul>
  `;
  renderQuickActions();
}

async function lookupInstitution() {
  if (!accessToken) return;
  setStatus('Looking up institution…');
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/institutions/lookup?domain=${encodeURIComponent(senderDomain)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      setStatus(`Lookup failed (${res.status}).`);
      return;
    }
    const data: LookupResponse = await res.json();
    setStatus('Loaded.');
    renderSchoolCard(data);
  } catch (err) {
    setStatus(`Lookup error: ${String(err)}`);
  }
}

function signIn() {
  setStatus('Signing in…');
  Office.context.ui.displayDialogAsync(
    'https://localhost:3001/dialog.html',
    { height: 60, width: 30, promptBeforeOpen: false },
    (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        setStatus(`Could not open sign-in dialog: ${asyncResult.error.message}`);
        return;
      }
      const dialog = asyncResult.value;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        const message = (arg as { message: string }).message;
        dialog.close();
        const data = JSON.parse(message);
        if (data.status === 'success') {
          accessToken = data.accessToken;
          document.getElementById('signin-btn')!.style.display = 'none';
          lookupInstitution();
        } else {
          setStatus(`Sign-in failed: ${data.message}`);
        }
      });
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
        setStatus('Sign-in dialog closed.');
      });
    }
  );
}

Office.onReady((info) => {
  if (info.host !== Office.HostType.Outlook) {
    return;
  }

  document.getElementById('app-body')!.style.display = 'block';
  const domainEl = document.getElementById('sender-domain')!;

  const item = Office.context.mailbox?.item;
  if (!item || !item.from) {
    setStatus('No email context available (add-in opened outside a message).');
    return;
  }

  const senderEmail = item.from.emailAddress;
  senderDomain = senderEmail.split('@')[1] ?? '';
  emailSubject = item.subject ?? '';

  setStatus('Loaded.');
  domainEl.textContent = `Sender domain: ${senderDomain}`;

  const signInBtn = document.getElementById('signin-btn') as HTMLButtonElement;
  signInBtn.style.display = 'inline-block';
  signInBtn.addEventListener('click', signIn);

  // DEV ONLY: bypass the interactive sign-in dialog by pasting a token
  // grabbed from the dashboard's own working MSAL login (app/page.tsx).
  // Remove before any real demo — real flow is the Sign in button above.
  const devBypassEl = document.getElementById('dev-bypass') as HTMLDivElement;
  devBypassEl.style.display = 'block';
  const devTokenInput = document.getElementById('dev-token-input') as HTMLInputElement;
  const devTokenBtn = document.getElementById('dev-token-btn') as HTMLButtonElement;
  devTokenBtn.addEventListener('click', () => {
    const token = devTokenInput.value.trim();
    if (!token) return;
    accessToken = token;
    lookupInstitution();
  });
});
