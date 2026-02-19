/**
 * Indian legal citation parser.
 *
 * Parses citations like:
 *   "Section 4, Digital Personal Data Protection Act, 2023"
 *   "s. 43A, Information Technology Act, 2000"
 *   "S. 66 IT Act 2000"
 *   "Art. 21, Constitution of India"
 */

import type { ParsedCitation } from '../types/index.js';

// Full citation: "Section 4, Digital Personal Data Protection Act, 2023"
const FULL_CITATION = /^(?:Section|s\.?|Art\.?)\s+(\d+[A-Za-z]?(?:\(\d+\))*(?:\([a-z]\))*)\s*,?\s+(.+?)\s*,?\s*(\d{4})$/i;

// Short citation: "s. 43A IT Act 2000"
const SHORT_CITATION = /^(?:s\.?|S\.?)\s+(\d+[A-Za-z]?(?:\(\d+\))*(?:\([a-z]\))*)\s+(.+?)\s+(\d{4})$/i;

// Trailing section citation: "Digital Personal Data Protection Act, 2023, s. 4"
const TRAILING_SECTION = /^(.+?)\s*,?\s*(\d{4})\s*,?\s*(?:Section|s\.?|Art\.?)\s*(\d+[A-Za-z]?(?:\(\d+\))*(?:\([a-z]\))*)$/i;

// Article citation for Constitution: "Article 21, Constitution of India"
const ARTICLE_CITATION = /^(?:Article|Art\.?)\s+(\d+[A-Za-z]?)\s*,?\s+(.+?)(?:\s*,?\s*(\d{4}))?$/i;

// Section with subsection: "43A(1)(a)"
const SECTION_REF = /^(\d+[A-Za-z]?)(?:\((\d+)\))?(?:\(([a-z])\))?$/;

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  // Try article citation (Constitution)
  let match = trimmed.match(ARTICLE_CITATION);
  if (match && /constitution/i.test(match[2])) {
    return parseSection(match[1], match[2], match[3] ? parseInt(match[3], 10) : 1950, 'statute');
  }

  // Try full citation
  match = trimmed.match(FULL_CITATION);
  if (match) {
    return parseSection(match[1], match[2], parseInt(match[3], 10), 'statute');
  }

  // Try short citation
  match = trimmed.match(SHORT_CITATION);
  if (match) {
    return parseSection(match[1], match[2], parseInt(match[3], 10), 'statute');
  }

  // Try trailing section citation
  match = trimmed.match(TRAILING_SECTION);
  if (match) {
    return parseSection(match[3], match[1], parseInt(match[2], 10), 'statute');
  }

  return {
    valid: false,
    type: 'unknown',
    error: `Could not parse Indian citation: "${trimmed}"`,
  };
}

function parseSection(
  sectionStr: string,
  title: string,
  year: number,
  type: 'statute' | 'rules' | 'directions'
): ParsedCitation {
  const sectionMatch = sectionStr.match(SECTION_REF);
  if (!sectionMatch) {
    return {
      valid: true,
      type,
      title: title.trim(),
      year,
      section: sectionStr,
    };
  }

  return {
    valid: true,
    type,
    title: title.trim(),
    year,
    section: sectionMatch[1],
    subsection: sectionMatch[2] || undefined,
    clause: sectionMatch[3] || undefined,
  };
}
