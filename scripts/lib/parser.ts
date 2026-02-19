/**
 * HTML parser for India Code legislation pages.
 *
 * India Code (indiacode.nic.in) uses dynamic HTML with section navigation.
 * This parser extracts act metadata and section text from the HTML pages
 * using cheerio for DOM manipulation.
 */

import * as cheerio from 'cheerio';

// ─────────────────────────────────────────────────────────────────────────────
// Act Index Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActIndexEntry {
  title: string;
  year: number;
  actNumber: number;
  url: string;
  updated: string;
}

export interface ActListResult {
  entries: ActIndexEntry[];
  hasNextPage: boolean;
  totalResults?: number;
}

/**
 * Parse the India Code act listing page to extract act entries.
 */
export function parseActListPage(html: string): ActListResult {
  const $ = cheerio.load(html);
  const entries: ActIndexEntry[] = [];

  // India Code lists acts in a table/list format
  $('table.table tbody tr, .artifact-title a, .ds-artifact-item').each((_i, el) => {
    const $el = $(el);
    const linkEl = $el.find('a').first().length ? $el.find('a').first() : $el;
    const title = linkEl.text().trim();
    const href = linkEl.attr('href') ?? '';

    if (!title || !href) return;

    // Extract year and act number from title pattern: "Act Name, Year (No. X of Year)"
    const yearMatch = title.match(/,?\s*(\d{4})\s*$/);
    const actNoMatch = title.match(/\(?(?:No\.?\s*)?(\d+)\s+of\s+(\d{4})\)?/i);

    const year = yearMatch ? parseInt(yearMatch[1], 10) : (actNoMatch ? parseInt(actNoMatch[2], 10) : 0);
    const actNumber = actNoMatch ? parseInt(actNoMatch[1], 10) : 0;

    if (year === 0) return;

    const fullUrl = href.startsWith('http') ? href : `https://www.indiacode.nic.in${href}`;

    entries.push({
      title: title.replace(/\s+/g, ' ').trim(),
      year,
      actNumber,
      url: fullUrl,
      updated: new Date().toISOString().slice(0, 10),
    });
  });

  // Check for next page link
  const hasNextPage = $('a.next-page-link, .pagination .next a, a:contains("Next")').length > 0;

  return { entries, hasNextPage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Act Content Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedProvision {
  provision_ref: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed';
  issued_date: string;
  url: string;
  provisions: ParsedProvision[];
  language?: string;
}

/**
 * Strip HTML tags and normalize whitespace.
 */
function cleanText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a section provision_ref like "s4", "s43A", "s66(1)"
 */
function buildProvisionRef(sectionNum: string): string {
  const cleaned = sectionNum.replace(/^section\s*/i, '').replace(/\.\s*$/, '').trim();
  return `s${cleaned}`;
}

/**
 * Build a short name abbreviation from title, e.g. "DPDPA 2023"
 */
function buildShortName(title: string, year: number): string {
  const words = title.replace(/[(),]/g, '').split(/\s+/);
  if (words.length <= 3) return `${title} ${year}`;

  const significant = words.filter(w =>
    w.length > 2 &&
    w[0] === w[0].toUpperCase() &&
    !['The', 'And', 'For', 'Act', 'Of', 'In', 'To', 'With'].includes(w)
  );

  if (significant.length >= 2) {
    const initials = significant.slice(0, 5).map(w => w[0]).join('');
    return `${initials} ${year}`;
  }

  return `${title.substring(0, 30).trim()} ${year}`;
}

/**
 * Parse an India Code act page HTML to extract provisions.
 */
export function parseActHtml(
  html: string,
  year: number,
  actNumber: number,
  actTitle: string,
  actUrl: string,
): ParsedAct {
  const $ = cheerio.load(html);
  const provisions: ParsedProvision[] = [];

  // India Code renders sections in various HTML structures
  // Try multiple selectors for section content
  const sectionSelectors = [
    '.akn-section',
    '.section-content',
    'div[id^="section"]',
    '.act-section',
    'table.section-table tr',
  ];

  for (const selector of sectionSelectors) {
    $(selector).each((_i, el) => {
      const $el = $(el);

      // Extract section number
      const numEl = $el.find('.akn-num, .section-num, .section-number, td:first-child').first();
      const sectionNum = cleanText(numEl.html() ?? '').replace(/[\[\]]/g, '');

      if (!sectionNum || !/\d/.test(sectionNum)) return;

      // Extract heading/title
      const headingEl = $el.find('.akn-heading, .section-heading, .section-title, h4, h5').first();
      const heading = cleanText(headingEl.html() ?? '');

      // Extract content
      const contentEl = $el.find('.akn-content, .section-text, .section-body, td:last-child').first();
      let content = cleanText(contentEl.html() ?? '');

      // If no specific content element, use the whole section text
      if (!content) {
        content = cleanText($el.html() ?? '');
      }

      if (content.length < 10) return;

      const provRef = buildProvisionRef(sectionNum);

      provisions.push({
        provision_ref: provRef,
        section: sectionNum.replace(/\.\s*$/, '').trim(),
        title: heading,
        content,
      });
    });

    if (provisions.length > 0) break;
  }

  return {
    id: `act-${actNumber}-${year}`,
    type: 'statute',
    title: actTitle,
    short_name: buildShortName(actTitle, year),
    status: 'in_force',
    issued_date: `${year}-01-01`,
    url: actUrl,
    provisions,
  };
}
