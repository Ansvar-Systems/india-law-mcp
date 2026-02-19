import type Database from '@ansvar/mcp-sqlite';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

export interface AboutResult {
  server: {
    name: string;
    package: string;
    version: string;
    suite: string;
    repository: string;
  };
  dataset: {
    fingerprint: string;
    built: string;
    jurisdiction: string;
    content_basis: string;
    counts: Record<string, number>;
  };
  provenance: {
    sources: string[];
    license: string;
    authenticity_note: string;
  };
  security: {
    access_model: string;
    network_access: boolean;
    filesystem_access: boolean;
    arbitrary_code: boolean;
  };
}

function safeCount(db: InstanceType<typeof Database>, sql: string): number {
  try {
    const row = db.prepare(sql).get() as { count: number } | undefined;
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}

export function getAbout(
  db: InstanceType<typeof Database>,
  context: AboutContext
): AboutResult {
  return {
    server: {
      name: 'India Law MCP',
      package: '@ansvar/india-law-mcp',
      version: context.version,
      suite: 'Ansvar Compliance Suite',
      repository: 'https://github.com/Ansvar-Systems/india-law-mcp',
    },
    dataset: {
      fingerprint: context.fingerprint,
      built: context.dbBuilt,
      jurisdiction: 'India (IN)',
      content_basis:
        'Indian legislation from India Code (indiacode.nic.in). ' +
        'Covers DPDPA 2023, IT Act 2000, Companies Act 2013, Consumer Protection Act 2019, ' +
        'Aadhaar Act 2016, and related subordinate legislation.',
      counts: {
        legal_documents: safeCount(db, 'SELECT COUNT(*) as count FROM legal_documents'),
        legal_provisions: safeCount(db, 'SELECT COUNT(*) as count FROM legal_provisions'),
        eu_documents: safeCount(db, 'SELECT COUNT(*) as count FROM eu_documents'),
        eu_references: safeCount(db, 'SELECT COUNT(*) as count FROM eu_references'),
      },
    },
    provenance: {
      sources: [
        'India Code / indiacode.nic.in (Central Acts)',
        'legislative.gov.in (subordinate legislation)',
        'meity.gov.in (IT rules, CERT-In directions)',
      ],
      license:
        'Apache-2.0 (server code). Legal source texts under Government Open Data License India.',
      authenticity_note:
        'Statute text is derived from India Code (indiacode.nic.in) open data. ' +
        'Verify against official publications when legal certainty is required.',
    },
    security: {
      access_model: 'read-only',
      network_access: false,
      filesystem_access: false,
      arbitrary_code: false,
    },
  };
}
