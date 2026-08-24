'use client';

import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { apiLoginRequest, graphConsentRequest, calendarConsentRequest } from '@/lib/msal/config';
import { DashboardNav } from '@/components/dashboard-nav';

export default function Home() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  async function handleLogin() {
    // Redirect flow instead of popup: more reliable across browsers (some,
    // like Safari/Arc, have strict popup-window policies that break
    // popup-based OAuth). This navigates away and back; AppMsalProvider's
    // handleRedirectPromise() picks up the result on return.
    await instance.loginRedirect(apiLoginRequest);
  }

  async function handleGrantGraphAccess() {
    // Incremental consent: separate single-resource request for the Graph
    // scope, reusing the existing signed-in session (account passed in) so
    // this only prompts for consent, not a full re-login.
    await instance.acquireTokenRedirect({ ...graphConsentRequest, account: accounts[0] });
  }

  async function handleGrantCalendarAccess() {
    await instance.acquireTokenRedirect({ ...calendarConsentRequest, account: accounts[0] });
  }

  if (!isAuthenticated) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold">BridgeRecruit</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            Inbox-native CRM for school partnership recruiting. Sign in with your Microsoft
            account to see institution health, log touchpoints, and manage follow-ups.
          </p>
        </div>
        <button
          onClick={handleLogin}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Sign in with Microsoft
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col gap-6 p-8 max-w-3xl mx-auto w-full">
      <DashboardNav />
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Signed in as {accounts[0]?.username}
      </p>

      <div className="rounded border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
        <div>
          <p className="font-medium text-sm">Microsoft Graph access</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            One-time setup: grant access so the add-in can read email context and sync follow-ups
            to your Outlook Calendar.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleGrantGraphAccess}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700"
          >
            Grant Graph Access
          </button>
          <button
            onClick={handleGrantCalendarAccess}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
          >
            Grant Calendar Access
          </button>
        </div>
      </div>
    </main>
  );
}
