'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { useApiToken } from '@/lib/hooks/useApiToken';
import { DashboardNav } from '@/components/dashboard-nav';

interface ReportResult {
  headline: string;
  highlights: string[];
  narrative: string;
  watch_list: string[];
  period_label: string;
  stats: {
    new_institutions: number;
    partnerships_finalized: number;
    interactions_by_channel: Record<string, number>;
    followups_completed: number;
    followups_open: number;
    health_counts: Record<string, number>;
  };
}

interface Institution {
  tier: string;
  country: string;
  health_status: string;
}

type Preset = 'this_month' | 'last_30' | 'all_time';

// Reports are otherwise pure client state and vanish on refresh — persist
// the last generated one per-browser so it survives a reload. Not a real
// report history (that would need a DB table and is a bigger feature);
// this just stops the immediate "it disappeared" surprise.
const REPORT_STORAGE_KEY = 'bridgerecruit-last-report';

interface StoredReport {
  report: ReportResult;
  preset: Preset;
  tierFilter: string;
  countryFilter: string;
}

const PRESET_CAPTIONS: Record<Preset, string> = {
  this_month: 'Calendar month to date — resets on the 1st, so early in a month this is a short window.',
  last_30: 'Rolling 30-day window ending today, regardless of calendar month.',
  all_time: 'Everything since the first record.',
};

function rangeForPreset(preset: Preset): { start: Date; end: Date } {
  const end = new Date();
  if (preset === 'this_month') {
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start, end };
  }
  if (preset === 'last_30') {
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end };
  }
  return { start: new Date('2000-01-01'), end };
}

export default function ReportsPage() {
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [tierFilter, setTierFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const [allInstitutions, setAllInstitutions] = useState<Institution[]>([]);

  const loadOverview = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/institutions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAllInstitutions(await res.json());
    } catch {
      // Overview tiles are a convenience; ignore failures here.
    }
  }, [getToken]);

  useEffect(() => {
    if (isAuthenticated) loadOverview();
  }, [isAuthenticated, loadOverview]);

  // Restore the last generated report from this browser, if any.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORT_STORAGE_KEY);
      if (!raw) return;
      const stored: StoredReport = JSON.parse(raw);
      setReport(stored.report);
      setPreset(stored.preset);
      setTierFilter(stored.tierFilter);
      setCountryFilter(stored.countryFilter);
    } catch {
      // Corrupt/unavailable storage — just start fresh.
    }
  }, []);

  const overview = useMemo(() => {
    const counts = { active_warm: 0, cooling: 0, stalled_cold: 0 };
    const countries = new Set<string>();
    for (const inst of allInstitutions) {
      if (inst.health_status in counts) counts[inst.health_status as keyof typeof counts]++;
      countries.add(inst.country);
    }
    return { total: allInstitutions.length, counts, countries: Array.from(countries).sort() };
  }, [allInstitutions]);

  async function generate() {
    setLoading(true);
    setError(null);
    setReport(null);
    setCopied(false);
    setEditing(false);
    try {
      const token = await getToken();
      const { start, end } = rangeForPreset(preset);
      const res = await fetch('/api/v1/ai/generate-report', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          tier: tierFilter || undefined,
          country: countryFilter || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Report failed (${res.status})`);
      setReport(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyReport() {
    if (!report) return;
    const text = [
      `Partnership Report — ${report.period_label}`,
      '',
      report.headline,
      '',
      'Highlights:',
      ...report.highlights.map((h) => `- ${h}`),
      '',
      report.narrative,
      '',
      'Needs attention:',
      ...report.watch_list.map((w) => `- ${w}`),
    ].join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Persist on every change — covers a fresh generate() and any manual
  // edits made afterward via updateReport().
  useEffect(() => {
    try {
      if (report) {
        const stored: StoredReport = { report, preset, tierFilter, countryFilter };
        localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(stored));
      } else {
        localStorage.removeItem(REPORT_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable (private browsing, quota) — not worth surfacing.
    }
  }, [report, preset, tierFilter, countryFilter]);

  function updateReport<K extends keyof ReportResult>(key: K, value: ReportResult[K]) {
    setReport((prev) => (prev ? { ...prev, [key]: value } : prev));
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
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        A plain-language activity summary for leadership — grounded in real interaction, follow-up, and
        relationship-health data, not a raw export.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total institutions</p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5">{overview.total}</p>
        </div>
        <div className="rounded-lg border border-l-4 border-l-green-500 border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Active / Warm</p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5 text-green-700 dark:text-green-400">{overview.counts.active_warm}</p>
        </div>
        <div className="rounded-lg border border-l-4 border-l-yellow-500 border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Cooling</p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5 text-yellow-700 dark:text-yellow-400">{overview.counts.cooling}</p>
        </div>
        <div className="rounded-lg border border-l-4 border-l-red-500 border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Stalled / Cold</p>
          <p className="text-2xl font-semibold tabular-nums mt-0.5 text-red-700 dark:text-red-400">{overview.counts.stalled_cold}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="this_month">This month</option>
          <option value="last_30">Last 30 days</option>
          <option value="all_time">All time</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All tiers</option>
          <option value="tier_1_feeder">Tier 1 — Feeder</option>
          <option value="tier_2_high_potential">Tier 2 — High potential</option>
          <option value="tier_3_standard">Tier 3 — Standard</option>
        </select>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All countries</option>
          {overview.countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate Report'}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{PRESET_CAPTIONS[preset]}</p>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      {report && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">{report.period_label}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing((prev) => !prev)}
                className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                {editing ? 'Done editing' : 'Edit'}
              </button>
              <button
                onClick={copyReport}
                className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          </div>

          {editing ? (
            <input
              value={report.headline}
              onChange={(e) => updateReport('headline', e.target.value)}
              className="text-lg font-semibold rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            />
          ) : (
            <h2 className="text-lg font-semibold">{report.headline}</h2>
          )}

          <div>
            <p className="text-sm font-medium mb-1">Highlights</p>
            {editing ? (
              <textarea
                value={report.highlights.join('\n')}
                onChange={(e) => updateReport('highlights', e.target.value.split('\n'))}
                rows={4}
                className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
              />
            ) : (
              <ul className="list-disc pl-5 text-sm flex flex-col gap-1">
                {report.highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
          </div>

          {editing ? (
            <textarea
              value={report.narrative}
              onChange={(e) => updateReport('narrative', e.target.value)}
              rows={4}
              className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{report.narrative}</p>
          )}

          {(editing || report.watch_list.length > 0) && (
            <div>
              <p className="text-sm font-medium mb-1">Needs attention</p>
              {editing ? (
                <textarea
                  value={report.watch_list.join('\n')}
                  onChange={(e) => updateReport('watch_list', e.target.value.split('\n'))}
                  rows={3}
                  className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
                />
              ) : (
                <ul className="list-disc pl-5 text-sm flex flex-col gap-1 text-amber-700 dark:text-amber-400">
                  {report.watch_list.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>New institutions: {report.stats.new_institutions}</span>
            <span>Partnerships finalized: {report.stats.partnerships_finalized}</span>
            <span>Follow-ups completed: {report.stats.followups_completed}</span>
            <span>Follow-ups open: {report.stats.followups_open}</span>
          </div>
        </div>
      )}
    </main>
  );
}
