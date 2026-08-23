import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';

// Verifies an incoming Bearer token (the access token the dashboard obtained
// for our own exposed scope, api://<clientId>/access_as_user) against
// Microsoft's public signing keys. This is what protects API routes,
// instead of a session cookie — see the note in the Phase 3 build about why
// middleware.ts isn't the right mechanism for an MSAL SPA + bearer-token API.
//
// The "common" JWKS endpoint serves Microsoft's signing keys across tenants,
// so this works regardless of whether the caller signed in with a
// work/school account or a personal Microsoft account (e.g. outlook.com).
const JWKS = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys')
);

// Personal Microsoft accounts (outlook.com, etc.) are issued tokens under a
// fixed pseudo-tenant GUID ("9188040d-...") rather than a real org tenant.
const ISSUER_PATTERN = /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/;

export interface VerifiedTokenPayload extends JWTPayload {
  oid?: string; // Entra ID object ID — stable per-user identifier, maps to users.azure_oid
  preferred_username?: string;
  name?: string;
}

export class TokenVerificationError extends Error {}

export async function verifyBearerToken(authorizationHeader: string | null): Promise<VerifiedTokenPayload> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new TokenVerificationError('Missing or malformed Authorization header');
  }
  const token = authorizationHeader.slice('Bearer '.length);

  const clientId = process.env.AZURE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing AZURE_CLIENT_ID environment variable');
  }

  let payload: JWTPayload;
  try {
    // Accept both aud forms: v2-token apps sometimes carry the bare
    // clientId GUID, sometimes the Application ID URI (api://<clientId>) —
    // which one depends on token version settings we don't fully control
    // from the app manifest.
    const result = await jwtVerify(token, JWKS, {
      audience: [clientId, `api://${clientId}`],
      algorithms: ['RS256'],
    });
    payload = result.payload;
  } catch (err) {
    throw new TokenVerificationError(`Token signature/audience verification failed: ${(err as Error).message}`);
  }

  if (typeof payload.iss !== 'string' || !ISSUER_PATTERN.test(payload.iss)) {
    throw new TokenVerificationError('Unexpected token issuer');
  }

  return payload as VerifiedTokenPayload;
}
