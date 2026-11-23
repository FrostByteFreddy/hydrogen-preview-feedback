/** Minimal Admin GraphQL client for the store the storefront belongs to. */

export type AdminGraphql = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<{data?: any; errors?: unknown}>;

/**
 * Credentials of a Dev Dashboard app installed on the store (client
 * credentials grant; the app and the store must be in the same Shopify
 * organization), or a fixed Admin API access token.
 */
export type AdminCredentials =
  | {storeDomain: string; clientId: string; clientSecret: string}
  | {storeDomain: string; accessToken: string};

export const DEFAULT_API_VERSION = '2026-04';

type CachedToken = {token: string; expiresAt: number};
const tokenCache = new Map<string, CachedToken>();

/**
 * Exchanges client credentials for an Admin API token. Tokens last about
 * 24 hours and there's no refresh token, so they're cached per worker and
 * requested again a minute before they expire.
 */
export async function getClientCredentialsToken({
  storeDomain,
  clientId,
  clientSecret,
  fetchImpl = fetch,
  now = Date.now,
}: {
  storeDomain: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<string> {
  const key = `${storeDomain}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now()) return cached.token;

  const response = await fetchImpl(
    `https://${storeDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Token request responded ${response.status}`);
  }
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Error('Token response without access_token');
  const lifetimeMs = (body.expires_in ?? 3600) * 1000;
  tokenCache.set(key, {
    token: body.access_token,
    expiresAt: now() + Math.max(lifetimeMs - 60_000, 0),
  });
  return body.access_token;
}

/** For tests: forget cached tokens. */
export function clearTokenCache() {
  tokenCache.clear();
}

export function createAdminGraphql({
  storeDomain,
  accessToken,
  apiVersion = DEFAULT_API_VERSION,
  fetchImpl = fetch,
}: {
  storeDomain: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}): AdminGraphql {
  return async (query, variables) => {
    const response = await fetchImpl(
      `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({query, variables}),
      },
    );
    if (!response.ok) {
      throw new Error(`Admin API responded ${response.status}`);
    }
    return (await response.json()) as {data?: any; errors?: unknown};
  };
}

export async function adminFromCredentials(
  credentials: AdminCredentials,
  apiVersion?: string,
): Promise<AdminGraphql> {
  const accessToken =
    'accessToken' in credentials
      ? credentials.accessToken
      : await getClientCredentialsToken(credentials);
  return createAdminGraphql({
    storeDomain: credentials.storeDomain,
    accessToken,
    apiVersion,
  });
}
