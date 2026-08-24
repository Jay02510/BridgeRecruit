'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import Link from 'next/link';
import { useApiToken } from '@/lib/hooks/useApiToken';
import { calendarConsentRequest } from '@/lib/msal/config';
import { DashboardNav } from '@/components/dashboard-nav';

interface CalendarEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  bodyPreview: string;
  bridgeRecruit: { institutionName: string | null; focusAgenda: string | null } | null;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = new Date(e.start).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

export default function CalendarPage() {
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const { instance, accounts } = useMsal();
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsConsent(false);
    try {
      const token = await getToken();
      const base = startOfWeek(new Date());
      const start = new Date(base.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const res = await fetch(
        `/api/v1/calendar/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 502 && String(data.details ?? '').toLowerCase().includes('consent')) {
          setNeedsConsent(true);
        }
        throw new Error(data.error ?? `Calendar failed (${res.status})`);
      }
      setEvents(data.events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken, weekOffset]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  async function grantCalendarAccess() {
    await instance.acquireTokenRedirect({ ...calendarConsentRequest, account: accounts[0] });
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

  const base = startOfWeek(new Date());
  const weekStart = new Date(base.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000));
  const byDay = groupByDay(events);

  return (
    <main className="p-8 flex flex-col gap-4">
      <DashboardNav />
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">
        Read-only view of your real Outlook calendar — fetched live, not a copy, so it always matches what&apos;s
        actually on your calendar. Events created from a Set Follow-Up are labeled with the institution.
      </p>

      {needsConsent && (
        <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-3 text-sm flex items-center justify-between">
          <span>Calendar access hasn&apos;t been granted yet.</span>
          <button
            onClick={grantCalendarAccess}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
          >
            Grant Calendar Access
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          ← Previous week
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {weekStart.toLocaleDateString()} – {days[6].toLocaleDateString()}
        </span>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Next week →
        </button>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="text-sm text-blue-600 underline"
          >
            This week
          </button>
        )}
      </div>

      {error && !needsConsent && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
        {days.map((day) => {
          const dayEvents = byDay.get(day.toDateString()) ?? [];
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div key={day.toISOString()} className="rounded border border-gray-200 dark:border-gray-700 p-2 min-h-[100px]">
              <p className={`text-xs font-semibold mb-2 ${isToday ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}>
                {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              <div className="flex flex-col gap-1.5">
                {dayEvents.map((e) => (
                  <div key={e.id} className="rounded bg-gray-100 dark:bg-gray-800 p-1.5 text-xs">
                    <p className="font-medium">{e.subject}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      {new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </p>
                    {e.bridgeRecruit && (
                      <p className="mt-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 w-fit">
                        {e.bridgeRecruit.institutionName ?? 'BridgeRecruit follow-up'}
                      </p>
                    )}
                  </div>
                ))}
                {dayEvents.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-600">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
