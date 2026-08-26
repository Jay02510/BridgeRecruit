/* global Office, document */

const API_BASE_URL = 'https://bridgerecruit.vercel.app';
const DASHBOARD_URL = `${API_BASE_URL}/dashboard/institutions`;

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
let senderEmail = '';
let emailSubject = '';
let currentInstitutionId: string | null = null;
let currentContactId: string | null = null;

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

// Institution/contact/interaction text is free-form (spreadsheet import, quick-create
// form) and the sender domain comes off the open email — none of it is trustworthy
// enough to interpolate into innerHTML unescaped.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setStatus(text: string, tone: 'neutral' | 'success' | 'error' = 'neutral') {
  const el = document.getElementById('status')!;
  el.textContent = text;
  el.className = tone;
}

// ---------------------------------------------------------------------------
// Quick-create (FR-1.1): shown when the sender's domain has no match.
// ---------------------------------------------------------------------------
function renderQuickCreateForm() {
  const cardEl = document.getElementById('school-card')!;
  const guessedName = senderDomain.split('.')[0].replace(/-/g, ' ');
  cardEl.style.display = 'block';
  cardEl.innerHTML = `
    <p>No institution found for <strong>${escapeHtml(senderDomain)}</strong>.</p>
    <form id="quick-create-form">
      <label>Name<input type="text" id="qc-name" value="${escapeHtml(guessedName)}" required /></label>
      <label>City<input type="text" id="qc-city" required /></label>
      <label>Type
        <select id="qc-type">
          <option value="international_high_school">International high school</option>
          <option value="foreign_school">Foreign school</option>
          <option value="local_high_school">Local high school</option>
          <option value="university_partner">University partner</option>
        </select>
      </label>
      <label>Tier
        <select id="qc-tier">
          <option value="tier_1_feeder">Tier 1 (feeder)</option>
          <option value="tier_2_high_potential" selected>Tier 2 (high potential)</option>
          <option value="tier_3_standard">Tier 3 (standard)</option>
        </select>
      </label>
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
        setStatus(`Create failed (${res.status}).`, 'error');
        return;
      }
      setStatus('Institution created.', 'success');
      await lookupInstitution();
    } catch (err) {
      setStatus(`Create error: ${String(err)}`, 'error');
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
    <button id="log-touchpoint-btn">Log Touchpoint</button>
    <button id="followup-btn">Set Follow-Up</button>
    <div id="action-panel"></div>
  `;
  document.getElementById('log-touchpoint-btn')!.addEventListener('click', renderLogTouchpointPanel);
  document.getElementById('followup-btn')!.addEventListener('click', renderFollowupPanel);
}

// Merged Log Email + Log Interaction: same form, "Email" is just the
// channel option that gets an AI-summary assist since the open message's
// body is right there. Every channel still logs against the currently
// matched institution regardless of what's open in the reading pane.
function renderLogTouchpointPanel() {
  const panel = document.getElementById('action-panel')!;
  panel.innerHTML = `
    <form id="log-touchpoint-form">
      <label>Channel
        <select id="touchpoint-channel">
          <option value="email">Email</option>
          <option value="in_person_visit">In-person visit</option>
          <option value="fair_booth">Fair / booth</option>
          <option value="virtual_meeting">Virtual meeting</option>
          <option value="phone_call">Phone call</option>
        </select>
      </label>
      <div id="ai-summary-row">
        <button type="button" id="ai-summary-btn">Regenerate AI summary</button>
        <div id="ai-summary-status"></div>
      </div>
      <label>Notes
        <textarea id="touchpoint-notes" rows="3" required></textarea>
      </label>
      <div id="ai-action-item" style="font-size: 12px; color: var(--gray-700); margin-bottom: 8px;"></div>
      <label>Materials shared (comma-separated)
        <input type="text" id="touchpoint-materials" />
      </label>
      <button type="submit">Save</button>
    </form>
  `;

  let threadText = '';
  const channelSelect = document.getElementById('touchpoint-channel') as HTMLSelectElement;
  const aiSummaryRow = document.getElementById('ai-summary-row')!;

  function syncAiSummaryVisibility() {
    aiSummaryRow.style.display = channelSelect.value === 'email' ? 'block' : 'none';
  }
  syncAiSummaryVisibility();
  channelSelect.addEventListener('change', syncAiSummaryVisibility);

  document.getElementById('ai-summary-btn')!.addEventListener('click', () => populateAiSummary(threadText));

  const item = Office.context.mailbox.item!;
  item.body.getAsync(Office.CoercionType.Text, async (result) => {
    threadText = result.status === Office.AsyncResultStatus.Succeeded ? result.value : '';
    if (channelSelect.value === 'email') await populateAiSummary(threadText);
  });

  document.getElementById('log-touchpoint-form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const channel = channelSelect.value;
    const notes = (document.getElementById('touchpoint-notes') as HTMLTextAreaElement).value;
    const materialsRaw = (document.getElementById('touchpoint-materials') as HTMLInputElement).value;
    const materials_shared = materialsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const subject =
      channel === 'email'
        ? emailSubject || 'Email touchpoint'
        : `${channel.replace(/_/g, ' ')} — ${new Date().toLocaleDateString()}`;
    await postInteraction({
      channel,
      subject,
      summary: notes,
      raw_content: channel === 'email' ? threadText : notes,
      materials_shared: materials_shared.length ? materials_shared : undefined,
    });
  });
}

