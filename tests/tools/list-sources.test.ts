import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { listSources } from '../../src/tools/list-sources.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('list_sources', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('returns jurisdiction and sources', async () => {
    const result = await listSources(db);
    expect(result.results.jurisdiction).toBe('India (IN)');
    expect(result.results.sources.length).toBeGreaterThan(0);
    expect(result.results.database.document_count).toBeGreaterThan(0);
  });

  it('includes India Code as a source', async () => {
    const result = await listSources(db);
    const indiaCode = result.results.sources.find(s => s.name.includes('India Code'));
    expect(indiaCode).toBeDefined();
    expect(indiaCode!.url).toBe('https://www.indiacode.nic.in');
  });
});
