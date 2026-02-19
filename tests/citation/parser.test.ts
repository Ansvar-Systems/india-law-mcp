import { describe, it, expect } from 'vitest';
import { parseCitation } from '../../src/citation/parser.js';

describe('parseCitation', () => {
  it('parses full citation: Section 4, Digital Personal Data Protection Act, 2023', () => {
    const result = parseCitation('Section 4, Digital Personal Data Protection Act, 2023');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('4');
    expect(result.title).toContain('Digital Personal Data Protection Act');
    expect(result.year).toBe(2023);
  });

  it('parses short citation: s. 43A IT Act 2000', () => {
    const result = parseCitation('s. 43A IT Act 2000');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('43A');
    expect(result.year).toBe(2000);
  });

  it('parses trailing section: Information Technology Act, 2000, s. 66', () => {
    const result = parseCitation('Information Technology Act, 2000, s. 66');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('66');
    expect(result.title).toContain('Information Technology Act');
    expect(result.year).toBe(2000);
  });

  it('parses section with subsection: s. 4(1)', () => {
    const result = parseCitation('s. 4(1) DPDPA 2023');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('4');
    expect(result.subsection).toBe('1');
    expect(result.year).toBe(2023);
  });

  it('returns invalid for unparseable citation', () => {
    const result = parseCitation('some random text');
    expect(result.valid).toBe(false);
    expect(result.type).toBe('unknown');
  });

  it('handles S. (capital) prefix', () => {
    const result = parseCitation('S. 66 IT Act 2000');
    expect(result.valid).toBe(true);
    expect(result.section).toBe('66');
  });
});
