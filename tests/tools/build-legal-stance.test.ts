import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('build_legal_stance', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('returns provisions for data protection query', async () => {
    const result = await buildLegalStance(db, { query: 'personal data protection' });
    expect(result.results.provisions.length).toBeGreaterThan(0);
    expect(result.results.query).toBe('personal data protection');
  });

  it('returns empty for empty query', async () => {
    const result = await buildLegalStance(db, { query: '' });
    expect(result.results.provisions.length).toBe(0);
  });

  it('respects limit', async () => {
    const result = await buildLegalStance(db, { query: 'data', limit: 1 });
    expect(result.results.provisions.length).toBeLessThanOrEqual(1);
  });
});
