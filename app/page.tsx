'use client';

import { useState } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { apiLoginRequest, graphConsentRequest } from '@/lib/msal/config';

export default function Home() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [meResult, setMeResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    // Redirect flow instead of popup: more reliable across browsers (some,
    // like Safari/Arc, have strict popup-window policies that break
    // popup-based OAuth). This navigates away and back; AppMsalProvider's
    // handleRedirectPromise() picks up the result on return.
    await instance.loginRedirect(apiLoginRequest);
  }

  async function handleLogout() {
    await instance.logoutRedirect();
  }

  async function handleGrantGraphAccess() {
    setError(null);
    // Incremental consent: separate single-resource request for the Graph
    // scope, reusing the existing signed-in session (account passed in) so
    // this only prompts for consent, not a full re-login.
    await instance.acquireTokenRedirect({ ...graphConsentRequest, account: accounts[0] });
  }

  async function callMe() {
    setLoading(true);
    setError(null);
    setMeResult(null);
    try {
      const account = accounts[0];
      const tokenResult = await instance.acquireTokenSilent({
        ...apiLoginRequest,
        account,
      });
      const res = await fetch('/api/v1/me', {
        headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(`API error (${res.status}): ${JSON.stringify(json)}`);
      } else {
        setMeResult(json);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">BridgeRecruit — Phase 3 Auth Test</h1>

      {!isAuthenticated ? (
        <button
          onClick={handleLogin}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Sign in with Microsoft
        </button>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p>Signed in as {accounts[0]?.username}</p>
          <div className="flex gap-3">
            <button
              onClick={handleGrantGraphAccess}
              className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
            >
              1. Grant Graph Access
            </button>
            <button
              onClick={callMe}
              disabled={loading}
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Calling /api/v1/me…' : '2. Test /api/v1/me (OBO + Graph)'}
            </button>
            <button
              onClick={handleLogout}
              className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      {error && (
        <pre className="max-w-2xl whitespace-pre-wrap rounded bg-red-50 p-4 text-sm text-red-800">
          {error}
        </pre>
      )}

      {typeof meResult !== 'undefined' && meResult !== null ? (
        <pre className="max-w-2xl whitespace-pre-wrap rounded bg-gray-50 p-4 text-sm">
          {JSON.stringify(meResult, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
