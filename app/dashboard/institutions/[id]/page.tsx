'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { useApiToken } from '@/lib/hooks/useApiToken';
import { DashboardNav } from '@/components/dashboard-nav';

interface Institution {
  id: string;
  name: string;
  domain: string;
  institution_type: string;
  tier: string;
  country: string;
  city: string;
  address: string | null;
  curriculum: string | null;
  ownership_type: string | null;
  partnership_finalized: boolean;
  notes: string | null;
  health_status: string;
  last_interaction_at: string | null;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  is_primary: boolean;
  preferences_notes: string | null;
}

interface Interaction {
  id: string;
  channel: string;
  subject: string;
  summary: string;
  interaction_date: string;
}

interface Followup {
  id: string;
  title: string;
  focus_agenda: string | null;
  due_date: string;
  status: string;
}

const HEALTH_LABELS: Record<string, string> = {
  active_warm: 'Active / Warm',
  cooling: 'Cooling',
  stalled_cold: 'Stalled / Cold',
};

const HEALTH_COLORS: Record<string, string> = {
  active_warm: 'bg-green-100 text-green-800',
  cooling: 'bg-yellow-100 text-yellow-800',
  stalled_cold: 'bg-red-100 text-red-800',
};

export default function InstitutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Institution | null>(null);
  const [saving, setSaving] = useState(false);
  const [loggingInteraction, setLoggingInteraction] = useState(false);
  const [logChannel, setLogChannel] = useState('in_person_visit');
  const [logContactId, setLogContactId] = useState('');
  const [logSubject, setLogSubject] = useState('');
  const [logSummary, setLogSummary] = useState('');
  const [logDate, setLogDate] = useState('');
  const [savingLog, setSavingLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/v1/institutions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error (${res.status})`);
      const data = await res.json();
      setInstitution(data.institution);
      setContacts(data.contacts);
      setInteractions(data.interactions);
      setFollowups(data.followups);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  function startEditing() {
    if (!institution) return;
    setDraft(institution);
    setEditing(true);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/v1/institutions/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          city: draft.city,
          country: draft.country,
          address: draft.address,
          institution_type: draft.institution_type,
          tier: draft.tier,
          ownership_type: draft.ownership_type,
          curriculum: draft.curriculum,
          partnership_finalized: draft.partnership_finalized,
          notes: draft.notes,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setEditing(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openLogInteraction() {
    setLogChannel('in_person_visit');
    setLogContactId(contacts.find((c) => c.is_primary)?.id ?? '');
    setLogSubject('');
    setLogSummary('');
    setLogDate(new Date().toISOString().slice(0, 16));
    setLoggingInteraction(true);
  }

  async function handleLogInteraction(e: React.FormEvent) {
    e.preventDefault();
    setSavingLog(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/interactions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: id,
          contact_id: logContactId || null,
          channel: logChannel,
          subject: logSubject,
          summary: logSummary,
          raw_content: logSummary,
          interaction_date: logDate ? new Date(logDate).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Log failed (${res.status})`);
      setLoggingInteraction(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingLog(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/v1/institutions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      router.push('/dashboard/institutions');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="p-8">
        <p>
          Please <Link href="/" className="text-blue-600 underline">sign in</Link> first.
        </p>
      </main>
    );
  }

  return (
    <main className="p-8 flex flex-col gap-4 max-w-3xl">
      <DashboardNav />
      <Link href="/dashboard/institutions" className="text-sm text-blue-600 underline w-fit">
        ← All Institutions
      </Link>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

      {institution && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{institution.name}</h1>
            <div className="flex items-center gap-3">
              <span className={`rounded px-2 py-0.5 text-xs ${HEALTH_COLORS[institution.health_status] ?? ''}`}>
                {HEALTH_LABELS[institution.health_status] ?? institution.health_status}
              </span>
              {!editing && (
                <button
                  onClick={startEditing}
                  className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Edit
                </button>
              )}
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-100 dark:hover:bg-red-900"
                >
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-700 dark:text-red-400">Delete permanently, incl. contacts/history?</span>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {editing && draft ? (
            <div className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-4 flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label>Name
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <label>City
                  <input
                    value={draft.city}
                    onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <label>Country
                  <input
                    value={draft.country}
                    onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <label>Address
                  <input
                    value={draft.address ?? ''}
                    onChange={(e) => setDraft({ ...draft, address: e.target.value || null })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <label>Tier
                  <select
                    value={draft.tier}
                    onChange={(e) => setDraft({ ...draft, tier: e.target.value })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  >
                    <option value="tier_1_feeder">Tier 1 — Feeder</option>
                    <option value="tier_2_high_potential">Tier 2 — High potential</option>
                    <option value="tier_3_standard">Tier 3 — Standard</option>
                  </select>
                </label>
                <label>Type
                  <select
                    value={draft.institution_type}
                    onChange={(e) => setDraft({ ...draft, institution_type: e.target.value })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  >
                    <option value="international_high_school">International high school</option>
                    <option value="foreign_school">Foreign school</option>
                    <option value="local_high_school">Local high school</option>
                    <option value="university_partner">University partner</option>
                  </select>
                </label>
                <label>Ownership
                  <select
                    value={draft.ownership_type ?? ''}
                    onChange={(e) => setDraft({ ...draft, ownership_type: e.target.value || null })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  >
                    <option value="">Unknown</option>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>
                <label>Curriculum
                  <input
                    value={draft.curriculum ?? ''}
                    onChange={(e) => setDraft({ ...draft, curriculum: e.target.value || null })}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-2 col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.partnership_finalized}
                    onChange={(e) => setDraft({ ...draft, partnership_finalized: e.target.checked })}
                  />
                  Partnership finalized
                </label>
              </div>
              <label>Notes
                <textarea
                  value={draft.notes ?? ''}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
                  rows={4}
                  className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-gray-500 dark:text-gray-400">Location</span><br />{institution.city}, {institution.country}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Address</span><br />{institution.address ?? '—'}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Tier</span><br />{institution.tier.replace(/_/g, ' ')}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Type</span><br />{institution.institution_type.replace(/_/g, ' ')}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Ownership</span><br />{institution.ownership_type ?? '—'}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Partnership</span><br />{institution.partnership_finalized ? 'Finalized' : 'Pending'}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Curriculum</span><br />{institution.curriculum ?? '—'}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Domain</span><br />{institution.domain}</div>
              </div>

              {institution.notes && (
                <div className="rounded border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-medium mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">{institution.notes}</p>
                </div>
              )}
            </>
          )}

          <div className="rounded border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-medium mb-2">Contacts</p>
            {contacts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No contacts on file.</p>}
            <ul className="flex flex-col gap-2">
              {contacts.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.is_primary && <span className="ml-1 text-xs text-blue-600">(primary)</span>}
                  {c.title && <span className="text-gray-500 dark:text-gray-400"> — {c.title}</span>}
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">{c.email}{c.phone ? ` · ${c.phone}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Interaction history ({interactions.length})</p>
              {!loggingInteraction && (
                <button
                  onClick={openLogInteraction}
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                >
                  Log Interaction
                </button>
              )}
            </div>

            {loggingInteraction && (
              <form
                onSubmit={handleLogInteraction}
                className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-3 mb-3 flex flex-col gap-2 text-sm"
              >
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  For anything that didn&apos;t happen over email — an in-person visit, a fair, a call — logged
                  directly here without needing an email open in Outlook.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label>Channel
                    <select
                      value={logChannel}
                      onChange={(e) => setLogChannel(e.target.value)}
                      className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                    >
                      <option value="in_person_visit">In-person visit</option>
                      <option value="fair_booth">Fair / booth</option>
                      <option value="virtual_meeting">Virtual meeting</option>
                      <option value="phone_call">Phone call</option>
                      <option value="email">Email</option>
                    </select>
                  </label>
                  <label>Date
                    <input
                      type="datetime-local"
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      required
                      className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                    />
                  </label>
                </div>
                {contacts.length > 0 && (
                  <label>Contact
                    <select
                      value={logContactId}
                      onChange={(e) => setLogContactId(e.target.value)}
                      className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                    >
                      <option value="">No specific contact</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>Subject
                  <input
                    value={logSubject}
                    onChange={(e) => setLogSubject(e.target.value)}
                    required
                    placeholder="e.g. Campus visit — met with admissions office"
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <label>Notes
                  <textarea
                    value={logSummary}
                    onChange={(e) => setLogSummary(e.target.value)}
                    required
                    rows={3}
                    className="w-full mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLoggingInteraction(false)}
                    disabled={savingLog}
                    className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingLog}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingLog ? 'Saving…' : 'Save Interaction'}
                  </button>
                </div>
              </form>
            )}

            {interactions.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No interactions logged yet.</p>}
            <ul className="flex flex-col gap-3">
              {interactions.map((i) => (
                <li key={i.id} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                  <p className="font-medium">
                    {i.subject} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({i.channel.replace(/_/g, ' ')} · {new Date(i.interaction_date).toLocaleDateString()})</span>
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">{i.summary}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-medium mb-2">Follow-ups ({followups.length})</p>
            {followups.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No follow-ups scheduled.</p>}
            <ul className="flex flex-col gap-2">
              {followups.map((f) => (
                <li key={f.id} className="text-sm">
                  <span className="font-medium">{f.title}</span>{' '}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    (due {new Date(f.due_date).toLocaleDateString()} · {f.status})
                  </span>
                  {f.focus_agenda && <p className="text-gray-600 dark:text-gray-400">{f.focus_agenda}</p>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
