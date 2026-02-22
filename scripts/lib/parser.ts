/**
 * HTML parser for India Code legislation pages.
 *
 * India Code (indiacode.nic.in) uses a DSpace-based system with:
 *   - Browse pages: table rows with Enactment Date, Act Number, Short Title, View link
 *   - Act pages: accordion-style sections with lazy-loaded content via AJAX
 *   - Section content: fetched from /SectionPageContent endpoint (JSON)
 *
 * This parser extracts act metadata and section references from HTML pages.
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
 *
 * The browse page uses a table with columns:
 *   t1=Enactment Date, t2=Act Number, t3=Short Title, t4=View link
 */
export function parseActListPage(html: string): ActListResult {
  const $ = cheerio.load(html);
  const entries: ActIndexEntry[] = [];

  // Extract total results from "Showing items X to Y of Z"
  let totalResults: number | undefined;
  const showingText = $('.panel-heading1').text();
  const totalMatch = showingText.match(/of\s+(\d+)/);
  if (totalMatch) {
    totalResults = parseInt(totalMatch[1], 10);
  }

  // Parse table rows — each <tr> has td[headers="t1..t4"]
  $('table.table.table-bordered tr').each((_i, el) => {
    const $el = $(el);

    // Skip header row
    if ($el.find('th').length > 0) return;

    const dateCell = $el.find('td[headers="t1"]').text().trim();
    const actNumCell = $el.find('td[headers="t2"]').text().trim();
    const titleCell = $el.find('td[headers="t3"]').text().trim();
    const viewLink = $el.find('td[headers="t4"] a').attr('href') ?? '';

    if (!titleCell || !viewLink) return;

    // Parse act number (may be zero-padded like "05")
    const actNumber = parseInt(actNumCell, 10) || 0;

    // Extract year from title (e.g., "The Fatal Accidents Act, 1855")
    const yearMatch = titleCell.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;

    // Parse enactment date for more precise year if available
    const dateYearMatch = dateCell.match(/(\d{4})$/);
    const dateYear = dateYearMatch ? parseInt(dateYearMatch[1], 10) : 0;

    const effectiveYear = year || dateYear;
    if (effectiveYear === 0) return;

    const fullUrl = viewLink.startsWith('http')
      ? viewLink
      : `https://www.indiacode.nic.in${viewLink}`;

    entries.push({
      title: titleCell.replace(/\s+/g, ' ').trim(),
      year: effectiveYear,
      actNumber,
      url: fullUrl,
      updated: new Date().toISOString().slice(0, 10),
    });
  });

  // Check for next page link (nextPage.gif image or offset link)
  const hasNextPage = $('a[href*="offset"]').filter((_i, el) => {
    const href = $(el).attr('href') ?? '';
    return href.includes('offset=') && $(el).find('img[src*="nextPage"]').length > 0;
  }).length > 0;

  return { entries, hasNextPage, totalResults };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Reference Types (extracted from act pages)
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionRef {
  actId: string;
  sectionId: string;
  sectionNo: string;
  title: string;
}

/**
 * Extract section references from an act page.
 * Sections are rendered as accordion items with IDs in the format:
 *   actId#sectionId#orgActId
 */
export function extractSectionRefs(html: string): { actId: string; sections: SectionRef[] } {
  const $ = cheerio.load(html);
  const sections: SectionRef[] = [];
  let actId = '';

  // Extract act ID from the preamble title anchor
  const preambleAnchor = $('a.preambletitle');
  if (preambleAnchor.length) {
    actId = preambleAnchor.attr('id') ?? '';
  }

  // If no preamble anchor, try extracting from first section link
  if (!actId) {
    const firstSectionLink = $('div.hideshowsection a.title').first();
    const firstId = firstSectionLink.attr('id') ?? '';
    const parts = firstId.split('#');
    if (parts.length >= 1) {
      actId = parts[0];
    }
  }

  // Extract section references from accordion links
  $('div.hideshowsection a.title').each((_i, el) => {
    const $el = $(el);
    const id = $el.attr('id') ?? '';
    const href = $el.attr('href') ?? '';

    // ID format: actId#sectionId#orgActId
    const idParts = id.split('#');
    if (idParts.length < 2) return;

    const sectionId = idParts[1];

    // Extract section number from the span.label-info text
    const labelText = $el.find('span.label-info').text().trim();
    const sectionNoMatch = labelText.match(/Section\s+([\w.]+)/i);
    const sectionNo = sectionNoMatch ? sectionNoMatch[1].replace(/\.$/, '') : '';

    // Extract title (text after the span, before end of anchor)
    const fullText = $el.text().trim();
    // Remove the "Section X." prefix to get the title
    const titleMatch = fullText.match(/Section\s+[\w.]+\.?\s*(.*)/i);
    const title = titleMatch ? titleMatch[1].trim() : fullText;

    if (!sectionId || !sectionNo) return;

    sections.push({
      actId: idParts[0] || actId,
      sectionId,
      sectionNo,
      title,
    });
  });

  return { actId, sections };
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
 * Extract metadata from an act page.
 */
export function extractActMetadata(html: string): {
  actId: string;
  shortTitle: string;
  longTitle: string;
  enactmentDate: string;
  year: number;
  actNumber: number;
  ministry: string;
} {
  const $ = cheerio.load(html);

  const getMetaField = (label: string): string => {
    let value = '';
    $('table.itemDisplayTable tr').each((_i, el) => {
      const labelCell = $(el).find('td.metadataFieldLabel').text().trim();
      if (labelCell.replace(/[:\s]/g, '').toLowerCase().includes(label.toLowerCase())) {
        value = $(el).find('td.metadataFieldValue').text().trim();
      }
    });
    return value;
  };

  const actIdStr = getMetaField('ActID');
  const actNumberStr = getMetaField('ActNumber');
  const enactmentDate = getMetaField('EnactmentDate');
  const shortTitle = getMetaField('ShortTitle');
  const longTitle = getMetaField('LongTitle');
  const yearStr = getMetaField('ActYear');
  const ministry = getMetaField('Ministry');

  return {
    actId: actIdStr,
    shortTitle,
    longTitle,
    enactmentDate,
    year: parseInt(yearStr, 10) || 0,
    actNumber: parseInt(actNumberStr, 10) || 0,
    ministry,
  };
}

/**
 * Strip HTML tags and normalize whitespace.
 */
export function cleanText(html: string): string {
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
 * Parse section content JSON from /SectionPageContent endpoint.
 */
export function parseSectionContentJson(json: string): { content: string; footnote: string } {
  try {
    const data = JSON.parse(json);
    return {
      content: cleanText(data.content ?? ''),
      footnote: cleanText(data.footnote ?? ''),
    };
  } catch {
    return { content: '', footnote: '' };
  }
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
export function buildShortName(title: string, year: number): string {
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
 * Build a ParsedProvision from section ref + content.
 */
export function buildProvision(
  sectionNo: string,
  title: string,
  content: string,
): ParsedProvision {
  return {
    provision_ref: buildProvisionRef(sectionNo),
    section: sectionNo,
    title,
    content,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy compatibility — parseActHtml
// (For cases where content is inline rather than AJAX-loaded)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an India Code act page HTML to extract provisions.
 * Note: On the live site, section content is loaded via AJAX.
 * This function extracts section titles and any inline content.
 */
export function parseActHtml(
  html: string,
  year: number,
  actNumber: number,
  actTitle: string,
  actUrl: string,
): ParsedAct {
  const { sections } = extractSectionRefs(html);
  const provisions: ParsedProvision[] = sections.map(s => ({
    provision_ref: buildProvisionRef(s.sectionNo),
    section: s.sectionNo,
    title: s.title,
    content: '', // Content must be fetched separately via fetchSectionContent
  }));

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
