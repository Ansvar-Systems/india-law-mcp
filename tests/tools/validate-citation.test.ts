import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('validate_citation', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('validates a correct DPDPA citation', async () => {
    const result = await validateCitationTool(db, { citation: 'Section 4, Digital Personal Data Protection Act, 2023' });
    expect(result.results.valid).toBe(true);
    expect(result.results.document_exists).toBe(true);
  });

  it('returns invalid for empty citation', async () => {
    const result = await validateCitationTool(db, { citation: '' });
    expect(result.results.valid).toBe(false);
  });

  it('returns document_exists false for unknown act', async () => {
    const result = await validateCitationTool(db, { citation: 'Section 1, Nonexistent Act, 9999' });
    expect(result.results.document_exists).toBe(false);
  });
});
