import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('get_eu_basis', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('returns GDPR reference for DPDPA', async () => {
    const result = await getEUBasis(db, { document_id: 'act-22-2023' });
    expect(result.results.eu_documents.length).toBeGreaterThan(0);
    const gdpr = result.results.eu_documents.find(d => d.id === 'regulation:2016/679');
    expect(gdpr).toBeDefined();
  });

  it('throws for non-existent document', async () => {
    await expect(getEUBasis(db, { document_id: 'non-existent' })).rejects.toThrow();
  });
});
