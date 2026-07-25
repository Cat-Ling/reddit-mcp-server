/**
 * Tiered Fallback Engine: Official API -> JSON -> HTML Scrape
 */
import crypto from 'crypto';
import { buildHeaders } from '../utils/headers.js';
import { scrapeRedditHtml } from './scraper.js';
import { cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { AppError, RateLimitError, ForbiddenError } from '../utils/errors.js';

const OFFICIAL_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OFFICIAL_BASE_URL = 'https://oauth.reddit.com';
const DEFAULT_BASE_URL = 'https://www.reddit.com';
const FALLBACK_BASE_URL = 'https://old.reddit.com';
const SPOOF_CLIENT_ID = 'ohXpoqrZYub1kg';
const SPOOF_TOKEN_URL = 'https://www.reddit.com/auth/v2/oauth/access-token/loid';
const SPOOF_USER_AGENT = 'Reddit/Version 2026.29.0/Build 2629001/Android 14';

/**
 * Sensible TTLs (in seconds) for different types of content
 */
const CACHE_TTL = {
  LISTING: 300, // 5 mins (Frontpage, Subreddit posts, Search)
  POST_DETAILS: 120, // 2 mins (Details & Comments)
  METADATA: 3600, // 1 hour (Subreddit About/Rules)
  PROFILE: 600, // 10 mins (User profiles)
};

/**
 * Determines TTL based on the request path.
 */
function getTtlForPath(path) {
  if (path.includes('/about') || path.includes('/rules')) return CACHE_TTL.METADATA;
  if (path.includes('/comments/')) return CACHE_TTL.POST_DETAILS;
  if (path.includes('/user/')) return CACHE_TTL.PROFILE;
  return CACHE_TTL.LISTING;
}

let cachedToken = null;
let tokenExpiry = 0;

let spoofToken = null;
let spoofExpiry = 0;
let deviceId = null;

/**
 * Cookie Persistence Jar
 */
const cookieJar = new Map();

function getCookiesString() {
  return Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function updateCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    const setCookies = res.headers.getSetCookie();
    setCookies.forEach((cookieStr) => {
      const [keyVal] = cookieStr.split(';');
      const [key, ...valParts] = keyVal.split('=');
      if (key && valParts.length > 0) {
        cookieJar.set(key.trim(), valParts.join('=').trim());
      }
    });
  }
}

/**
 * Retrieves an OAuth token anonymously by spoofing an Android client.
 */
async function getMobileSpoofToken() {
  if (spoofToken && Date.now() < spoofExpiry) return spoofToken;

  if (!deviceId) {
    deviceId = crypto.randomUUID().toLowerCase();
  }

  try {
    const auth = Buffer.from(`${SPOOF_CLIENT_ID}:`).toString('base64');

    const res = await fetch(SPOOF_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': SPOOF_USER_AGENT,
        'client-vendor-id': deviceId,
        'X-Reddit-Device-Id': deviceId,
      },
      body: JSON.stringify({ scopes: ['*', 'email', 'pii'] }),
    });

    if (!res.ok) {
      throw new AppError(`Spoof Auth failed: ${res.status}`, res.status);
    }
    const data = await res.json();

    spoofToken = data.access_token;
    spoofExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spoofToken;
  } catch (err) {
    logger.warn({ err: err.message }, '[Spoof API] Token acquisition failed');
    return null;
  }
}

/**
 * Retrieves an OAuth token for the official Reddit API using Client Credentials.
 */
async function getOfficialToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(OFFICIAL_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': SPOOF_USER_AGENT,
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new AppError(`Auth failed: ${res.status}`, res.status);
    const data = await res.json();

    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  } catch (err) {
    logger.warn({ err: err.message }, '[Official API] Token acquisition failed');
    return null;
  }
}

/**
 * Main entry point for fetching data with multi-tier fallback and diagnostics.
 */
