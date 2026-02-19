/**
 * search_legislation — Full-text search across Indian statute provisions.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchLegislationInput {
  query: string;
  document_id?: string;
  status?: string;
  as_of_date?: string;
  limit?: number;
}

export interface SearchLegislationResult {
  document_id: string;
  document_title: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  snippet: string;
  relevance: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchLegislation(
  db: Database,
  input: SearchLegislationInput
): Promise<ToolResponse<SearchLegislationResult[]>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: [],
      _metadata: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const queryVariants = buildFtsQueryVariants(input.query);
  // Validate as_of_date if provided (throws on invalid format)
  if (input.as_of_date) normalizeAsOfDate(input.as_of_date);

  let sql = `
    SELECT
      lp.document_id,
      ld.title as document_title,
      lp.provision_ref,
      lp.chapter,
      lp.section,
      lp.title,
      snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) as snippet,
      bm25(provisions_fts) as relevance
    FROM provisions_fts
    JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
    JOIN legal_documents ld ON ld.id = lp.document_id
    WHERE provisions_fts MATCH ?
  `;

  const params: (string | number)[] = [];

  if (input.document_id) {
    sql += ` AND lp.document_id = ?`;
    params.push(input.document_id);
  }

  if (input.status) {
    sql += ` AND ld.status = ?`;
    params.push(input.status);
  }

  sql += ` ORDER BY relevance LIMIT ?`;
  params.push(limit);

  const runQuery = (ftsQuery: string): SearchLegislationResult[] => {
    const bound = [ftsQuery, ...params];
    return db.prepare(sql).all(...bound) as SearchLegislationResult[];
  };

  const primaryResults = runQuery(queryVariants.primary);
  const results = (primaryResults.length > 0 || !queryVariants.fallback)
    ? primaryResults
    : runQuery(queryVariants.fallback);

  return {
    results,
    _metadata: generateResponseMetadata(db)
  };
}
