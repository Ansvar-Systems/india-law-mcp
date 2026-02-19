/**
 * list_sources — Returns metadata about data sources, coverage, and freshness.
 *
 * Required by the Ansvar Law MCP standard tool set.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ListSourcesResult {
  jurisdiction: string;
  sources: Array<{
    name: string;
    authority: string;
    url: string;
    license: string;
    coverage: string;
    languages: string[];
  }>;
  database: {
    tier: string;
    schema_version: string;
    built_at: string;
    document_count: number;
    provision_count: number;
    eu_document_count: number;
  };
  limitations: string[];
}

function safeCount(db: Database, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

function safeMetaValue(db: Database, key: string): string {
  try {
    const row = db.prepare('SELECT value FROM db_metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function listSources(db: Database): Promise<ToolResponse<ListSourcesResult>> {
  const documentCount = safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents');
  const provisionCount = safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions');
  const euDocumentCount = safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents');

  return {
    results: {
      jurisdiction: 'India (IN)',
      sources: [
        {
          name: 'India Code (NIC)',
          authority: 'Ministry of Law and Justice, Government of India / National Informatics Centre',
          url: 'https://www.indiacode.nic.in',
          license: 'Government Open Data (Open Government Data Platform India)',
          coverage: 'All Central Acts of Parliament including DPDPA 2023, IT Act 2000, Companies Act 2013, Consumer Protection Act 2019, Aadhaar Act 2016.',
          languages: ['en', 'hi'],
        },
        {
          name: 'Legislative Department',
          authority: 'Legislative Department, Ministry of Law and Justice',
          url: 'https://legislative.gov.in',
          license: 'Government Open Data',
          coverage: 'Subordinate legislation, IT Rules (SPDI Rules 2011, Intermediary Guidelines 2021), gazette notifications.',
          languages: ['en', 'hi'],
        },
        {
          name: 'MeitY',
          authority: 'Ministry of Electronics and Information Technology',
          url: 'https://www.meity.gov.in',
          license: 'Government Open Data',
          coverage: 'IT Act rules, CERT-In directions, DPDPA rules as notified.',
          languages: ['en'],
        },
      ],
      database: {
        tier: safeMetaValue(db, 'tier'),
        schema_version: safeMetaValue(db, 'schema_version'),
        built_at: safeMetaValue(db, 'built_at'),
        document_count: documentCount,
        provision_count: provisionCount,
        eu_document_count: euDocumentCount,
      },
      limitations: [
        `Covers ${documentCount.toLocaleString()} Central Acts of Parliament. State Acts are not yet included.`,
        'Provisions with sub-sections store the introductory text at the section level; sub-sections are stored as separate provisions.',
        'EU/international cross-references (e.g., DPDPA-GDPR mappings) are curated and may not capture all indirect references.',
        'Supreme Court judgments and High Court interpretations are not yet included.',
        'Hindi translations are available for select Acts but may not be complete.',
        'Always verify against official India Code (indiacode.nic.in) publications when legal certainty is required.',
      ],
    },
    _metadata: generateResponseMetadata(db),
  };
}