export async function fetchRedditWithFallback(path, queryParams = {}) {
  const cacheKey = cache.generateKey(path, queryParams);
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    logger.info({ path, cacheKey }, 'Cache hit');
    return {
      ...cachedData,
      diagnostics: { ...cachedData.diagnostics, mode: `${cachedData.diagnostics.mode} (Cached)` },
    };
  }

  const diagnostics = {
    attempts: [],
    mode: 'Unknown',
    status: 'Success',
  };

  const ttl = getTtlForPath(path);

  // 1. Try Official API if credentials exist
  const token = await getOfficialToken();
  if (token) {
    try {
      const data = await executeJsonRequest(path, queryParams, OFFICIAL_BASE_URL, token);
      const result = { data, diagnostics: { ...diagnostics, mode: 'Official API' } };
      cache.set(cacheKey, result, ttl);
      return result;
    } catch (err) {
      diagnostics.attempts.push({ tier: 'Official API', error: err.message });
      if (isTerminalError(err)) {
        logger.error(
          { path, err: err.message },
          'Terminal error encountered during Official API fetch',
        );
        throw err;
      }
      logger.warn(
        { path, err: err.message },
        '[Fallback] Official API failure. Trying internal...',
      );
    }
  }

  // 2. Try Spoofed Mobile API
  const spoofedToken = await getMobileSpoofToken();
  if (spoofedToken) {
    try {
      const data = await executeJsonRequest(
        path,
        queryParams,
        OFFICIAL_BASE_URL,
        spoofedToken,
        SPOOF_USER_AGENT,
      );
      const result = { data, diagnostics: { ...diagnostics, mode: 'Spoofed Mobile API' } };
      cache.set(cacheKey, result, ttl);
      return result;
    } catch (err) {
      diagnostics.attempts.push({ tier: 'Spoofed Mobile API', error: err.message });
      if (isTerminalError(err)) {
        logger.error(
          { path, err: err.message },
          'Terminal error encountered during Spoofed API fetch',
        );
        throw err;
      }
      logger.warn(
        { path, err: err.message },
        '[Fallback] Spoofed Mobile API failure. Trying standard JSON...',
      );
    }
  }

  // 2. Try Standard JSON Tier
  const domains = [DEFAULT_BASE_URL, FALLBACK_BASE_URL];
  for (const domain of domains) {
    try {
      const data = await executeJsonRequest(path, queryParams, domain);
      const tierName = domain.includes('old')
        ? 'Internal Fallback (old.reddit)'
        : 'Internal API (www.reddit)';
      const result = { data, diagnostics: { ...diagnostics, mode: tierName } };
      cache.set(cacheKey, result, ttl);
      return result;
    } catch (err) {
      diagnostics.attempts.push({ tier: domain, error: err.message });
      if (isTerminalError(err)) {
        logger.error(
          { path, domain, err: err.message },
          'Terminal error encountered during JSON fetch',
        );
        throw err;
      }
      logger.warn({ path, domain, err: err.message }, '[Fallback] JSON failure.');
    }
  }

  // 3. Final Tier: Scrape
  try {
    logger.warn({ path }, '[Fallback] Resorting to HTML scrape...');
    const data = await scrapeRedditHtml(path, queryParams);
    const result = { data, diagnostics: { ...diagnostics, mode: 'HTML Scraper (Legacy)' } };
    cache.set(cacheKey, result, ttl);
    return result;
  } catch (err) {
    diagnostics.attempts.push({ tier: 'Scraper', error: err.message });
    logger.error({ path, err: err.message }, 'All tiers exhausted');
    throw new AppError(`All tiers exhausted. Last error: ${err.message}`, 500);
  }
}

