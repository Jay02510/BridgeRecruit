'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { useApiToken } from '@/lib/hooks/useApiToken';

interface Institution {
  id: string;
  name: string;
  tier: string;
  city: string;
  country: string;
  last_interaction_at: string | null;
}

interface Draft {
  subject_line: string;
  email_body: string;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function NeedsAttentionPage() {
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/institutions?health_status=stalled_cold', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error (${res.status})`);
      const data: Institution[] = await res.json();
      data.sort((a, b) => (daysSince(b.last_interaction_at) ?? 0) - (daysSince(a.last_interaction_at) ?? 0));
      setInstitutions(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  async function draftReengagement(institutionId: string) {
    setDrafting(institutionId);
    setDraftErrors((prev) => ({ ...prev, [institutionId]: '' }));
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/ai/draft-reengagement', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution_id: institutionId }),
      });
      if (!res.ok) throw new Error(`Draft failed (${res.status})`);
      const draft: Draft = await res.json();
      setDrafts((prev) => ({ ...prev, [institutionId]: draft }));
    } catch (err) {
      setDraftErrors((prev) => ({ ...prev, [institutionId]: (err as Error).message }));
    } finally {
      setDrafting(null);
    }
  }

  async function copyDraft(institutionId: string, draft: Draft) {
    await navigator.clipboard.writeText(`Subject: ${draft.subject_line}\n\n${draft.email_body}`);
    setCopied(institutionId);
    setTimeout(() => setCopied(null), 2000);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Needs Attention</h1>
        <Link href="/dashboard/institutions" className="text-blue-600 underline text-sm">
          ← All Institutions
        </Link>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Institutions with no touchpoint in the last 30 days (stalled/cold). Draft a low-pressure
        re-engagement email per institution — review before sending, this only drafts.
      </p>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
      {!loading && institutions.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing stalled right now.</p>
      )}

      <div className="flex flex-col gap-4">
        {institutions.map((inst) => {
          const draft = drafts[inst.id];
          const draftError = draftErrors[inst.id];
          return (
            <div key={inst.id} className="rounded border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{inst.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {inst.city}, {inst.country} · {inst.tier.replace(/_/g, ' ')} ·{' '}
                    {daysSince(inst.last_interaction_at) ?? '?'} days inactive
                  </p>
                </div>
                <button
                  onClick={() => draftReengagement(inst.id)}
                  disabled={drafting === inst.id}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {drafting === inst.id ? 'Drafting…' : draft ? 'Regenerate Draft' : 'Draft Re-engagement'}
                </button>
              </div>

              {draftError && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{draftError}</p>}

              {draft && (
                <div className="mt-3 rounded bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 text-sm">
                  <p className="font-semibold">{draft.subject_line}</p>
                  <p className="mt-2 whitespace-pre-wrap">{draft.email_body}</p>
                  <button
                    onClick={() => copyDraft(inst.id, draft)}
                    className="mt-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    {copied === inst.id ? 'Copied!' : 'Copy to clipboard'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
