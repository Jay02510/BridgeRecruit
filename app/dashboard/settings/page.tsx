'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import Link from 'next/link';
import { graphConsentRequest, calendarConsentRequest } from '@/lib/msal/config';
import { useApiToken } from '@/lib/hooks/useApiToken';
import { DashboardNav } from '@/components/dashboard-nav';

type AccessState = 'checking' | 'needs-consent' | 'granted';

export default function SettingsPage() {
  const isAuthenticated = useIsAuthenticated();
  const { instance, accounts } = useMsal();
  const getToken = useApiToken();
  const [graphState, setGraphState] = useState<AccessState>('checking');
  const [calendarState, setCalendarState] = useState<AccessState>('checking');

  // Graph access has no dedicated probe — /me itself does the check (it
  // fails with 502 if the Graph scope was revoked since sign-in).
  const checkGraphAccess = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } });
      setGraphState(res.ok ? 'granted' : 'needs-consent');
    } catch {
      setGraphState('needs-consent');
    }
  }, [getToken]);

  // Calendar consent has no server endpoint to probe — a silent token
  // request is how MSAL itself reports whether it's already been granted.
  const checkCalendarAccess = useCallback(async () => {
    const account = accounts[0];
    if (!account) return;
    try {
      await instance.acquireTokenSilent({ ...calendarConsentRequest, account });
      setCalendarState('granted');
    } catch (err) {
      setCalendarState(err instanceof InteractionRequiredAuthError ? 'needs-consent' : 'granted');
    }
  }, [instance, accounts]);

  useEffect(() => {
    if (isAuthenticated) {
      checkGraphAccess();
      checkCalendarAccess();
    }
  }, [isAuthenticated, checkGraphAccess, checkCalendarAccess]);

  async function handleGrantGraphAccess() {
    await instance.acquireTokenRedirect({ ...graphConsentRequest, account: accounts[0] });
  }

  async function handleGrantCalendarAccess() {
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

  return (
    <main className="p-8 flex flex-col gap-4 max-w-2xl">
      <DashboardNav />
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">
        Account and Microsoft access — nothing here affects your data, only what BridgeRecruit is
        allowed to read or sync on your behalf.
      </p>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Signed in as</p>
        <p className="text-sm font-medium">{accounts[0]?.username}</p>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Microsoft Graph access</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Required — lets BridgeRecruit read your basic profile to keep your account working.
          </p>
        </div>
        {graphState === 'checking' && (
          <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">Checking…</span>
        )}
        {graphState === 'granted' && (
          <span className="shrink-0 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
            Granted
          </span>
        )}
        {graphState === 'needs-consent' && (
          <button
            onClick={handleGrantGraphAccess}
            className="shrink-0 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            Grant Access
          </button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-sm">Calendar sync</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Optional — only needed for the Calendar tab, lets follow-ups sync to your real Outlook
            calendar.
          </p>
        </div>
        {calendarState === 'checking' && (
          <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">Checking…</span>
        )}
        {calendarState === 'granted' && (
          <span className="shrink-0 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
            Granted
          </span>
        )}
        {calendarState === 'needs-consent' && (
          <button
            onClick={handleGrantCalendarAccess}
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Grant Access
          </button>
        )}
      </div>
    </main>
  );
}
