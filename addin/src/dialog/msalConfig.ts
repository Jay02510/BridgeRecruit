// Mirrors lib/msal/config.ts from the root Next.js app. Duplicated (not
// imported across the workspace boundary) because the add-in is a separate
// webpack project with its own tsconfig/module resolution — keeping it
// self-contained avoids cross-package build wiring for a few constants.
export const CLIENT_ID = '41fa1d82-e36c-4cf2-9c03-88e53b911ddd';

export const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: 'https://localhost:3001/dialog.html',
  },
  cache: {
    cacheLocation: 'sessionStorage' as const,
    storeAuthStateInCookie: false,
  },
};

export const apiLoginRequest = {
  scopes: [`api://${CLIENT_ID}/access_as_user`],
};
