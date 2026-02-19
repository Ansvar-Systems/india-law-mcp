import { describe, it, expect } from 'vitest';
import { formatCitation } from '../../src/citation/formatter.js';
import type { ParsedCitation } from '../../src/types/index.js';

describe('formatCitation', () => {
  const parsed: ParsedCitation = {
    valid: true,
    type: 'statute',
    title: 'Digital Personal Data Protection Act',
    year: 2023,
    section: '4',
  };

  it('formats full citation', () => {
    const result = formatCitation(parsed, 'full');
    expect(result).toBe('Section 4, Digital Personal Data Protection Act, 2023');
  });

  it('formats short citation', () => {
    const result = formatCitation(parsed, 'short');
    expect(result).toBe('s. 4 Digital Personal Data Protection Act 2023');
  });

  it('formats pinpoint citation', () => {
    const result = formatCitation(parsed, 'pinpoint');
    expect(result).toBe('s. 4');
  });

  it('formats with subsection', () => {
    const withSub: ParsedCitation = { ...parsed, subsection: '1', clause: 'a' };
    const result = formatCitation(withSub, 'full');
    expect(result).toBe('Section 4(1)(a), Digital Personal Data Protection Act, 2023');
  });

  it('returns empty string for invalid citation', () => {
    const invalid: ParsedCitation = { valid: false, type: 'unknown' };
    expect(formatCitation(invalid)).toBe('');
  });
});
