'use client';

import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { apiLoginRequest } from '@/lib/msal/config';

// Shared token-acquisition helper for dashboard pages: silently mints a
// Bearer token scoped to our own API (access_as_user), reusing the session
// established by the sign-in flow on the home page.
export function useApiToken() {
  const { instance, accounts } = useMsal();

  return useCallback(async (): Promise<string> => {
    const account = accounts[0];
    if (!account) throw new Error('Not signed in');
    const result = await instance.acquireTokenSilent({ ...apiLoginRequest, account });
    return result.accessToken;
  }, [instance, accounts]);
}
