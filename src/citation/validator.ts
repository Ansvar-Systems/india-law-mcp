/**
 * Indian legal citation validator.
 *
 * Validates a citation string against the database to ensure the document
 * and provision actually exist (zero-hallucination enforcement).
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ValidationResult } from '../types/index.js';
import { parseCitation } from './parser.js';

export function validateCitation(db: Database, citation: string): ValidationResult {
  const parsed = parseCitation(citation);
  const warnings: string[] = [];

  if (!parsed.valid) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [parsed.error ?? 'Invalid citation format'],
    };
  }

  // Look up document by title match
  const titlePattern = parsed.year
    ? `%${parsed.title}%${parsed.year}%`
    : `%${parsed.title}%`;

  const doc = db.prepare(
    "SELECT id, title, status FROM legal_documents WHERE title LIKE ? LIMIT 1"
  ).get(titlePattern) as { id: string; title: string; status: string } | undefined;

  if (!doc) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${parsed.title}${parsed.year ? ', ' + parsed.year : ''}" not found in database`],
    };
  }

  if (doc.status === 'repealed') {
    warnings.push('This statute has been repealed');
  }

  // Check provision existence
  let provisionExists = false;
  if (parsed.section) {
    const pinpoint = [
      parsed.section,
      parsed.subsection ? `(${parsed.subsection})` : '',
      parsed.clause ? `(${parsed.clause})` : '',
    ].join('');
    const provisionRef = `s${pinpoint}`;
    const allowPrefixMatch = parsed.subsection == null && parsed.clause == null;

    const prov = db.prepare(
      `SELECT 1
       FROM legal_provisions
       WHERE document_id = ?
         AND (
           provision_ref = ?
           OR section = ?
           OR REPLACE(REPLACE(section, '((', '('), '))', ')') = ?
           OR (
             ? = 1
             AND (
               provision_ref LIKE ?
               OR REPLACE(REPLACE(section, '((', '('), '))', ')') LIKE ?
             )
           )
         )`
    ).get(
      doc.id,
      provisionRef,
      pinpoint,
      pinpoint,
      allowPrefixMatch ? 1 : 0,
      `${provisionRef}(%`,
      `${pinpoint}(%`,
    );
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Section ${pinpoint} not found in ${doc.title}`);
    }
  }

  return {
    citation: parsed,
    document_exists: true,
    provision_exists: provisionExists,
    document_title: doc.title,
    status: doc.status,
    warnings,
  };
}
