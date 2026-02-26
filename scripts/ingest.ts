#!/usr/bin/env tsx
/**
 * India Law MCP — Census-Driven Ingestion Pipeline
 *
 * Reads data/census.json for the target list of acts, fetches content
 * from indiacode.nic.in, writes seed JSON files, and updates census
 * with ingestion results.
 *
 * Three-phase ingestion:
 *   Phase 1: Read census.json for target acts (replaces discovery)
 *   Phase 2: Fetch each act page, extract section references
 *   Phase 3: Fetch section content via AJAX endpoint
 *
 * Resume support: skips acts that already have seed files with content.
 *
 * Usage:
 *   npm run ingest                    # Full ingestion from census
 *   npm run ingest -- --limit 20      # Process up to 20 un-ingested acts
 *   npm run ingest -- --skip-discovery # Alias (backwards compat)
 *   npm run ingest -- --force          # Re-fetch even cached acts
 *
 * Data is sourced under the Government Open Data License India.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchActListPage, fetchActHtml, fetchSectionContent } from './lib/fetcher.js';
import {
  parseActListPage,
  extractSectionRefs,
  extractActMetadata,
  parseSectionContentJson,
  buildProvision,
  buildShortName,
  type ActIndexEntry,
  type ParsedAct,
  type ParsedProvision,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');
const INDEX_PATH = path.join(SOURCE_DIR, 'act-index.json');

// ─────────────────────────────────────────────────────────────────────────────
// Census types
// ─────────────────────────────────────────────────────────────────────────────

interface CensusLaw {
  id: string;
  title: string;
  identifier: string;
  year: number;
  act_number: number;
  url: string;
  status: string;
  category: string;
  classification: string;
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
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { limit: number | null; skipDiscovery: boolean; force: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipDiscovery = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-discovery') {
      skipDiscovery = true;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  return { limit, skipDiscovery, force };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy discovery (fallback when no census.json exists)
// ─────────────────────────────────────────────────────────────────────────────

async function discoverActs(): Promise<ActIndexEntry[]> {
  console.log('Phase 1: Discovering Indian Central Acts from indiacode.nic.in...\n');

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

    if (page > 100) {
      console.log('  WARNING: Hit page limit of 100, stopping discovery.');
      break;
    }
  }

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

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(deduped, null, 2));
  console.log(`  Index saved to ${INDEX_PATH}\n`);

  return deduped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed file check
// ─────────────────────────────────────────────────────────────────────────────

function seedHasContent(actNumber: number, year: number): boolean {
  const seedFile = path.join(SEED_DIR, `${actNumber}_${year}.json`);
  if (!fs.existsSync(seedFile)) return false;

  try {
    const existing: ParsedAct = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    // Acts with 0 provisions are also considered "complete" (no sections available)
    if (existing.provisions.length === 0) return true;
    // Acts with at least some content are complete
    return existing.provisions.some(p => p.content.length > 0);
  } catch {
    return false;
  }
}

function getSeedProvisionCount(actNumber: number, year: number): number {
  const seedFile = path.join(SEED_DIR, `${actNumber}_${year}.json`);
  if (!fs.existsSync(seedFile)) return 0;

  try {
    const existing: ParsedAct = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    return existing.provisions.length;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Census-driven ingestion
// ─────────────────────────────────────────────────────────────────────────────

interface IngestTarget {
  actNumber: number;
  year: number;
  title: string;
  url: string;
}

async function fetchAndParseActs(targets: IngestTarget[], force: boolean): Promise<{
  processed: number;
  skipped: number;
  failed: number;
  newProvisions: number;
  totalProvisions: number;
}> {
  console.log(`Ingesting content for ${targets.length} acts...\n`);

  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalSectionsWithContent = 0;

  for (const act of targets) {
    const seedFile = path.join(SEED_DIR, `${act.actNumber}_${act.year}.json`);

    // Resume: skip if already ingested (unless --force)
    if (!force && seedHasContent(act.actNumber, act.year)) {
      skipped++;
      processed++;
      totalProvisions += getSeedProvisionCount(act.actNumber, act.year);
      if (processed % 50 === 0) {
        console.log(`  Progress: ${processed}/${targets.length} (${skipped} cached, ${failed} failed, ${totalProvisions} provisions)`);
      }
      continue;
    }

    try {
      // Phase 2: Fetch act page
      const actResult = await fetchActHtml(act.url);

      if (actResult.status !== 200) {
        const minimalSeed: ParsedAct = {
          id: `act-${act.actNumber}-${act.year}`,
          type: 'statute',
          title: act.title,
          short_name: buildShortName(act.title, act.year),
          status: 'in_force',
          issued_date: `${act.year}-01-01`,
          url: act.url,
          provisions: [],
        };
        fs.writeFileSync(seedFile, JSON.stringify(minimalSeed, null, 2));
        console.log(`  WARN: HTTP ${actResult.status} for ${act.title} (${act.year})`);
        failed++;
        processed++;
        continue;
      }

      // Extract metadata and section references
      const metadata = extractActMetadata(actResult.body);
      const { sections } = extractSectionRefs(actResult.body);

      if (sections.length === 0) {
        const minimalSeed: ParsedAct = {
          id: `act-${act.actNumber}-${act.year}`,
          type: 'statute',
          title: metadata.shortTitle || act.title,
          short_name: buildShortName(metadata.shortTitle || act.title, act.year),
          status: 'in_force',
          issued_date: metadata.enactmentDate || `${act.year}-01-01`,
          url: act.url,
          provisions: [],
        };
        fs.writeFileSync(seedFile, JSON.stringify(minimalSeed, null, 2));
        processed++;
        continue;
      }

      // Phase 3: Fetch content for each section
      const provisions: ParsedProvision[] = [];
      let sectionsFetched = 0;

      for (const section of sections) {
        try {
          const contentResult = await fetchSectionContent(section.actId, section.sectionId);

          if (contentResult.status === 200 && contentResult.body.length > 0) {
            const { content, footnote } = parseSectionContentJson(contentResult.body);
            const fullContent = footnote ? `${content}\n\n[Footnote] ${footnote}` : content;

            provisions.push(buildProvision(section.sectionNo, section.title, fullContent));
            if (fullContent.length > 0) {
              totalSectionsWithContent++;
            }
          } else {
            provisions.push(buildProvision(section.sectionNo, section.title, ''));
          }
          sectionsFetched++;
        } catch {
          provisions.push(buildProvision(section.sectionNo, section.title, ''));
        }
      }

      const parsedAct: ParsedAct = {
        id: `act-${act.actNumber}-${act.year}`,
        type: 'statute',
        title: metadata.shortTitle || act.title,
        short_name: buildShortName(metadata.shortTitle || act.title, act.year),
        status: 'in_force',
        issued_date: metadata.enactmentDate || `${act.year}-01-01`,
        url: act.url,
        provisions,
        language: 'en',
      };

      fs.writeFileSync(seedFile, JSON.stringify(parsedAct, null, 2));
      totalProvisions += provisions.length;

      console.log(`  [${processed + 1}/${targets.length}] ${act.title} — ${provisions.length} sections (${sectionsFetched} fetched)`);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR: ${act.title} (${act.year}): ${msg}`);
      failed++;
    }

    processed++;
    if (processed % 25 === 0) {
      console.log(`  Progress: ${processed}/${targets.length} (${skipped} cached, ${failed} failed, ${totalProvisions} provisions)`);
    }
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (already cached): ${skipped}`);
  console.log(`  Failed/No content: ${failed}`);
  console.log(`  Total provisions extracted: ${totalProvisions}`);
  console.log(`  Sections with content: ${totalSectionsWithContent}`);

  return {
    processed,
    skipped,
    failed,
    newProvisions: totalSectionsWithContent,
    totalProvisions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Update census after ingestion
// ─────────────────────────────────────────────────────────────────────────────

function updateCensus(): void {
  if (!fs.existsSync(CENSUS_PATH)) return;

  const census: CensusFile = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));
  const today = new Date().toISOString().slice(0, 10);

  let totalIngested = 0;
  let totalProvisions = 0;

  for (const law of census.laws) {
    const seedFile = path.join(SEED_DIR, `${law.act_number}_${law.year}.json`);

    if (fs.existsSync(seedFile)) {
      try {
        const seed: ParsedAct = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
        // Mark as ingested if seed file exists — even if content is empty,
        // we've attempted to fetch and captured what's available upstream
        law.ingested = true;
        law.provision_count = seed.provisions.length;
        if (!law.ingestion_date) {
          law.ingestion_date = today;
        }
      } catch {
        // Leave as-is on parse error
      }
    }

    if (law.ingested) totalIngested++;
    totalProvisions += law.provision_count;
  }

  census.summary.ingested = totalIngested;
  census.summary.total_provisions = totalProvisions;

  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2), 'utf-8');
  console.log(`\nCensus updated: ${totalIngested}/${census.summary.ingestable} ingested, ${totalProvisions} provisions`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit, skipDiscovery, force } = parseArgs();

  console.log('India Law MCP — Ingestion Pipeline');
  console.log('===================================\n');

  if (limit) console.log(`  --limit ${limit}`);
  if (force) console.log(`  --force`);
  console.log('');

  let targets: IngestTarget[];

  // Census-driven: read from census.json if available
  if (fs.existsSync(CENSUS_PATH)) {
    console.log(`Reading targets from census.json...\n`);
    const census: CensusFile = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));

    // Only process ingestable acts
    const ingestable = census.laws.filter(l => l.classification === 'ingestable');
    console.log(`  ${ingestable.length} ingestable acts in census\n`);

    targets = ingestable.map(law => ({
      actNumber: law.act_number,
      year: law.year,
      title: law.title,
      url: law.url,
    }));
  } else if (fs.existsSync(INDEX_PATH)) {
    // Fallback: use act-index.json
    console.log(`No census.json found, using act-index.json...\n`);
    const acts: ActIndexEntry[] = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    console.log(`  ${acts.length} acts in index\n`);

    targets = acts.map(act => ({
      actNumber: act.actNumber,
      year: act.year,
      title: act.title,
      url: act.url,
    }));
  } else {
    // Full discovery from India Code
    console.log(`No census.json or act-index.json found, running discovery...\n`);
    const acts = await discoverActs();

    targets = acts.map(act => ({
      actNumber: act.actNumber,
      year: act.year,
      title: act.title,
      url: act.url,
    }));
  }

  // Apply limit (only to un-ingested acts)
  if (limit && !force) {
    const unIngested = targets.filter(t => !seedHasContent(t.actNumber, t.year));
    const ingested = targets.filter(t => seedHasContent(t.actNumber, t.year));
    const limited = unIngested.slice(0, limit);
    console.log(`  Limiting to ${limited.length} un-ingested acts (${ingested.length} already cached)\n`);
    targets = [...ingested, ...limited];
  } else if (limit) {
    targets = targets.slice(0, limit);
  }

  await fetchAndParseActs(targets, force);

  // Update census with results
  updateCensus();

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
