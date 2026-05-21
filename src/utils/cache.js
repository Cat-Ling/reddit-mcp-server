/**
 * Simple TTL-based In-Memory Cache
 */

class RedditCache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Sets a value in the cache with a specific TTL.
   * @param {string} key - Cache key (usually the full URL + params)
   * @param {any} value - The data to store
   * @param {number} ttlSeconds - Time-to-live in seconds
   */
  set(key, value, ttlSeconds) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Retrieves a value if it exists and hasn't expired.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Generates a deterministic cache key from path and params.
   */
  // eslint-disable-next-line class-methods-use-this
  generateKey(path, queryParams = {}, mode = 'default') {
    const sortedParams = Object.keys(queryParams)
      .sort()
      .map((k) => `${k}=${queryParams[k]}`)
      .join('&');
    return `${mode}:${path}?${sortedParams}`;
  }

  /**
   * Periodic cleanup of expired entries to prevent memory leaks.
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

export const cache = new RedditCache();

// Run cleanup every 10 minutes
setInterval(() => cache.cleanup(), 10 * 60 * 1000).unref();
