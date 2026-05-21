/**
 * Client Header & Evasion Utilities
 */

const CHROME_VERSION_URL = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json';

let latestChromeVersion = '120.0.0.0'; // Hardcoded fallback

/**
 * Periodically refreshes the latest stable Chrome version.
 */
async function refreshChromeVersion() {
  try {
    const res = await fetch(CHROME_VERSION_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const version = data.channels?.Stable?.version;
    if (version) {
      latestChromeVersion = version;
    }
  } catch (err) {
    // Fail silently, use fallback
  }
}

// Initial fetch
refreshChromeVersion();
// Refresh every 24 hours
setInterval(refreshChromeVersion, 24 * 60 * 60 * 1000).unref();

export function getRandomUserAgent() {
  const v = latestChromeVersion;
  const agents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`,
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Builds HTTP headers with randomized ordering to evade detection.
 * @param {boolean} isJson - Whether the request expects JSON or HTML.
 */
export function buildHeaders(isJson = true) {
  const v = latestChromeVersion.split('.')[0];
  const headers = [
    ['User-Agent', getRandomUserAgent()],
    ['Accept', isJson ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
    ['Accept-Language', 'en-US,en;q=0.9'],
    ['Cache-Control', 'no-cache'],
    ['Pragma', 'no-cache'],
    ['Cookie', 'over18=1'],
    ['Sec-Ch-Ua', `"Not_A Brand";v="8", "Chromium";v="${v}", "Google Chrome";v="${v}"`],
    ['Sec-Ch-Ua-Mobile', '?0'],
    ['Sec-Ch-Ua-Platform', '"Windows"'],
    ['Sec-Fetch-Dest', isJson ? 'empty' : 'document'],
    ['Sec-Fetch-Mode', isJson ? 'cors' : 'navigate'],
    ['Sec-Fetch-Site', 'same-origin'],
    ['Sec-Fetch-User', '?1'],
    ['Upgrade-Insecure-Requests', '1'],
  ];

  return Object.fromEntries(shuffleArray(headers));
}
