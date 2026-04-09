/**
 * Shared metadata types and factory for MCP tool responses.
 *
 * Every tool response includes a _meta block so consumers can surface
 * provenance, age, and disclaimer information without additional lookups.
 *
 * See: docs/guides/law-mcp-golden-standard.md Section 4.9
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { CitationMetadata } from './citation.js';

export interface MetaBlock {
  disclaimer: string;
  data_age: string;
  copyright: string;
  source_url: string;
  [key: string]: unknown;
}

export interface ToolResponse<T> {
  results: T;
  _meta: MetaBlock;
  _citation?: CitationMetadata;
  _error_type?: string;
}

/**
 * Build the standard _meta block for a tool response.
 *
 * Reads `built_at` from the db_metadata table to populate data_age.
 * Falls back to 'unknown' if the table is absent or the value is missing.
 */
export function generateResponseMetadata(db?: Database): MetaBlock {
  let data_age = 'unknown';
  if (db) {
    try {
      const row = db
        .prepare('SELECT value FROM db_metadata WHERE key = ?')
        .get('built_at') as { value: string } | undefined;
      if (row?.value) {
        // Normalise to YYYY-MM-DD
        data_age = row.value.slice(0, 10);
      }
    } catch {
      // db_metadata table absent — tolerate gracefully
    }
  }
  return {
    disclaimer:
      'This is a research tool, not legal advice. Verify critical citations against official sources.',
    data_age,
    copyright: '© Government of India / National Informatics Centre',
    source_url: 'https://www.indiacode.nic.in',
  };
}
