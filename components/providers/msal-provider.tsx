'use client';

import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { useEffect, useState } from 'react';
import { msalConfig } from '@/lib/msal/config';

export default function AppMsalProvider({ children }: { children: React.ReactNode }) {
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    const instance = new PublicClientApplication(msalConfig);
    instance.initialize().then(() => {
      // If a redirect-flow login just completed, set the returned account
      // as active so useIsAuthenticated()/useAccount() pick it up.
      instance.handleRedirectPromise().then((result) => {
        if (result?.account) {
          instance.setActiveAccount(result.account);
        }
      });

      instance.addEventCallback((event) => {
        if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
          const account = (event.payload as { account?: unknown }).account;
          if (account) {
            instance.setActiveAccount(account as Parameters<typeof instance.setActiveAccount>[0]);
          }
        }
      });

      setMsalInstance(instance);
    });
  }, []);

  if (!msalInstance) return null; // brief flash while MSAL initializes from sessionStorage

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
