#!/usr/bin/env tsx
/**
 * Database builder for India Law MCP server.
 *
 * Builds the SQLite database from seed JSON files in data/seed/.
 *
 * Usage: npm run build:db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ─────────────────────────────────────────────────────────────────────────────
// Seed file types
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentSeed {
  id: string;
  type: 'statute';
  title: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
  provisions?: ProvisionSeed[];
  definitions?: DefinitionSeed[];
  language?: string;
}

interface ProvisionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  language?: string;
}

interface DefinitionSeed {
  term: string;
  definition: string;
  source_provision?: string;
}

interface ProvisionDedupStats {
  duplicate_refs: number;
  conflicting_duplicates: number;
}

type EUDocumentType = 'directive' | 'regulation';
type EUCommunity = 'EU' | 'EC' | 'EEC' | 'Euratom';
type EUReferenceType = 'implements' | 'references' | 'equivalent_to';

interface ExtractedEUReference {
  type: EUDocumentType;
  community: EUCommunity;
  year: number;
  number: number;
  euDocumentId: string;
  euArticle: string | null;
  fullCitation: string;
  referenceContext: string;
  referenceType: EUReferenceType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database schema
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = `
-- Legal documents (statutes, rules, directions)
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

-- Individual provisions from statutes
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
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);

-- FTS5 for provision search
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

-- Cross-references between provisions/documents
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

CREATE INDEX idx_xref_source ON cross_references(source_document_id);
CREATE INDEX idx_xref_target ON cross_references(target_document_id);

-- Legal term definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);

-- FTS5 for definition search
CREATE VIRTUAL TABLE definitions_fts USING fts5(
  term, definition,
  content='definitions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER definitions_ai AFTER INSERT ON definitions BEGIN
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER definitions_ad AFTER DELETE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TRIGGER definitions_au AFTER UPDATE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

-- =============================================================================
-- EU/INTERNATIONAL REFERENCES SCHEMA
-- =============================================================================

-- EU Documents (directives and regulations for cross-reference)
CREATE TABLE eu_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('directive', 'regulation')),
  year INTEGER NOT NULL CHECK (year >= 1957 AND year <= 2100),
  number INTEGER NOT NULL CHECK (number > 0),
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

CREATE INDEX idx_eu_documents_type_year ON eu_documents(type, year DESC);
CREATE INDEX idx_eu_documents_celex ON eu_documents(celex_number);

-- EU References (links Indian provisions to EU documents for cross-reference)
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

CREATE INDEX idx_eu_references_document ON eu_references(document_id, eu_document_id);
CREATE INDEX idx_eu_references_eu_document ON eu_references(eu_document_id, document_id);
CREATE INDEX idx_eu_references_provision ON eu_references(provision_id, eu_document_id);

-- Build metadata (tier, schema version, build timestamp)
CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function pickPreferredProvision(existing: ProvisionSeed, incoming: ProvisionSeed): ProvisionSeed {
  const existingContent = normalizeWhitespace(existing.content);
  const incomingContent = normalizeWhitespace(incoming.content);

  if (incomingContent.length > existingContent.length) {
    return {
      ...incoming,
      title: incoming.title ?? existing.title,
    };
  }

  return {
    ...existing,
    title: existing.title ?? incoming.title,
  };
}

function dedupeProvisions(provisions: ProvisionSeed[]): { deduped: ProvisionSeed[]; stats: ProvisionDedupStats } {
  const byRef = new Map<string, ProvisionSeed>();
  const stats: ProvisionDedupStats = {
    duplicate_refs: 0,
    conflicting_duplicates: 0,
  };

  for (const provision of provisions) {
    const ref = provision.provision_ref.trim();
    const existing = byRef.get(ref);

    if (!existing) {
      byRef.set(ref, { ...provision, provision_ref: ref });
      continue;
    }

    stats.duplicate_refs++;

    const existingContent = normalizeWhitespace(existing.content);
    const incomingContent = normalizeWhitespace(provision.content);

    if (existingContent !== incomingContent) {
      stats.conflicting_duplicates++;
    }

    byRef.set(ref, pickPreferredProvision(existing, provision));
  }

  return {
    deduped: Array.from(byRef.values()),
    stats,
  };
}

function extractEuReferences(text: string): ExtractedEUReference[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const refs: ExtractedEUReference[] = [];
  const seen = new Set<string>();

  const patterns: RegExp[] = [
    /\b(Regulation|Directive)\s*\((EU|EC|EEC|Euratom)\)\s*(?:No\.?\s*)?(\d{2,4})\/(\d{1,4})\b/gi,
    /\b(Regulation|Directive)\s*(?:No\.?\s*)?(\d{2,4})\/(\d{1,4})\/(EU|EC|EEC|Euratom)\b/gi,
    /\b(Regulation|Directive)\s*(?:No\.?\s*)?(\d{2,4})\/(\d{1,4})\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const type = match[1].toLowerCase() as EUDocumentType;

      let rawYear: string;
      let rawNumber: string;
      let communityRaw: string | undefined;

      if (pattern === patterns[0]) {
        communityRaw = match[2];
        rawYear = match[3];
        rawNumber = match[4];
      } else if (pattern === patterns[1]) {
        rawYear = match[2];
        rawNumber = match[3];
        communityRaw = match[4];
      } else {
        rawYear = match[2];
        rawNumber = match[3];
        communityRaw = undefined;
      }

      const year = normalizeEuYear(rawYear);
      const number = Number.parseInt(rawNumber, 10);
      if (year <= 0 || Number.isNaN(number) || number <= 0) {
        continue;
      }

      const community = normalizeCommunity(communityRaw);
      const start = Math.max(0, match.index - 120);
      const end = Math.min(text.length, match.index + match[0].length + 120);
      const referenceContext = text.slice(start, end).replace(/\s+/g, ' ').trim();
      const euArticle = extractArticleReference(referenceContext);
      const referenceType = inferReferenceType(referenceContext);
      const euDocumentId = `${type}:${year}/${number}`;

      const dedupeKey = `${euDocumentId}:${euArticle ?? ''}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      refs.push({
        type,
        community,
        year,
        number,
        euDocumentId,
        euArticle,
        fullCitation: match[0],
        referenceContext,
        referenceType,
      });
    }
  }

  return refs;
}

function normalizeEuYear(rawYear: string): number {
  const parsed = Number.parseInt(rawYear, 10);
  if (Number.isNaN(parsed)) return 0;
  if (rawYear.length === 2) {
    return parsed >= 50 ? 1900 + parsed : 2000 + parsed;
  }
  return parsed;
}

function normalizeCommunity(value: string | undefined): EUCommunity {
  if (!value) return 'EU';
  const upper = value.toUpperCase();
  if (upper === 'EC') return 'EC';
  if (upper === 'EEC') return 'EEC';
  if (upper === 'EURATOM') return 'Euratom';
  return 'EU';
}

function inferReferenceType(context: string): EUReferenceType {
  if (/\b(equivalent|modelled|inspired|similar|aligned)\b/i.test(context)) {
    return 'equivalent_to';
  }
  return /\b(implement|implemented|implements|transpos|supplement|complies?|gives effect)\b/i.test(context)
    ? 'implements'
    : 'references';
}

function extractArticleReference(context: string): string | null {
  const match = context.match(/\bArticle\s+(\d+[A-Za-z]?(?:\(\d+\))?)/i);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

function buildDatabase(): void {
  console.log('Building India Law MCP database...\n');

  // Delete existing database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('  Deleted existing database.\n');
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(SCHEMA);

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT INTO legal_documents (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description, language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content, metadata, language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDefinition = db.prepare(`
    INSERT INTO definitions (document_id, term, term_en, definition, source_provision)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEuDocument = db.prepare(`
    INSERT OR IGNORE INTO eu_documents
      (id, type, year, number, community, title, short_name, url_eur_lex, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEuReference = db.prepare(`
    INSERT INTO eu_references
      (
        source_type, source_id, document_id, provision_id, eu_document_id, eu_article,
        reference_type, reference_context, full_citation, is_primary_implementation,
        implementation_status, last_verified
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Load seed files
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory at ${SEED_DIR} — creating empty database.`);
    db.close();
    return;
  }

  const seedFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'));

  if (seedFiles.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    db.close();
    return;
  }

  let totalDocs = 0;
  let totalProvisions = 0;
  let totalDefs = 0;
  let totalDuplicateRefs = 0;
  let totalConflictingDuplicates = 0;
  let emptyDocs = 0;
  let totalEuDocuments = 0;
  let totalEuReferences = 0;
  const primaryImplementationByDocument = new Set<string>();

  const loadAll = db.transaction(() => {
    for (const file of seedFiles) {
      const filePath = path.join(SEED_DIR, file);

      const content = fs.readFileSync(filePath, 'utf-8');
      const seed = JSON.parse(content) as DocumentSeed;

      insertDoc.run(
        seed.id,
        seed.type ?? 'statute',
        seed.title,
        null, // title_en (Indian legislation is primarily in English)
        seed.short_name ?? null,
        seed.status ?? 'in_force',
        seed.issued_date ?? null,
        seed.in_force_date ?? null,
        seed.url ?? null,
        seed.description ?? null,
        seed.language ?? 'en',
      );
      totalDocs++;

      if (!seed.provisions || seed.provisions.length === 0) {
        emptyDocs++;
        continue;
      }

      const { deduped, stats } = dedupeProvisions(seed.provisions);
      totalDuplicateRefs += stats.duplicate_refs;
      totalConflictingDuplicates += stats.conflicting_duplicates;
      if (stats.duplicate_refs > 0) {
        console.log(
          `    WARNING: ${stats.duplicate_refs} duplicate refs in ${seed.id} ` +
          `(${stats.conflicting_duplicates} with different text).`
        );
      }

      for (const prov of deduped) {
        const insertResult = insertProvision.run(
          seed.id,
          prov.provision_ref,
          prov.chapter ?? null,
          prov.section,
          prov.title ?? null,
          prov.content,
          prov.metadata ? JSON.stringify(prov.metadata) : null,
          prov.language ?? seed.language ?? 'en',
        );
        totalProvisions++;

        const provisionId = Number(insertResult.lastInsertRowid);
        const extractedRefs = extractEuReferences(prov.content);
        if (extractedRefs.length > 0) {
          const sourceId = `${seed.id}:${prov.provision_ref}`;
          const lastVerified = new Date().toISOString();

          for (const ref of extractedRefs) {
            const eurLexType = ref.type === 'regulation' ? 'reg' : 'dir';
            const eurLexUrl = `https://eur-lex.europa.eu/eli/${eurLexType}/${ref.year}/${ref.number}/oj`;
            const shortName = `${ref.type === 'regulation' ? 'Regulation' : 'Directive'} ${ref.year}/${ref.number}`;

            const euInsert = insertEuDocument.run(
              ref.euDocumentId,
              ref.type,
              ref.year,
              ref.number,
              ref.community,
              shortName,
              shortName,
              eurLexUrl,
              'Cross-reference from Indian statute text',
            );
            if (euInsert.changes > 0) {
              totalEuDocuments++;
            }

            const primaryKey = `${seed.id}:${ref.euDocumentId}`;
            const isPrimary =
              (ref.referenceType === 'implements' || ref.referenceType === 'equivalent_to') && !primaryImplementationByDocument.has(primaryKey)
                ? 1
                : 0;
            if (isPrimary === 1) {
              primaryImplementationByDocument.add(primaryKey);
            }

            try {
              const refInsert = insertEuReference.run(
                'provision',
                sourceId,
                seed.id,
                provisionId,
                ref.euDocumentId,
                ref.euArticle,
                ref.referenceType,
                ref.referenceContext,
                ref.fullCitation,
                isPrimary,
                isPrimary === 1 ? 'complete' : 'unknown',
                lastVerified,
              );
              if (refInsert.changes > 0) {
                totalEuReferences++;
              }
            } catch {
              // Ignore duplicate references that violate UNIQUE constraints.
            }
          }
        }
      }

      for (const def of seed.definitions ?? []) {
        insertDefinition.run(
          seed.id,
          def.term,
          null, // term_en
          def.definition,
          def.source_provision ?? null,
        );
        totalDefs++;
      }
    }
  });

  loadAll();

  // Write build metadata
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  const writeMeta = db.transaction(() => {
    insertMeta.run('tier', 'free');
    insertMeta.run('schema_version', '2');
    insertMeta.run('built_at', new Date().toISOString());
    insertMeta.run('builder', 'build-db.ts');
    insertMeta.run('jurisdiction', 'IN');
    insertMeta.run('source', 'indiacode.nic.in');
    insertMeta.run('licence', 'Government Open Data License India');
  });
  writeMeta();

  // CRITICAL: Set journal_mode to DELETE for WASM compatibility
  db.pragma('journal_mode = DELETE');

  db.exec('ANALYZE');
  db.exec('VACUUM');
  db.close();

  const size = fs.statSync(DB_PATH).size;
  console.log(
    `\nBuild complete: ${totalDocs} documents, ${totalProvisions} provisions, ` +
    `${totalDefs} definitions, ${totalEuDocuments} EU documents, ${totalEuReferences} EU references`
  );
  if (emptyDocs > 0) {
    console.log(`  ${emptyDocs} documents with no provisions (HTML unavailable).`);
  }
  if (totalDuplicateRefs > 0) {
    console.log(
      `Data quality: ${totalDuplicateRefs} duplicate refs detected ` +
      `(${totalConflictingDuplicates} with conflicting text).`
    );
  }
  console.log(`Output: ${DB_PATH} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

buildDatabase();
