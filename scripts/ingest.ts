#!/usr/bin/env tsx
/**
 * India Law MCP — Ingestion Pipeline
 *
 * Three-phase ingestion of Indian legislation from indiacode.nic.in:
 *   Phase 1 (Discovery): Fetch act listing pages from India Code browse
 *   Phase 2 (Act Pages): Fetch each act page, extract section references
 *   Phase 3 (Content):   Fetch section content via AJAX endpoint
 *
 * Usage:
 *   npm run ingest                    # Full ingestion
 *   npm run ingest -- --limit 20      # Test with 20 acts
 *   npm run ingest -- --skip-discovery # Reuse cached act index
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

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const INDEX_PATH = path.join(SOURCE_DIR, 'act-index.json');

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { limit: number | null; skipDiscovery: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipDiscovery = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-discovery') {
      skipDiscovery = true;
    }
  }

  return { limit, skipDiscovery };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Discovery — Build act index from India Code browse pages
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

    // Stop if no entries returned or no next page
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
// Phase 2+3: Fetch act pages, extract sections, fetch content
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAndParseActs(acts: ActIndexEntry[], limit: number | null): Promise<void> {
  const toProcess = limit ? acts.slice(0, limit) : acts;
  console.log(`Phase 2+3: Fetching content for ${toProcess.length} acts...\n`);

  fs.mkdirSync(SEED_DIR, { recursive: true });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalProvisions = 0;
  let totalSectionsWithContent = 0;

  for (const act of toProcess) {
    const seedFile = path.join(SEED_DIR, `${act.actNumber}_${act.year}.json`);

    // Incremental: skip if seed already exists and has provisions with content
    if (fs.existsSync(seedFile)) {
      try {
        const existing: ParsedAct = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
        if (existing.provisions.length > 0 && existing.provisions.some(p => p.content.length > 0)) {
          skipped++;
          processed++;
          totalProvisions += existing.provisions.length;
          if (processed % 10 === 0) {
            console.log(`  Progress: ${processed}/${toProcess.length} (${skipped} cached, ${failed} failed, ${totalProvisions} provisions)`);
          }
          continue;
        }
      } catch {
        // Corrupt seed file, re-fetch
      }
    }

    try {
      // Phase 2: Fetch act page
      const actResult = await fetchActHtml(act.url);

      if (actResult.status !== 200) {
        // Write a minimal seed so we don't retry
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
        // Some acts may have no sections (very old acts, or different format)
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
            // Still record the section even without content
            provisions.push(buildProvision(section.sectionNo, section.title, ''));
          }
          sectionsFetched++;
        } catch (error) {
          // Record section without content on error
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

      process.stdout.write(`  ${act.title} — ${provisions.length} sections (${sectionsFetched} fetched)\n`);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR: ${act.title} (${act.year}): ${msg}`);
      failed++;
    }

    processed++;
    if (processed % 10 === 0 && !process.stdout.isTTY) {
      console.log(`  Progress: ${processed}/${toProcess.length} (${skipped} cached, ${failed} failed, ${totalProvisions} provisions)`);
    }
  }

  console.log(`\nIngestion complete:`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (already cached): ${skipped}`);
  console.log(`  Failed/No content: ${failed}`);
  console.log(`  Total provisions extracted: ${totalProvisions}`);
  console.log(`  Sections with content: ${totalSectionsWithContent}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { limit, skipDiscovery } = parseArgs();

  console.log('India Law MCP — Ingestion Pipeline');
  console.log('===================================\n');

  if (limit) console.log(`  --limit ${limit}`);
  if (skipDiscovery) console.log(`  --skip-discovery`);
  console.log('');

  let acts: ActIndexEntry[];

  if (skipDiscovery && fs.existsSync(INDEX_PATH)) {
    console.log(`Using cached act index from ${INDEX_PATH}\n`);
    acts = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    console.log(`  ${acts.length} acts in index\n`);
  } else {
    acts = await discoverActs();
  }

  await fetchAndParseActs(acts, limit);

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
