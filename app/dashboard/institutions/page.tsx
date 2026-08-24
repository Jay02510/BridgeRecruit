'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/lib/hooks/useApiToken';
import { DashboardNav } from '@/components/dashboard-nav';
import { IMPORT_FIELDS, fieldLabel, type ColumnSuggestion, type ColumnTarget } from '@/lib/import/mapping';

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

type SortKey = 'name' | 'city' | 'tier' | 'institution_type' | 'ownership_type' | 'partnership_finalized' | 'health_status' | 'last_interaction_at';

// Only the fields a recruiter needs to triage at a glance — everything else
// (type, ownership, partnership status, address, notes, contacts, full
// history) lives on the institution's own profile page, one click away.
// Keeps the table from turning into the same wall of columns as the Excel
// sheet this replaces; those fields are still filterable even though
// they're not shown as columns.
const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'city', label: 'Location' },
  { key: 'tier', label: 'Tier' },
  { key: 'health_status', label: 'Health' },
  { key: 'last_interaction_at', label: 'Last Interaction' },
];

function sortValue(inst: Institution, key: SortKey): string | number {
  switch (key) {
    case 'city':
      return `${inst.city}, ${inst.country}`;
    case 'partnership_finalized':
      return inst.partnership_finalized ? 1 : 0;
    case 'last_interaction_at':
      return inst.last_interaction_at ? new Date(inst.last_interaction_at).getTime() : -Infinity;
    default:
      return inst[key] ?? '';
  }
}

