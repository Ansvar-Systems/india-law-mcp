/**
 * Indian legal citation formatter.
 *
 * Formats:
 *   full:     "Section 4, Digital Personal Data Protection Act, 2023"
 *   short:    "s. 4 DPDPA 2023"
 *   pinpoint: "s. 4(1)(a)"
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

export function formatCitation(
  parsed: ParsedCitation,
  format: CitationFormat = 'full'
): string {
  if (!parsed.valid || !parsed.section) {
    return '';
  }

  const pinpoint = buildPinpoint(parsed);

  switch (format) {
    case 'full':
      return `Section ${pinpoint}, ${parsed.title ?? ''}, ${parsed.year ?? ''}`.trim().replace(/,\s*$/, '');

    case 'short':
      return `s. ${pinpoint} ${parsed.title ?? ''} ${parsed.year ?? ''}`.trim();

    case 'pinpoint':
      return `s. ${pinpoint}`;

    default:
      return `Section ${pinpoint}, ${parsed.title ?? ''}, ${parsed.year ?? ''}`.trim().replace(/,\s*$/, '');
  }
}

function buildPinpoint(parsed: ParsedCitation): string {
  let ref = parsed.section ?? '';
  if (parsed.subsection) {
    ref += `(${parsed.subsection})`;
  }
  if (parsed.clause) {
    ref += `(${parsed.clause})`;
  }
  return ref;
}
