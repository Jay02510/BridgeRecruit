import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';

// On-Behalf-Of token exchange: given the inbound access token the dashboard
// obtained for our own API scope (access_as_user), exchange it for a
// Graph-scoped token so the server can call Microsoft Graph as the
// signed-in user.
//
// Important: the OBO token endpoint requires a concrete tenant in the
// authority — "common" (used for the browser's interactive sign-in) is NOT
// valid here. We use the `tid` claim from the already-verified inbound
// token instead. For personal Microsoft accounts (e.g. outlook.com), tid is
// Microsoft's fixed consumers pseudo-tenant GUID
// (9188040d-6c67-4c5b-b112-36a304b66dad), which is valid for this purpose.
const clientAppCache = new Map<string, ConfidentialClientApplication>();

function getConfidentialClientForTenant(tenantId: string): ConfidentialClientApplication {
  const cached = clientAppCache.get(tenantId);
  if (cached) return cached;

  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing AZURE_CLIENT_ID or AZURE_CLIENT_SECRET environment variables');
  }

  const config: Configuration = {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };

  const app = new ConfidentialClientApplication(config);
  clientAppCache.set(tenantId, app);
  return app;
}

export interface OboTokenResult {
  accessToken: string;
  expiresOn: Date | null;
}

export async function exchangeForGraphToken(
  inboundAccessToken: string,
  tenantId: string,
  graphScopes: string[]
): Promise<OboTokenResult> {
  const cca = getConfidentialClientForTenant(tenantId);

  const result = await cca.acquireTokenOnBehalfOf({
    oboAssertion: inboundAccessToken,
    scopes: graphScopes,
  });

  if (!result?.accessToken) {
    throw new Error('On-Behalf-Of token exchange returned no access token');
  }

  return { accessToken: result.accessToken, expiresOn: result.expiresOn };
}
