/* global Office, document */

const API_BASE_URL = 'https://localhost:3000';

interface LookupResponse {
  matched: boolean;
  institution: {
    name: string;
    tier: string;
    city: string;
    country: string;
    health_status: string;
  } | null;
  contact: { name: string; email: string; title: string | null } | null;
  recent_interactions: { subject: string; summary: string; interaction_date: string }[];
}

let accessToken: string | null = null;
let senderDomain = '';

function renderSchoolCard(data: LookupResponse) {
  const cardEl = document.getElementById('school-card')!;
  if (!data.matched || !data.institution) {
    cardEl.style.display = 'block';
    cardEl.innerHTML = `<p>No institution found for <strong>${senderDomain}</strong>.</p>`;
    return;
  }
  const inst = data.institution;
  const contactLine = data.contact ? `${data.contact.name}${data.contact.title ? ` — ${data.contact.title}` : ''}` : 'No primary contact on file';
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
}

async function lookupInstitution() {
  const statusEl = document.getElementById('status')!;
  if (!accessToken) return;
  statusEl.textContent = 'Looking up institution…';
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/institutions/lookup?domain=${encodeURIComponent(senderDomain)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      statusEl.textContent = `Lookup failed (${res.status}).`;
      return;
    }
    const data: LookupResponse = await res.json();
    statusEl.textContent = 'Loaded.';
    renderSchoolCard(data);
  } catch (err) {
    statusEl.textContent = `Lookup error: ${String(err)}`;
  }
}

function signIn() {
  const statusEl = document.getElementById('status')!;
  statusEl.textContent = 'Signing in…';
  Office.context.ui.displayDialogAsync(
    'https://localhost:3001/dialog.html',
    { height: 60, width: 30, promptBeforeOpen: false },
    (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        statusEl.textContent = `Could not open sign-in dialog: ${asyncResult.error.message}`;
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
          statusEl.textContent = `Sign-in failed: ${data.message}`;
        }
      });
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
        statusEl.textContent = 'Sign-in dialog closed.';
      });
    }
  );
}

Office.onReady((info) => {
  if (info.host !== Office.HostType.Outlook) {
    return;
  }

  document.getElementById('app-body')!.style.display = 'block';
  const statusEl = document.getElementById('status')!;
  const domainEl = document.getElementById('sender-domain')!;

  const item = Office.context.mailbox?.item;
  if (!item || !item.from) {
    statusEl.textContent = 'No email context available (add-in opened outside a message).';
    return;
  }

  const senderEmail = item.from.emailAddress;
  senderDomain = senderEmail.split('@')[1] ?? '';

  statusEl.textContent = 'Loaded.';
  domainEl.textContent = `Sender domain: ${senderDomain}`;

  const signInBtn = document.getElementById('signin-btn') as HTMLButtonElement;
  signInBtn.style.display = 'inline-block';
  signInBtn.addEventListener('click', signIn);
});
