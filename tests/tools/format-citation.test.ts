import { describe, it, expect } from 'vitest';
import { formatCitationTool } from '../../src/tools/format-citation.js';

describe('format_citation', () => {
  it('formats a full citation', async () => {
    const result = await formatCitationTool({ citation: 'Section 4, Digital Personal Data Protection Act, 2023' });
    expect(result.results.valid).toBe(true);
    expect(result.results.formatted).toContain('Section 4');
    expect(result.results.formatted).toContain('Digital Personal Data Protection Act');
  });

  it('formats a short citation', async () => {
    const result = await formatCitationTool({ citation: 's. 43A IT Act 2000', format: 'short' });
    expect(result.results.valid).toBe(true);
    expect(result.results.formatted).toContain('s. 43A');
  });

  it('formats a pinpoint citation', async () => {
    const result = await formatCitationTool({ citation: 'Section 66, Information Technology Act, 2000', format: 'pinpoint' });
    expect(result.results.valid).toBe(true);
    expect(result.results.formatted).toBe('s. 66');
  });

  it('returns invalid for empty input', async () => {
    const result = await formatCitationTool({ citation: '' });
    expect(result.results.valid).toBe(false);
  });
});
