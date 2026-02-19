import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('validate_eu_compliance', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('returns compliant for DPDPA with GDPR reference', async () => {
    const result = await validateEUCompliance(db, { document_id: 'act-22-2023' });
    expect(result.results.compliance_status).toBe('compliant');
    expect(result.results.eu_references_found).toBeGreaterThan(0);
  });

  it('returns not_applicable for document without EU references', async () => {
    const result = await validateEUCompliance(db, { document_id: 'act-18-2013' });
    expect(result.results.compliance_status).toBe('not_applicable');
  });

  it('throws for non-existent document', async () => {
    await expect(validateEUCompliance(db, { document_id: 'non-existent' })).rejects.toThrow();
  });
});