async function executeJsonRequest(
  path,
  queryParams,
  baseUrl,
  token = null,
  customUserAgent = null,
) {
  let cleanPath = path;
  if (!baseUrl.includes('oauth')) {
    cleanPath = path.endsWith('.json') ? path : `${path}.json`;
  }
  if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;

  const params = new URLSearchParams({ ...queryParams, raw_json: '1' });
  const url = `${baseUrl}${cleanPath}?${params.toString()}`;

  const headers = token
    ? { Authorization: `Bearer ${token}`, 'User-Agent': customUserAgent || SPOOF_USER_AGENT }
    : buildHeaders(true);

  const cookieStr = getCookiesString();
  if (cookieStr) {
    headers.Cookie = headers.Cookie ? `${headers.Cookie}; ${cookieStr}` : cookieStr;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let res;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError(`Request timed out after 10s on ${baseUrl}`, 408);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  updateCookies(res);

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const text = await res.text();
    if (
      text.includes('<title>Blocked</title>') ||
      text.includes('whoa there, pardner') ||
      text.includes('blocked by mistake')
    ) {
      throw new ForbiddenError(`Blocked by network policy on ${baseUrl}`);
    }
    if (text.includes('is a private community') || text.includes('private community')) {
      throw new ForbiddenError(`Terminal error: Subreddit is private on ${baseUrl}`);
    }
    if (text.includes('has been banned') || text.includes('banned from Reddit')) {
      throw new ForbiddenError(`Terminal error: Subreddit is banned on ${baseUrl}`);
    }
    if (text.includes('quarantined') || text.includes('This community is quarantined')) {
      throw new ForbiddenError(`Terminal error: Subreddit is quarantined on ${baseUrl}`);
    }
    if (text.includes('gated')) {
      throw new ForbiddenError(`Terminal error: Subreddit is gated on ${baseUrl}`);
    }
    if (
      path.includes('/user/') &&
      (text.includes('nobody on Reddit goes by that name') ||
        text.includes('has been suspended') ||
        text.includes('page not found'))
    ) {
      throw new AppError(`Terminal error: user not found on ${baseUrl}`, 404);
    }
    throw new AppError(
      `Expected JSON, got HTML on ${baseUrl} (Status: ${res.status})`,
      res.status === 200 ? 500 : res.status,
    );
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    if (res.status === 429) throw new RateLimitError(`Rate limited (429) on ${baseUrl}`);
    if (res.status === 403) throw new ForbiddenError(`Forbidden (403) on ${baseUrl}`);
    if (!res.ok) throw new AppError(`HTTP ${res.status} on ${baseUrl}`, res.status);
    throw err;
  }

  if (res.status === 429) throw new RateLimitError(`Rate limited (429) on ${baseUrl}`);

  if (res.status === 403) {
    if (
      data &&
      (data.reason === 'private' ||
        data.reason === 'banned' ||
        data.reason === 'quarantined' ||
        data.reason === 'gated')
    ) {
      throw new ForbiddenError(`Terminal error: ${data.reason} on ${baseUrl}`);
    }
    if (data && data.message === 'Forbidden' && data.error === 403) {
      throw new ForbiddenError(`Terminal error: private/forbidden on ${baseUrl}`);
    }
    throw new ForbiddenError(`Forbidden (403) on ${baseUrl}`);
  }

  if (res.status === 404) {
    if (data && data.reason === 'banned') {
      throw new ForbiddenError(`Terminal error: banned on ${baseUrl}`);
    }
    if (path.includes('/user/')) {
      throw new AppError(`Terminal error: user not found on ${baseUrl}`, 404);
    }
  }

  if (!res.ok) throw new AppError(`HTTP ${res.status} on ${baseUrl}`, res.status);

  if (data && data.error)
    throw new AppError(`Reddit API Error: ${data.reason || data.message || data.error}`, 400);

  return data;
}

function isTerminalError(err) {
  const msg = err.message ? err.message.toLowerCase() : '';
  return (
    msg.includes('private') ||
    msg.includes('banned') ||
    msg.includes('404') ||
    msg.includes('quarantined') ||
    msg.includes('gated') ||
    msg.includes('user not found')
  );
}
