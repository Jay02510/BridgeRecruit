// Shared MSAL browser configuration. Multi-tenant + personal Microsoft
// accounts app registration (see .env.example) — authority is the "common"
// endpoint so both work/school and personal (e.g. outlook.com) accounts can
// sign in through the same app.

export const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID!,
    authority: 'https://login.microsoftonline.com/common',
    // Must exactly match a redirect URI registered on the app in Azure
    // (App registrations -> Authentication -> Web -> Redirect URIs). We
    // land back on "/" after redirect login completes; AppMsalProvider's
    // handleRedirectPromise() is wired into the root layout, so it's
    // guaranteed to run here regardless of which page the user started
    // the login from.
    redirectUri:
      typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : process.env.NEXT_PUBLIC_APP_URL,
    postLogoutRedirectUri: '/',
  },
  cache: {
    cacheLocation: 'sessionStorage' as const,
    storeAuthStateInCookie: false,
  },
};

// The custom scope exposed under "Expose an API" (access_as_user). This is
// what actually gets sent as the Bearer token to our own API routes — a
// single token request can only target one resource/audience, so this
// stays scoped to just our app.
export const apiLoginRequest = {
  scopes: [`api://${process.env.NEXT_PUBLIC_AZURE_CLIENT_ID}/access_as_user`],
};

// Azure rejects mixing scopes from two different resources (our own API's
// api://<clientId>/access_as_user, and Microsoft Graph's User.Read) in a
// single authorization request (AADSTS70011: invalid_scope). So these must
// be requested as two SEPARATE interactive steps: sign in with
// apiLoginRequest first, then a second incremental-consent redirect with
// this Graph-only request — only after that has been granted once can the
// server's On-Behalf-Of exchange (lib/graph/obo.ts) hand out a Graph token.
export const graphConsentRequest = {
  scopes: ['https://graph.microsoft.com/User.Read'],
};
