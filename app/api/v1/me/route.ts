import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken, TokenVerificationError } from '@/lib/auth/verifyToken';
import { exchangeForGraphToken } from '@/lib/graph/obo';
import { getSupabaseServer } from '@/lib/supabase/server';

// GET /api/v1/me
//
// Proves the full delegated-auth chain end to end: validates the inbound
// bearer token (issued for our own access_as_user scope), exchanges it
// On-Behalf-Of for a Graph-scoped token, calls Graph's /me, and upserts the
// signed-in user into our `users` table (first-login provisioning).
//
// This is the Phase 3 "done when" check from the plan.
export async function GET(request: NextRequest) {
  let claims;
  try {
    claims = await verifyBearerToken(request.headers.get('authorization'));
  } catch (err) {
    if (err instanceof TokenVerificationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const tenantId = claims.tid as string | undefined;
  const oid = claims.oid;
  if (!tenantId || !oid) {
    return NextResponse.json({ error: 'Token missing tid/oid claims' }, { status: 401 });
  }

  const inboundToken = request.headers.get('authorization')!.slice('Bearer '.length);

  let graphToken;
  try {
    graphToken = await exchangeForGraphToken(inboundToken, tenantId, ['User.Read']);
  } catch (err) {
    return NextResponse.json(
      { error: 'On-Behalf-Of token exchange failed', details: (err as Error).message },
      { status: 502 }
    );
  }

  const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${graphToken.accessToken}` },
  });

  if (!graphResponse.ok) {
    return NextResponse.json(
      { error: 'Microsoft Graph /me call failed', status: graphResponse.status },
      { status: 502 }
    );
  }

  const profile = await graphResponse.json();

  // First-login upsert: map Entra ID oid -> users.azure_oid.
  const supabase = getSupabaseServer();
  const email: string | undefined = profile.mail ?? profile.userPrincipalName;
  const fullName: string = profile.displayName ?? 'Unknown Recruiter';

  const { data: user, error } = await supabase
    .from('users')
    .upsert(
      { azure_oid: oid, email, full_name: fullName },
      { onConflict: 'azure_oid' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ graph_profile: profile, user });
}
