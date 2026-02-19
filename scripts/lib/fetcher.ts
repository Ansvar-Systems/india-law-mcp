/**
 * Rate-limited HTTP client for India Code (indiacode.nic.in)
 *
 * - 500ms minimum delay between requests (India Code is a government site)
 * - User-Agent header identifying the MCP
 * - Handles HTML responses
 * - No auth needed (Government Open Data)
 */

const USER_AGENT = 'India-Law-MCP/1.0 (https://github.com/Ansvar-Systems/india-law-mcp; hello@ansvar.ai)';
const MIN_DELAY_MS = 500;

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
}

/**
 * Fetch a URL with rate limiting and proper headers.
 * Retries up to 3 times on 429/5xx errors with exponential backoff.
 */
export async function fetchWithRateLimit(url: string, maxRetries = 3): Promise<FetchResult> {
  await rateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html, application/xhtml+xml, */*',
      },
    });

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status} for ${url}, retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }

    const body = await response.text();
    return {
      status: response.status,
      body,
      contentType: response.headers.get('content-type') ?? '',
    };
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * Fetch the act listing page from India Code
 */
export async function fetchActListPage(page: number): Promise<FetchResult> {
  const url = `https://www.indiacode.nic.in/handle/123456789/1362/browse?type=actno&sort_by=2&order=ASC&rpp=50&page=${page}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch HTML for a specific act from India Code
 */
export async function fetchActHtml(actUrl: string): Promise<FetchResult> {
  return fetchWithRateLimit(actUrl);
}

/**
 * Fetch a specific section/provision from India Code
 */
export async function fetchSectionHtml(sectionUrl: string): Promise<FetchResult> {
  return fetchWithRateLimit(sectionUrl);
}
