'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { apiLoginRequest, graphConsentRequest } from '@/lib/msal/config';
import { useApiToken } from '@/lib/hooks/useApiToken';

type ProvisionState = 'checking' | 'needs-consent' | 'ready' | 'error';

export default function Home() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const router = useRouter();
  const [provisionState, setProvisionState] = useState<ProvisionState>('checking');
  const redirectAttempted = useRef(false);

  // First-login provisioning: GET /me does the On-Behalf-Of Graph exchange
  // and upserts the users row. Nothing called this before — granting Graph
  // access only minted a token, so the account row was never actually
  // created. Runs automatically once signed in; 502 means Graph consent
  // hasn't been granted yet, so we fall back to showing that button. Once
  // ready, this screen's only job is done — straight to Institutions.
  const checkProvisioned = useCallback(async () => {
    setProvisionState('checking');
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setProvisionState('ready');
        router.replace('/dashboard/institutions');
      } else {
        setProvisionState('needs-consent');
      }
    } catch {
      setProvisionState('error');
    }
  }, [getToken, router]);

  useEffect(() => {
    if (isAuthenticated) checkProvisioned();
  }, [isAuthenticated, checkProvisioned]);

  async function handleLogin() {
    // Redirect flow instead of popup: more reliable across browsers (some,
    // like Safari/Arc, have strict popup-window policies that break
    // popup-based OAuth). This navigates away and back; AppMsalProvider's
    // handleRedirectPromise() picks up the result on return.
    await instance.loginRedirect(apiLoginRequest);
  }

  // Signed into Outlook already doesn't carry over to the browser — a
  // separate origin, separate session. Rather than make you click a button
  // just to trigger the same redirect, fire it automatically; if you're
  // already signed into Microsoft in this browser, their side skips
  // straight to consent/redirect without asking for credentials again.
  useEffect(() => {
    if (!isAuthenticated && !redirectAttempted.current) {
      redirectAttempted.current = true;
      handleLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  async function handleGrantGraphAccess() {
    // Incremental consent: separate single-resource request for the Graph
    // scope, reusing the existing signed-in session (account passed in) so
    // this only prompts for consent, not a full re-login.
    await instance.acquireTokenRedirect({ ...graphConsentRequest, account: accounts[0] });
  }

  if (!isAuthenticated) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold">BridgeRecruit</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">Redirecting to Microsoft sign-in…</p>
        </div>
        <button
          onClick={handleLogin}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Continue with Microsoft
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center text-center gap-4 w-full max-w-md">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Signed in as {accounts[0]?.username}
        </p>

        {provisionState === 'checking' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Setting up your account…</p>
        )}

        {provisionState === 'error' && (
          <p className="text-sm text-red-700 dark:text-red-400">
            Couldn&apos;t reach the server to finish setup. Try refreshing.
          </p>
        )}

        {provisionState === 'needs-consent' && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col items-center gap-3 w-full">
            <div>
              <p className="font-medium text-sm">One-time permission needed</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Required so BridgeRecruit can create your account and read basic profile info.
              </p>
            </div>
            <button
              onClick={handleGrantGraphAccess}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
            >
              Grant Graph Access
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
