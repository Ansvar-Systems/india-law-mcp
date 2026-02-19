#!/usr/bin/env tsx
/**
 * Check India Code (indiacode.nic.in) for newly published or updated Acts.
 *
 * Exits:
 *   0 = no updates
 *   1 = updates found
 *   2 = check failed (network/parse/database error)
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../data/database.db');
const INDEX_PATH = resolve(__dirname, '../data/source/act-index.json');

const USER_AGENT = 'India-Law-MCP/1.0';
const REQUEST_TIMEOUT_MS = 15_000;

interface LocalIndexEntry {
  title: string;
  year: number;
  actNumber: number;
  url: string;
  updated: string;
}

interface UpdateHit {
  document_id: string;
  title: string;
  remote_updated: string;
  local_updated?: string;
}

function toDocumentId(entry: Pick<LocalIndexEntry, 'year' | 'actNumber'>): string {
  return `act-${entry.actNumber}-${entry.year}`;
}

function parseJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

async function fetchRecentGazetteNotifications(): Promise<{ title: string; date: string }[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('https://legislative.gov.in/latest-acts/', {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    // Simple extraction of act titles from the page
    const titleMatches = html.matchAll(/<a[^>]*>([^<]*Act[^<]*\d{4}[^<]*)<\/a>/gi);
    const results: { title: string; date: string }[] = [];
    for (const match of titleMatches) {
      results.push({ title: match[1].trim(), date: new Date().toISOString().slice(0, 10) });
    }
    return results;
  } finally {
    clearTimeout(timer);
  }
}

function mainSummary(newActs: UpdateHit[]): void {
  console.log('');
  console.log(`New acts detected: ${newActs.length}`);

  if (newActs.length > 0) {
    console.log('');
    console.log('New upstream acts missing locally:');
    for (const hit of newActs.slice(0, 20)) {
      console.log(`  - ${hit.title}`);
    }
  }
}

async function main(): Promise<void> {
  console.log('India Law MCP - Update checker');
  console.log('');

  if (!existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(2);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const localDocs = new Set<string>(
    (db.prepare("SELECT title FROM legal_documents WHERE type = 'statute'").all() as { title: string }[])
      .map((row) => row.title.toLowerCase()),
  );
  db.close();

  const recentActs = await fetchRecentGazetteNotifications();
  console.log(`Checked ${recentActs.length} recent gazette notifications.`);

  const newActs: UpdateHit[] = [];

  for (const act of recentActs) {
    if (!localDocs.has(act.title.toLowerCase())) {
      newActs.push({
        document_id: act.title,
        title: act.title,
        remote_updated: act.date,
      });
    }
  }

  mainSummary(newActs);

  if (newActs.length > 0) {
    process.exit(1);
  }

  console.log('');
  console.log('No recent upstream changes detected.');
}

main().catch((error) => {
  console.error(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
