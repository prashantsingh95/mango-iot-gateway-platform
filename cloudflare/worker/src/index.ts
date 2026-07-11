/**
 * Cloudflare Worker — API Gateway for the Mango IoT Gateway Platform.
 *
 * This Worker sits in front of the NestJS backend. It does NOT contain business
 * logic. Its responsibilities are strictly edge concerns:
 *   - Authenticate requests / validate JWT (HS256)
 *   - Apply edge rate limiting (per-IP, KV backed)
 *   - Apply security headers
 *   - Handle CORS (incl. pre-flight)
 *   - Log requests
 *   - Proxy everything else to the NestJS backend
 *
 * The backend remains the single source of truth — it is never migrated here.
 */

export interface Env {
  /** Origin of the NestJS backend, e.g. https://api.internal.example.com */
  BACKEND_URL: string;
  /** JWT signing secret — must match the backend's JWT_SECRET. */
  JWT_SECRET: string;
  /** Comma-separated list of allowed CORS origins. */
  CORS_ORIGINS: string;
  /** Max requests per window (default 100). */
  RATE_LIMIT_MAX?: string;
  /** Rate-limit window in seconds (default 60). */
  RATE_LIMIT_WINDOW?: string;
  /** Optional KV namespace used for distributed rate limiting. */
  RATE_LIMIT_KV?: KVNamespace;
}

/** Paths that do not require a valid JWT. */
const PUBLIC_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/health',
  '/api/v1/provisioning/gateway',
  '/api/v1/provisioning/config',
  '/api/docs',
];

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Verifies an HS256 JWT and returns its payload, or null if invalid/expired. */
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Tenant-ID',
    Vary: 'Origin',
  };
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

async function rateLimit(env: Env, ip: string): Promise<boolean> {
  if (!env.RATE_LIMIT_KV) return true; // rate limiting disabled without KV
  const max = parseInt(env.RATE_LIMIT_MAX || '100', 10);
  const windowSec = parseInt(env.RATE_LIMIT_WINDOW || '60', 10);
  const key = `rl:${ip}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
  if (current >= max) return false;
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: windowSec });
  return true;
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowed = (env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, allowed);
    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    const start = Date.now();

    // Pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, ...SECURITY_HEADERS } });
    }

    // Edge rate limiting
    if (!(await rateLimit(env, ip))) {
      return new Response(JSON.stringify({ statusCode: 429, message: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...cors, ...SECURITY_HEADERS },
      });
    }

    // JWT authentication for protected paths
    if (!isPublic(url.pathname)) {
      const auth = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = token ? await verifyJwt(token, env.JWT_SECRET) : null;
      if (!payload) {
        return new Response(JSON.stringify({ statusCode: 401, message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...cors, ...SECURITY_HEADERS },
        });
      }
    }

    // Proxy to the NestJS backend
    const backendUrl = new URL(url.pathname + url.search, env.BACKEND_URL);
    const proxied = new Request(backendUrl.toString(), request);
    proxied.headers.set('X-Forwarded-For', ip);
    proxied.headers.set('X-Forwarded-Host', url.host);

    let response: Response;
    try {
      response = await fetch(proxied);
    } catch (err) {
      console.log(JSON.stringify({ level: 'error', ip, path: url.pathname, error: String(err) }));
      return new Response(JSON.stringify({ statusCode: 502, message: 'Bad Gateway' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...cors, ...SECURITY_HEADERS },
      });
    }

    // Structured access log
    console.log(
      JSON.stringify({
        level: 'info',
        ip,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Date.now() - start,
      }),
    );

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries({ ...cors, ...SECURITY_HEADERS })) headers.set(k, v);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
