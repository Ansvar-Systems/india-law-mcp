import Database from '@ansvar/mcp-sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCHEMA = `
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('statute', 'rules', 'directions', 'constitutional_provision')),
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  language TEXT DEFAULT 'en',
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  language TEXT DEFAULT 'en',
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);

CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TABLE eu_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('directive', 'regulation')),
  year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  community TEXT CHECK (community IN ('EU', 'EC', 'EEC', 'Euratom')),
  celex_number TEXT,
  title TEXT,
  title_en TEXT,
  short_name TEXT,
  adoption_date TEXT,
  entry_into_force_date TEXT,
  in_force BOOLEAN DEFAULT 1,
  amended_by TEXT,
  repeals TEXT,
  url_eur_lex TEXT,
  description TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eu_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('provision', 'document', 'case_law')),
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'implements', 'supplements', 'applies', 'references', 'complies_with',
    'equivalent_to', 'derogates_from', 'amended_by', 'repealed_by', 'cites_article'
  )),
  reference_context TEXT,
  full_citation TEXT,
  is_primary_implementation BOOLEAN DEFAULT 0,
  implementation_status TEXT CHECK (implementation_status IN ('complete', 'partial', 'pending', 'unknown')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified TEXT,
  UNIQUE(source_id, eu_document_id, eu_article)
);

CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

interface TempDbMeta {
  tempDir: string;
}

const tempDbMeta = new WeakMap<InstanceType<typeof Database>, TempDbMeta>();

export function createTestDatabase(): InstanceType<typeof Database> {
  const tempDir = mkdtempSync(join(tmpdir(), 'india-law-mcp-test-'));
  const dbPath = join(tempDir, 'database.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const insertDocument = db.prepare(
    `INSERT INTO legal_documents (id, type, title, short_name, status, issued_date, in_force_date, url, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertProvision = db.prepare(
    `INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content)
    VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertEuDocument = db.prepare(
    `INSERT INTO eu_documents (id, type, year, number, community, title, short_name, url_eur_lex)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEuReference = db.prepare(
    `INSERT INTO eu_references (
      source_type, source_id, document_id, provision_id, eu_document_id, eu_article,
      reference_type, reference_context, full_citation, is_primary_implementation, implementation_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMeta = db.prepare(`INSERT INTO db_metadata (key, value) VALUES (?, ?)`);

  db.transaction(() => {
    insertDocument.run(
      'act-22-2023',
      'statute',
      'Digital Personal Data Protection Act, 2023',
      'DPDPA 2023',
      'in_force',
      '2023-08-11',
      '2023-08-11',
      'https://www.indiacode.nic.in/handle/123456789/19907',
      'India comprehensive data protection law',
    );
    insertDocument.run(
      'act-21-2000',
      'statute',
      'Information Technology Act, 2000',
      'IT Act 2000',
      'in_force',
      '2000-06-09',
      '2000-10-17',
      'https://www.indiacode.nic.in/handle/123456789/1999',
      'Primary cybercrime and IT governance legislation',
    );
    insertDocument.run(
      'act-18-2013',
      'statute',
      'Companies Act, 2013',
      'CA 2013',
      'in_force',
      '2013-08-29',
      '2013-08-29',
      'https://www.indiacode.nic.in/handle/123456789/2114',
      'Corporate governance legislation',
    );
    insertDocument.run(
      'act-35-2019',
      'statute',
      'Consumer Protection Act, 2019',
      'CPA 2019',
      'in_force',
      '2019-08-09',
      '2020-07-20',
      'https://www.indiacode.nic.in/handle/123456789/15256',
      'Consumer rights and e-commerce regulation',
    );

    insertProvision.run(
      'act-22-2023',
      's4',
      null,
      '4',
      'Processing of personal data',
      'A person may process the personal data of a Data Principal only in accordance with the provisions of this Act and for a lawful purpose.',
    );
    insertProvision.run(
      'act-22-2023',
      's2',
      null,
      '2',
      'Definitions',
      'In this Act, unless the context otherwise requires: "Data Fiduciary" means any person who alone or in conjunction with other persons determines the purpose and means of processing of personal data.',
    );
    insertProvision.run(
      'act-21-2000',
      's43A',
      null,
      '43A',
      'Compensation for failure to protect data',
      'Where a body corporate, possessing, dealing or handling any sensitive personal data or information in a computer resource which it owns, controls or operates, is negligent in implementing and maintaining reasonable security practices and procedures.',
    );
    insertProvision.run(
      'act-21-2000',
      's66',
      null,
      '66',
      'Computer related offences',
      'If any person, dishonestly or fraudulently, does any act referred to in section 43, he shall be punishable with imprisonment for a term which may extend to three years or with fine which may extend to five lakh rupees or with both.',
    );
    insertProvision.run(
      'act-21-2000',
      's1',
      null,
      '1',
      'Short title, extent, commencement and application',
      'This Act may be called the Information Technology Act, 2000. It extends to the whole of India.',
    );

    insertEuDocument.run(
      'regulation:2016/679',
      'regulation',
      2016,
      679,
      'EU',
      'General Data Protection Regulation',
      'GDPR',
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    );
    insertEuDocument.run(
      'directive:2022/2555',
      'directive',
      2022,
      2555,
      'EU',
      'Network and Information Security Directive',
      'NIS2',
      'https://eur-lex.europa.eu/eli/dir/2022/2555/oj',
    );

    insertEuReference.run(
      'document',
      'act-22-2023',
      'act-22-2023',
      null,
      'regulation:2016/679',
      null,
      'equivalent_to',
      'DPDPA is India equivalent of GDPR',
      'DPDPA 2023 equivalent to GDPR',
      1,
      'partial',
    );
    insertEuReference.run(
      'document',
      'act-21-2000',
      'act-21-2000',
      null,
      'directive:2022/2555',
      null,
      'references',
      'IT Act covers similar ground to NIS2',
      'IT Act 2000 references NIS2 concepts',
      0,
      'unknown',
    );

    const builtAt = new Date().toISOString();
    insertMeta.run('tier', 'free');
    insertMeta.run('schema_version', '2');
    insertMeta.run('built_at', builtAt);
    insertMeta.run('builder', 'tests/fixtures/test-db.ts');
    insertMeta.run('jurisdiction', 'IN');
    insertMeta.run('source', 'indiacode.nic.in');
  })();

  tempDbMeta.set(db, { tempDir });
  return db;
}

export function closeTestDatabase(db: InstanceType<typeof Database>): void {
  const meta = tempDbMeta.get(db);
  db.close();
  if (meta) {
    rmSync(meta.tempDir, { recursive: true, force: true });
    tempDbMeta.delete(db);
  }
}
