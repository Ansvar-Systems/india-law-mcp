import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('check_currency', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('reports in-force status for DPDPA', async () => {
    const result = await checkCurrency(db, { document_id: 'act-22-2023' });
    expect(result.results).not.toBeNull();
    expect(result.results!.is_current).toBe(true);
    expect(result.results!.status).toBe('in_force');
  });

  it('returns null for non-existent document', async () => {
    const result = await checkCurrency(db, { document_id: 'non-existent-act' });
    expect(result.results).toBeNull();
  });

  it('checks provision existence when provision_ref provided', async () => {
    const result = await checkCurrency(db, { document_id: 'act-22-2023', provision_ref: 's4' });
    expect(result.results).not.toBeNull();
    expect(result.results!.provision_exists).toBe(true);
  });
});
