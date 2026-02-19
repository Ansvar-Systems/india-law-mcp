import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateCitation } from '../../src/citation/validator.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type Database from '@ansvar/mcp-sqlite';

let db: InstanceType<typeof Database>;

describe('validateCitation', () => {
  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('validates existing document and provision', () => {
    const result = validateCitation(db, 'Section 4, Digital Personal Data Protection Act, 2023');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  it('returns document_exists=false for unknown act', () => {
    const result = validateCitation(db, 'Section 1, Fictitious Act, 9999');
    expect(result.document_exists).toBe(false);
  });

  it('returns invalid for unparseable citation', () => {
    const result = validateCitation(db, 'gibberish');
    expect(result.citation.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
