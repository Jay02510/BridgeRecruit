'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { useApiToken } from '@/lib/hooks/useApiToken';

interface Institution {
  id: string;
  name: string;
  domain: string;
  institution_type: string;
  tier: string;
  country: string;
  city: string;
  health_status: string;
  last_interaction_at: string | null;
  ownership_type: string | null;
  partnership_finalized: boolean;
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

export default function InstitutionsPage() {
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [healthStatus, setHealthStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tier) params.set('tier', tier);
      if (healthStatus) params.set('health_status', healthStatus);
      const res = await fetch(`/api/v1/institutions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error (${res.status})`);
      setInstitutions(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, search, tier, healthStatus]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  async function handleExport() {
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/institutions/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'institutions.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportStatus('Importing…');
    setError(null);
    try {
      const token = await getToken();
      const text = await file.text();
      const res = await fetch('/api/v1/institutions/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      setImportStatus(`Imported ${data.imported}, skipped ${data.skipped}.`);
      await load();
    } catch (err) {
      setImportStatus(null);
      setError((err as Error).message);
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
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Institutions</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/dashboard/pipeline" className="text-blue-600 underline">
            Pipeline →
          </Link>
          <Link href="/dashboard/needs-attention" className="text-blue-600 underline">
            Needs Attention →
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Export CSV
        </button>
        <label className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
          Import CSV
          <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
        </label>
        {importStatus && <span className="text-sm text-gray-500 dark:text-gray-400">{importStatus}</span>}
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All tiers</option>
          <option value="tier_1_feeder">Tier 1 — Feeder</option>
          <option value="tier_2_high_potential">Tier 2 — High potential</option>
          <option value="tier_3_standard">Tier 3 — Standard</option>
        </select>
        <select
          value={healthStatus}
          onChange={(e) => setHealthStatus(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All health statuses</option>
          <option value="active_warm">Active / Warm</option>
          <option value="cooling">Cooling</option>
          <option value="stalled_cold">Stalled / Cold</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Location</th>
            <th className="py-2 pr-4">Tier</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Ownership</th>
            <th className="py-2 pr-4">Partnership</th>
            <th className="py-2 pr-4">Health</th>
            <th className="py-2 pr-4">Last Interaction</th>
          </tr>
        </thead>
        <tbody>
          {institutions.map((inst) => (
            <tr key={inst.id} className="border-b border-gray-200 dark:border-gray-700">
              <td className="py-2 pr-4 font-medium">{inst.name}</td>
              <td className="py-2 pr-4">{inst.city}, {inst.country}</td>
              <td className="py-2 pr-4">{inst.tier.replace(/_/g, ' ')}</td>
              <td className="py-2 pr-4">{inst.institution_type.replace(/_/g, ' ')}</td>
              <td className="py-2 pr-4">{inst.ownership_type ?? '—'}</td>
              <td className="py-2 pr-4">{inst.partnership_finalized ? 'Finalized' : 'Pending'}</td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs ${HEALTH_COLORS[inst.health_status] ?? ''}`}>
                  {HEALTH_LABELS[inst.health_status] ?? inst.health_status}
                </span>
              </td>
              <td className="py-2 pr-4">
                {inst.last_interaction_at ? new Date(inst.last_interaction_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!loading && institutions.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No institutions match these filters.</p>
      )}
    </main>
  );
}
