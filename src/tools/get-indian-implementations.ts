/**
 * get_indian_implementations — Find Indian statutes that implement or are equivalent to
 * a specific EU directive or regulation.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetIndianImplementationsInput {
  eu_document_id: string;
  primary_only?: boolean;
  in_force_only?: boolean;
}

export interface GetIndianImplementationsResult {
  eu_document_id: string;
  eu_title?: string;
  implementations: Array<{
    document_id: string;
    title: string;
    status: string;
    reference_type: string;
    is_primary: boolean;
  }>;
  total: number;
}

export async function getIndianImplementations(
  db: Database,
  input: GetIndianImplementationsInput
): Promise<ToolResponse<GetIndianImplementationsResult>> {
  if (!input.eu_document_id) {
    throw new Error('eu_document_id is required');
  }

  // Get EU document title
  const euDoc = db.prepare(
    'SELECT id, title FROM eu_documents WHERE id = ?'
  ).get(input.eu_document_id) as { id: string; title: string } | undefined;

  let sql = `
    SELECT
      er.document_id,
      ld.title,
      ld.status,
      er.reference_type,
      er.is_primary_implementation
    FROM eu_references er
    JOIN legal_documents ld ON ld.id = er.document_id
    WHERE er.eu_document_id = ?
  `;
  const params: (string | number)[] = [input.eu_document_id];

  if (input.primary_only) {
    sql += ` AND er.is_primary_implementation = 1`;
  }
  if (input.in_force_only) {
    sql += ` AND ld.status = 'in_force'`;
  }

  sql += ` ORDER BY er.is_primary_implementation DESC, ld.title`;

  interface Row {
    document_id: string; title: string; status: string;
    reference_type: string; is_primary_implementation: number;
  }

  const rows = db.prepare(sql).all(...params) as Row[];

  return {
    results: {
      eu_document_id: input.eu_document_id,
      eu_title: euDoc?.title,
      implementations: rows.map(r => ({
        document_id: r.document_id,
        title: r.title,
        status: r.status,
        reference_type: r.reference_type,
        is_primary: r.is_primary_implementation === 1,
      })),
      total: rows.length,
    },
    _metadata: generateResponseMetadata(db),
  };
}
