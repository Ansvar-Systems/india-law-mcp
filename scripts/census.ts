#!/usr/bin/env tsx
/**
 * Census script for India Law MCP.
 *
 * Enumerates ALL Central Acts from India Code (indiacode.nic.in) by
 * crawling the DSpace browse-by-short-title index. Writes data/census.json
 * in golden standard format.
 *
 * Phase 1: Fetch all listing pages (50 acts per page, offset-based pagination)
 * Phase 2: Write census.json with classification for each act
 *
 * If data/source/act-index.json already exists, reuses it (--skip-discovery).
 * Pass --force to re-crawl from scratch.
 *
 * Usage:
 *   npx tsx scripts/census.ts                # Use cached index if available
 *   npx tsx scripts/census.ts --force        # Re-crawl from India Code
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchActListPage } from './lib/fetcher.js';
import { parseActListPage, type ActIndexEntry } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');
const INDEX_PATH = path.join(SOURCE_DIR, 'act-index.json');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CensusLaw {
  id: string;
  title: string;
  identifier: string;         // "Act No. X of YYYY"
  year: number;
  act_number: number;
  url: string;
  status: 'in_force' | 'repealed' | 'unknown';
  category: string;
  classification: 'ingestable' | 'excluded' | 'inaccessible';
  exclusion_reason?: string;
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
}

interface CensusFile {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  census_date: string;
  agent: string;
  summary: {
    total_laws: number;
    ingestable: number;
    excluded: number;
    inaccessible: number;
    ingested: number;
    total_provisions: number;
    by_category: Array<{
      category: string;
      total: number;
      ingestable: number;
      excluded: number;
    }>;
  };
  laws: CensusLaw[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { force: boolean } {
  const args = process.argv.slice(2);
  return { force: args.includes('--force') };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery: Crawl India Code browse pages
// ─────────────────────────────────────────────────────────────────────────────

async function discoverActs(): Promise<ActIndexEntry[]> {
  console.log('[census] Phase 1: Discovering Central Acts from indiacode.nic.in...\n');

  const allEntries: ActIndexEntry[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    process.stdout.write(`  Fetching listing page ${page} (offset ${(page - 1) * 50})...`);

    const result = await fetchActListPage(page);

    if (result.status !== 200) {
      console.log(` HTTP ${result.status} — stopping discovery.`);
      break;
    }

    const listResult = parseActListPage(result.body);
    allEntries.push(...listResult.entries);

    const totalStr = listResult.totalResults ? ` (total: ${listResult.totalResults})` : '';
    console.log(` ${listResult.entries.length} entries${totalStr}`);

    if (listResult.entries.length === 0) {
      break;
    }

    hasMore = listResult.hasNextPage;
    page++;

    // Safety limit
    if (page > 100) {
      console.log('  WARNING: Hit page limit of 100, stopping discovery.');
      break;
    }
  }

  // Deduplicate by year+actNumber
  const seen = new Set<string>();
  const deduped: ActIndexEntry[] = [];
  for (const entry of allEntries) {
    const key = `${entry.year}-${entry.actNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }

  console.log(`\n  Discovered ${deduped.length} unique acts (from ${allEntries.length} entries, ${page - 1} pages)\n`);

  // Save index
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(deduped, null, 2));
  console.log(`  Index saved to ${INDEX_PATH}\n`);

  return deduped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

function classifyAct(entry: ActIndexEntry): { classification: 'ingestable' | 'excluded'; reason?: string } {
  // All Central Acts are ingestable — India Code provides structured content
  // for virtually all acts. Even very old acts (1830s-1860s) are available.
  // We do not exclude any acts since the India Code portal has digitized them.
  return { classification: 'ingestable' };
}

function categorizeAct(title: string, year: number): string {
  if (year >= 2020) return 'Modern (2020+)';
  if (year >= 2000) return 'Contemporary (2000-2019)';
  if (year >= 1950) return 'Post-Independence (1950-1999)';
  if (year >= 1860) return 'Colonial Era (1860-1949)';
  return 'Pre-1860';
}

function buildActId(actNumber: number, year: number): string {
  return `act-${actNumber}-${year}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check ingestion status from seed files
// ─────────────────────────────────────────────────────────────────────────────

function checkIngestionStatus(actNumber: number, year: number): { ingested: boolean; provision_count: number; ingestion_date: string | null } {
  const seedFile = path.join(SEED_DIR, `${actNumber}_${year}.json`);

  if (!fs.existsSync(seedFile)) {
    return { ingested: false, provision_count: 0, ingestion_date: null };
  }

  try {
    const content = fs.readFileSync(seedFile, 'utf-8');
    const seed = JSON.parse(content);
    const provisions = seed.provisions || [];
    const stat = fs.statSync(seedFile);
    const ingestionDate = stat.mtime.toISOString().slice(0, 10);

    return {
      // Seed file exists = we attempted fetch and captured what's available upstream
      ingested: true,
      provision_count: provisions.length,
      ingestion_date: ingestionDate,
    };
  } catch {
    return { ingested: false, provision_count: 0, ingestion_date: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const { force } = parseArgs();

  console.log('India Law MCP — Census');
  console.log('======================\n');

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });

  let acts: ActIndexEntry[];

  if (!force && fs.existsSync(INDEX_PATH)) {
    console.log(`[census] Using cached act index from ${INDEX_PATH}`);
    acts = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    console.log(`[census]   ${acts.length} acts in index\n`);
  } else {
    acts = await discoverActs();
  }

  // Build census entries
  const laws: CensusLaw[] = [];
  const categoryMap = new Map<string, { total: number; ingestable: number; excluded: number }>();

  for (const act of acts) {
    const { classification, reason } = classifyAct(act);
    const category = categorizeAct(act.title, act.year);
    const { ingested, provision_count, ingestion_date } = checkIngestionStatus(act.actNumber, act.year);

    const law: CensusLaw = {
      id: buildActId(act.actNumber, act.year),
      title: act.title,
      identifier: `Act No. ${act.actNumber} of ${act.year}`,
      year: act.year,
      act_number: act.actNumber,
      url: act.url,
      status: 'in_force',
      category,
      classification,
      ingested,
      provision_count,
      ingestion_date,
    };

    if (reason) {
      law.exclusion_reason = reason;
    }

    laws.push(law);

    // Update category stats
    const catStats = categoryMap.get(category) || { total: 0, ingestable: 0, excluded: 0 };
    catStats.total++;
    if (classification === 'ingestable') catStats.ingestable++;
    else catStats.excluded++;
    categoryMap.set(category, catStats);
  }

  // Sort laws by year, then act number
  laws.sort((a, b) => a.year - b.year || a.act_number - b.act_number);

  const totalIngestable = laws.filter(l => l.classification === 'ingestable').length;
  const totalExcluded = laws.filter(l => l.classification === 'excluded').length;
  const totalIngested = laws.filter(l => l.ingested).length;
  const totalProvisions = laws.reduce((sum, l) => sum + l.provision_count, 0);

  const byCategory = Array.from(categoryMap.entries())
    .sort((a, b) => {
      const order = ['Pre-1860', 'Colonial Era (1860-1949)', 'Post-Independence (1950-1999)', 'Contemporary (2000-2019)', 'Modern (2020+)'];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([category, stats]) => ({
      category,
      total: stats.total,
      ingestable: stats.ingestable,
      excluded: stats.excluded,
    }));

  const census: CensusFile = {
    schema_version: '1.0',
    jurisdiction: 'IN',
    jurisdiction_name: 'India',
    portal: 'https://www.indiacode.nic.in',
    census_date: new Date().toISOString().slice(0, 10),
    agent: 'claude-opus-4-6',
    summary: {
      total_laws: laws.length,
      ingestable: totalIngestable,
      excluded: totalExcluded,
      inaccessible: 0,
      ingested: totalIngested,
      total_provisions: totalProvisions,
      by_category: byCategory,
    },
    laws,
  };

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2), 'utf-8');

  console.log(`[census] Census complete:`);
  console.log(`  Total laws:       ${laws.length}`);
  console.log(`  Ingestable:       ${totalIngestable}`);
  console.log(`  Excluded:         ${totalExcluded}`);
  console.log(`  Already ingested: ${totalIngested}`);
  console.log(`  Total provisions: ${totalProvisions}`);
  console.log('');
  for (const cs of byCategory) {
    console.log(`  ${cs.category}: ${cs.total} total, ${cs.ingestable} ingestable, ${cs.excluded} excluded`);
  }
  console.log(`\n[census] Written to ${CENSUS_PATH}`);
}

main().catch(err => {
  console.error('[census] Fatal error:', err);
  process.exit(1);
});