async function populateAiSummary(threadText: string) {
  const statusEl = document.getElementById('ai-summary-status')!;
  const notesEl = document.getElementById('touchpoint-notes') as HTMLTextAreaElement;
  statusEl.textContent = 'Generating AI summary…';
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/ai/summarize-thread`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ thread_text: threadText || '(empty thread)' }),
    });
    if (!res.ok) throw new Error(`AI summary failed (${res.status})`);
    const data = await res.json();
    notesEl.value = data.summary ?? '';
    document.getElementById('ai-action-item')!.textContent = data.suggested_action_item
      ? `Suggested action: ${data.suggested_action_item}`
      : '';
    statusEl.textContent = '';
  } catch {
    statusEl.textContent = 'AI summary unavailable — enter manually.';
  }
}

function renderFollowupPanel() {
  const panel = document.getElementById('action-panel')!;
  panel.innerHTML = `
    <form id="followup-form">
      <label>Focus / agenda
        <textarea id="followup-agenda" rows="2" required></textarea>
      </label>
      <label>Due
        <select id="followup-preset">
          <option value="3">In 3 days</option>
          <option value="7">In 1 week</option>
          <option value="14">In 2 weeks</option>
        </select>
      </label>
      <label class="checkbox-label"><input type="checkbox" id="followup-sync" checked /> Sync to Outlook Calendar</label>
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
        setStatus(`Follow-up failed (${res.status}).`, 'error');
        return;
      }
      const panel = document.getElementById('action-panel')!;
      panel.innerHTML = `<p class="success-message">✓ Follow-up created${
        sync ? (data.calendar_sync === 'synced' ? ' — synced to calendar.' : ' — calendar sync unavailable.') : '.'
      }</p>`;
      setStatus('Follow-up created.', 'success');
    } catch (err) {
      setStatus(`Follow-up error: ${String(err)}`, 'error');
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
      setStatus(`Save failed (${res.status}).`, 'error');
      return;
    }
    setStatus('Touchpoint saved.', 'success');
    await lookupInstitution();
  } catch (err) {
    setStatus(`Save error: ${String(err)}`, 'error');
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
    ? `${escapeHtml(data.contact.name)}${data.contact.title ? ` — ${escapeHtml(data.contact.title)}` : ''}`
    : 'No primary contact on file';
  const interactionItems = data.recent_interactions
    .map((i) => `<li><strong>${escapeHtml(i.subject)}</strong> (${new Date(i.interaction_date).toLocaleDateString()})<br/>${escapeHtml(i.summary.slice(0, 140))}</li>`)
    .join('');

  cardEl.style.display = 'block';
  cardEl.innerHTML = `
    <h2>${escapeHtml(inst.name)}</h2>
    <div class="meta">${escapeHtml(inst.tier.replace(/_/g, ' '))} · ${escapeHtml(inst.city)}, ${escapeHtml(inst.country)} · ${escapeHtml(inst.health_status.replace(/_/g, ' '))}</div>
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
      `${API_BASE_URL}/api/v1/institutions/lookup?domain=${encodeURIComponent(senderDomain)}&email=${encodeURIComponent(senderEmail)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      setStatus(`Lookup failed (${res.status}).`, 'error');
      return;
    }
    const data: LookupResponse = await res.json();
    setStatus('Loaded.');
    renderSchoolCard(data);
  } catch (err) {
    setStatus(`Lookup error: ${String(err)}`, 'error');
  }
}

function signIn() {
  setStatus('Signing in…');
  Office.context.ui.displayDialogAsync(
    'https://bridgerecruit-addin.vercel.app/dialog.html',
    { height: 60, width: 30, promptBeforeOpen: false },
    (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        setStatus(`Could not open sign-in dialog: ${asyncResult.error.message}`, 'error');
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
          setStatus(`Sign-in failed: ${data.message}`, 'error');
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

  document.getElementById('dashboard-link')!.addEventListener('click', (e) => {
    e.preventDefault();
    if (Office.context.ui?.openBrowserWindow) {
      Office.context.ui.openBrowserWindow(DASHBOARD_URL);
    } else {
      window.open(DASHBOARD_URL, '_blank');
    }
  });

  const item = Office.context.mailbox?.item;
  if (!item || !item.from) {
    setStatus('No email context available (add-in opened outside a message).');
    return;
  }

  senderEmail = item.from.emailAddress;
  senderDomain = senderEmail.split('@')[1] ?? '';
  emailSubject = item.subject ?? '';

  setStatus('Loaded.');
  domainEl.textContent = `Sender domain: ${senderDomain}`;

  const signInBtn = document.getElementById('signin-btn') as HTMLButtonElement;
  signInBtn.style.display = 'inline-block';
  signInBtn.addEventListener('click', signIn);
});