export default function InstitutionsPage() {
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [healthStatus, setHealthStatus] = useState('');
  const [country, setCountry] = useState('');
  const [ownershipType, setOwnershipType] = useState('');
  const [partnershipFinalized, setPartnershipFinalized] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purging, setPurging] = useState(false);
  const [filterOptions, setFilterOptions] = useState<{ countries: string[]; ownershipTypes: string[] }>({
    countries: [],
    ownershipTypes: [],
  });

  // Legacy spreadsheet import: a known-sheet path (exact columns, no
  // guessing) when we recognize the file, generic fuzzy mapping otherwise.
  const [legacyFile, setLegacyFile] = useState<File | null>(null);
  const [legacyKnownPreview, setLegacyKnownPreview] = useState<{
    recognizedFormat: string;
    rowCount: number;
    institutionCount: number;
    interactionCount: number;
    followupCount: number;
    sampleInstitutionNames: string[];
    unrecognizedColumns: string[];
  } | null>(null);
  const [legacyPreview, setLegacyPreview] = useState<{
    columns: ColumnSuggestion[];
    rowCount: number;
    sampleRows: Record<string, unknown>[];
  } | null>(null);
  const [legacyMapping, setLegacyMapping] = useState<Record<string, ColumnTarget>>({});
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [legacyResult, setLegacyResult] = useState<{
    imported: number;
    skipped: number;
    row_errors: { row: number; error: string }[];
    interactionsCreated?: number;
    followupsCreated?: number;
  } | null>(null);

  // Debounce free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tier) params.set('tier', tier);
      if (healthStatus) params.set('health_status', healthStatus);
      if (country) params.set('country', country);
      if (ownershipType) params.set('ownership_type', ownershipType);
      if (partnershipFinalized) params.set('partnership_finalized', partnershipFinalized);
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
  }, [getToken, search, tier, healthStatus, country, ownershipType, partnershipFinalized]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  // Filter dropdown options come from the full unfiltered set (fetched once),
  // so picking one filter doesn't shrink the choices available in the others.
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/v1/institutions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const all: Institution[] = await res.json();
        setFilterOptions({
          countries: Array.from(new Set(all.map((i) => i.country))).sort(),
          ownershipTypes: Array.from(
            new Set(all.map((i) => i.ownership_type).filter((v): v is string => Boolean(v)))
          ).sort(),
        });
      } catch {
        // Filter options are a convenience; ignore failures here.
      }
    })();
  }, [isAuthenticated, getToken]);

  const sortedInstitutions = useMemo(() => {
    const copy = [...institutions];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [institutions, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === sortedInstitutions.length ? new Set() : new Set(sortedInstitutions.map((i) => i.id))
    );
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    setError(null);
    try {
      const token = await getToken();
      const results = await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/v1/institutions/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) setError(`${failed} of ${results.length} deletions failed.`);
      setSelectedIds(new Set());
      setConfirmingBulkDelete(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handlePurgeAll() {
    setPurging(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/institutions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Purge failed (${res.status})`);
      setPurgeConfirmText('');
      setConfirmingPurge(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPurging(false);
    }
  }

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

  async function handleLegacyPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLegacyFile(file);
    setLegacyResult(null);
    setLegacyError(null);
    setLegacyBusy(true);
    try {
      const token = await getToken();
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/v1/institutions/import/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Preview failed (${res.status})`);
      if (data.recognizedFormat) {
        setLegacyKnownPreview(data);
        setLegacyPreview(null);
        setLegacyMapping({});
      } else {
        setLegacyPreview(data);
        setLegacyKnownPreview(null);
        const initialMapping: Record<string, ColumnTarget> = {};
        for (const col of data.columns as ColumnSuggestion[]) {
          initialMapping[col.header] = col.suggestedField;
        }
        setLegacyMapping(initialMapping);
      }
    } catch (err) {
      setLegacyError((err as Error).message);
      setLegacyFile(null);
    } finally {
      setLegacyBusy(false);
    }
  }

  function cancelLegacyImport() {
    setLegacyFile(null);
    setLegacyPreview(null);
    setLegacyKnownPreview(null);
    setLegacyMapping({});
    setLegacyError(null);
  }

  async function confirmLegacyImport() {
    if (!legacyFile) return;
    setLegacyBusy(true);
    setLegacyError(null);
    try {
      const token = await getToken();
      const body = new FormData();
      body.append('file', legacyFile);
      if (!legacyKnownPreview) {
        body.append('mapping', JSON.stringify(legacyMapping));
      }
      const res = await fetch('/api/v1/institutions/import/commit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      setLegacyResult(data);
      setLegacyFile(null);
      setLegacyPreview(null);
      setLegacyKnownPreview(null);
      setLegacyMapping({});
      await load();
    } catch (err) {
      setLegacyError((err as Error).message);
    } finally {
      setLegacyBusy(false);
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
      <DashboardNav />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Institutions</h1>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Export CSV
        </button>
        <label className="rounded bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-3 py-1.5 text-sm hover:bg-blue-200 dark:hover:bg-blue-800 cursor-pointer">
          Import Spreadsheet
          <input type="file" accept=".csv,.xlsx" onChange={handleLegacyPick} className="hidden" />
        </label>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-300 dark:border-gray-600">
            <span className="text-sm text-gray-600 dark:text-gray-400">{selectedIds.size} selected</span>
            {!confirmingBulkDelete ? (
              <button
                onClick={() => setConfirmingBulkDelete(true)}
                className="rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 px-3 py-1.5 text-sm hover:bg-red-100 dark:hover:bg-red-900"
              >
                Delete
              </button>
            ) : (
              <>
                <span className="text-xs text-red-700 dark:text-red-400">Delete permanently?</span>
                <button
                  onClick={() => setConfirmingBulkDelete(false)}
                  disabled={bulkDeleting}
                  className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkDeleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!confirmingPurge ? (
        <button
          onClick={() => setConfirmingPurge(true)}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 w-fit -mt-1"
        >
          Clear all data…
        </button>
      ) : (
        <div className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 p-3 text-sm flex flex-col gap-2 -mt-1">
          <p className="text-red-800 dark:text-red-300">
            This permanently deletes <strong>every</strong> institution, contact, interaction, and
            follow-up in your account — useful for re-testing a spreadsheet import from a clean slate.
            Cannot be undone. Type <strong>DELETE</strong> to confirm.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={purgeConfirmText}
              onChange={(e) => setPurgeConfirmText(e.target.value)}
              placeholder="DELETE"
              className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm w-32"
            />
            <button
              onClick={() => {
                setConfirmingPurge(false);
                setPurgeConfirmText('');
              }}
              disabled={purging}
              className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePurgeAll}
              disabled={purging || purgeConfirmText !== 'DELETE'}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {purging ? 'Deleting…' : 'Delete Everything'}
            </button>
          </div>
        </div>
      )}

      {legacyError && <p className="text-sm text-red-700 dark:text-red-400">{legacyError}</p>}
      {legacyResult && (
        <div className="rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 p-3 text-sm">
          <p className="font-medium text-green-800 dark:text-green-300">
            Imported {legacyResult.imported}, skipped {legacyResult.skipped}
            {typeof legacyResult.interactionsCreated === 'number' &&
              ` — ${legacyResult.interactionsCreated} interactions and ${legacyResult.followupsCreated ?? 0} follow-ups created from meeting history`}
            .
          </p>
          {legacyResult.row_errors.length > 0 && (
            <ul className="mt-1 text-xs text-green-800/80 dark:text-green-300/80 list-disc pl-4">
              {legacyResult.row_errors.slice(0, 10).map((e, i) => (
                <li key={i}>Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {legacyKnownPreview && (
        <div className="rounded border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 p-4 flex flex-col gap-3">
          <div>
            <p className="font-medium text-sm text-green-800 dark:text-green-300">
              Recognized this as your Partner Interactions sheet — {legacyFile?.name}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Columns map exactly, no guessing needed. This will create/update{' '}
              <strong>{legacyKnownPreview.institutionCount}</strong> institution
              {legacyKnownPreview.institutionCount === 1 ? '' : 's'}, log{' '}
              <strong>{legacyKnownPreview.interactionCount}</strong> past interactions from your Last
              Meeting/Contact columns, and create <strong>{legacyKnownPreview.followupCount}</strong> follow-up
              tasks from your Next Steps columns — so health status reflects your real history immediately,
              not &quot;no contact yet&quot;.
            </p>
            {legacyKnownPreview.sampleInstitutionNames.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Includes: {legacyKnownPreview.sampleInstitutionNames.join(', ')}
                {legacyKnownPreview.institutionCount > legacyKnownPreview.sampleInstitutionNames.length ? ', …' : ''}
              </p>
            )}
            {legacyKnownPreview.unrecognizedColumns.length > 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                ⚠ Your file has {legacyKnownPreview.unrecognizedColumns.length} column
                {legacyKnownPreview.unrecognizedColumns.length === 1 ? '' : 's'} we don&apos;t recognize and
                won&apos;t import: {legacyKnownPreview.unrecognizedColumns.join(', ')}. If this data matters,
                tell me and I&apos;ll add it to the mapping.
              </p>
            ) : (
              <p className="text-xs text-green-700 dark:text-green-400 mt-2">
                ✓ Every column in your file is recognized — nothing will be silently skipped.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelLegacyImport}
              disabled={legacyBusy}
              className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmLegacyImport}
              disabled={legacyBusy}
              className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              {legacyBusy ? 'Importing…' : `Import ${legacyKnownPreview.institutionCount} Institutions`}
            </button>
          </div>
        </div>
      )}

      {legacyPreview && (
        <div className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-4 flex flex-col gap-3">
          <div>
            <p className="font-medium text-sm">
              {legacyFile?.name} — {legacyPreview.rowCount} row{legacyPreview.rowCount === 1 ? '' : 's'} found.
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              We matched what we could. Review each column below — anything we couldn&apos;t map defaults to
              appending into Notes so nothing is silently dropped. Change any mapping before importing.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr className="text-left border-b border-blue-200 dark:border-blue-800">
                  <th className="py-1 pr-4">Your column</th>
                  <th className="py-1 pr-4">Maps to</th>
                  <th className="py-1 pr-4">Confidence</th>
                  <th className="py-1 pr-4">Sample value</th>
                </tr>
              </thead>
              <tbody>
                {legacyPreview.columns.map((col) => (
                  <tr key={col.header} className="border-b border-blue-100 dark:border-blue-900">
                    <td className="py-1 pr-4 font-medium">{col.header}</td>
                    <td className="py-1 pr-4">
                      <select
                        value={legacyMapping[col.header] ?? 'notes'}
                        onChange={(e) =>
                          setLegacyMapping((prev) => ({ ...prev, [col.header]: e.target.value as ColumnTarget }))
                        }
                        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                      >
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>{fieldLabel(f)}</option>
                        ))}
                        <option value="notes">{fieldLabel('notes')}</option>
                        <option value="ignore">{fieldLabel('ignore')}</option>
                      </select>
                    </td>
                    <td className="py-1 pr-4 text-xs text-gray-500 dark:text-gray-400">
                      {col.confidence === 'exact' ? 'Exact match' : col.confidence === 'fuzzy' ? 'Guessed' : 'Unmapped'}
                    </td>
                    <td className="py-1 pr-4 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                      {String(legacyPreview.sampleRows[0]?.[col.header] ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={cancelLegacyImport}
              disabled={legacyBusy}
              className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmLegacyImport}
              disabled={legacyBusy}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {legacyBusy ? 'Importing…' : `Import ${legacyPreview.rowCount} Rows`}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All countries</option>
          {filterOptions.countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={ownershipType}
          onChange={(e) => setOwnershipType(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All ownership types</option>
          {filterOptions.ownershipTypes.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          value={partnershipFinalized}
          onChange={(e) => setPartnershipFinalized(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">Any partnership status</option>
          <option value="true">Finalized</option>
          <option value="false">Pending</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
            <th className="py-2 pr-2 w-8">
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === sortedInstitutions.length}
                onChange={toggleSelectAll}
                aria-label="Select all"
              />
            </th>
            {SORT_COLUMNS.map((col) => (
              <th key={col.key} className="py-2 pr-4">
                <button
                  onClick={() => toggleSort(col.key)}
                  className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  {col.label}
                  {sortKey === col.key && <span className="text-xs">{sortAsc ? '▲' : '▼'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedInstitutions.map((inst) => (
            <tr
              key={inst.id}
              onClick={() => router.push(`/dashboard/institutions/${inst.id}`)}
              className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer ${
                selectedIds.has(inst.id) ? 'bg-blue-50 dark:bg-blue-950' : ''
              }`}
            >
              <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(inst.id)}
                  onChange={() => toggleSelected(inst.id)}
                  aria-label={`Select ${inst.name}`}
                />
              </td>
              <td className="py-2 pr-4 font-medium">{inst.name}</td>
              <td className="py-2 pr-4">{inst.city}, {inst.country}</td>
              <td className="py-2 pr-4">{inst.tier.replace(/_/g, ' ')}</td>
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
