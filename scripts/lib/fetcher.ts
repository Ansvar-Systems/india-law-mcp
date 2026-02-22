/**
 * Rate-limited HTTP client for India Code (indiacode.nic.in)
 *
 * - 500ms minimum delay between requests (India Code is a government site)
 * - User-Agent header identifying the MCP
 * - Handles HTML responses
 * - No auth needed (Government Open Data)
 */

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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
        'Accept': 'text/html, application/xhtml+xml, application/json, */*',
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
 * Fetch the act listing page from India Code (DSpace browse by short title).
 * Uses offset-based pagination, 50 items per page.
 * Page 1 => offset=0, page 2 => offset=50, etc.
 */
export async function fetchActListPage(page: number): Promise<FetchResult> {
  const offset = (page - 1) * 50;
  const url = `https://www.indiacode.nic.in/handle/123456789/1362/browse?type=shorttitle&sort_by=1&order=ASC&rpp=50&etal=-1&offset=${offset}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch HTML for a specific act from India Code
 */
export async function fetchActHtml(actUrl: string): Promise<FetchResult> {
  return fetchWithRateLimit(actUrl);
}

/**
 * Fetch section content from the India Code AJAX endpoint.
 * Returns JSON with { content, footnote } fields.
 */
export async function fetchSectionContent(actId: string, sectionId: string): Promise<FetchResult> {
  const url = `https://www.indiacode.nic.in/SectionPageContent?actid=${encodeURIComponent(actId)}&sectionID=${encodeURIComponent(sectionId)}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch a specific section/provision from India Code (legacy)
 */
export async function fetchSectionHtml(sectionUrl: string): Promise<FetchResult> {
  return fetchWithRateLimit(sectionUrl);
}
