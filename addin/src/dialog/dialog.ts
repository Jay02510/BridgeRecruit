/* global Office */
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig, apiLoginRequest } from './msalConfig';

// Self-redirecting auth page: redirectUri points back at this same file, so
// it loads twice — once to kick off loginRedirect(), once again (after the
// Microsoft login round-trip) to pick up the result via handleRedirectPromise().
// This mirrors the already-proven dashboard MSAL flow (components/providers/
// msal-provider.tsx) instead of Office SSO, which would require a conflicting
// Application ID URI change — see the flagged tradeoff for Phase 4.
async function main() {
  const statusEl = document.getElementById('status')!;
  const pca = new PublicClientApplication(msalConfig);
  await pca.initialize();

  const result = await pca.handleRedirectPromise();

  if (result?.account) {
    pca.setActiveAccount(result.account);
    try {
      const tokenResult = await pca.acquireTokenSilent({
        ...apiLoginRequest,
        account: result.account,
      });
      Office.onReady(() => {
        Office.context.ui.messageParent(
          JSON.stringify({ status: 'success', accessToken: tokenResult.accessToken })
        );
      });
    } catch (err) {
      Office.onReady(() => {
        Office.context.ui.messageParent(
          JSON.stringify({ status: 'error', message: String(err) })
        );
      });
    }
    return;
  }

  const existingAccounts = pca.getAllAccounts();
  if (existingAccounts.length > 0) {
    pca.setActiveAccount(existingAccounts[0]);
    try {
      const tokenResult = await pca.acquireTokenSilent({
        ...apiLoginRequest,
        account: existingAccounts[0],
      });
      Office.onReady(() => {
        Office.context.ui.messageParent(
          JSON.stringify({ status: 'success', accessToken: tokenResult.accessToken })
        );
      });
      return;
    } catch {
      // fall through to interactive login below
    }
  }

  statusEl.textContent = 'Redirecting to Microsoft sign-in…';
  await pca.loginRedirect(apiLoginRequest);
}

main().catch((err) => {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = `Sign-in error: ${String(err)}`;
});
