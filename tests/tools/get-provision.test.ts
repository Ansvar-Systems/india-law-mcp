import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getProvision } from '../../src/tools/get-provision.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('get_provision', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('retrieves a specific provision by section', async () => {
    const result = await getProvision(db, { document_id: 'act-22-2023', section: '4' });
    expect(result.results).not.toBeNull();
    if (result.results && !Array.isArray(result.results) && !('provisions' in result.results)) {
      expect(result.results.content).toContain('personal data');
    }
  });

  it('retrieves by provision_ref', async () => {
    const result = await getProvision(db, { document_id: 'act-22-2023', provision_ref: 's4' });
    expect(result.results).not.toBeNull();
  });

  it('returns null for non-existent provision', async () => {
    const result = await getProvision(db, { document_id: 'act-22-2023', section: '999' });
    expect(result.results).toBeNull();
  });

  it('returns all provisions when no section specified', async () => {
    const result = await getProvision(db, { document_id: 'act-22-2023' });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('resolves document by title', async () => {
    const result = await getProvision(db, { document_id: 'Digital Personal Data Protection Act', section: '4' });
    expect(result.results).not.toBeNull();
  });
});
