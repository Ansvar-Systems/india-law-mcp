import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { searchLegislation } from '../../src/tools/search-legislation.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('search_legislation', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('searches for personal data and returns results', async () => {
    const result = await searchLegislation(db, { query: 'personal data' });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result._metadata).toBeDefined();
  });

  it('returns empty results for empty query', async () => {
    const result = await searchLegislation(db, { query: '' });
    expect(result.results).toEqual([]);
  });

  it('respects limit parameter', async () => {
    const result = await searchLegislation(db, { query: 'data', limit: 1 });
    expect(result.results.length).toBeLessThanOrEqual(1);
  });

  it('filters by document_id', async () => {
    const result = await searchLegislation(db, { query: 'data', document_id: 'act-22-2023' });
    for (const r of result.results) {
      expect(r.document_id).toBe('act-22-2023');
    }
  });
});
