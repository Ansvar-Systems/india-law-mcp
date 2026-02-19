/**
 * Indian statute identifier handling.
 *
 * Indian Acts are identified by act number and year, e.g. "act-22-2023" for DPDPA.
 * The ID in the database is a slug derived from the act number and year.
 * Some Acts use Roman numeral numbering which is normalised to Arabic numerals.
 */

import type { Database } from '@ansvar/mcp-sqlite';

/** Map of common Roman numerals used in Indian Act numbering */
const ROMAN_TO_ARABIC: Record<string, number> = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
  'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
  'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15,
  'XVI': 16, 'XVII': 17, 'XVIII': 18, 'XIX': 19, 'XX': 20,
  'XXI': 21, 'XXII': 22, 'XXIII': 23, 'XXIV': 24, 'XXV': 25,
  'XXX': 30, 'XL': 40, 'L': 50, 'LX': 60, 'LXX': 70,
  'LXXX': 80, 'XC': 90, 'C': 100,
};

export function romanToArabic(roman: string): number | null {
  const upper = roman.toUpperCase().trim();
  if (ROMAN_TO_ARABIC[upper] !== undefined) {
    return ROMAN_TO_ARABIC[upper];
  }
  // Try simple Roman numeral parsing
  const romanValues: Record<string, number> = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000,
  };
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const current = romanValues[upper[i]];
    const next = romanValues[upper[i + 1]];
    if (current === undefined) return null;
    if (next !== undefined && current < next) {
      total -= current;
    } else {
      total += current;
    }
  }
  return total > 0 ? total : null;
}

export function isValidStatuteId(id: string): boolean {
  return id.length > 0 && id.trim().length > 0;
}

export function statuteIdCandidates(id: string): string[] {
  const trimmed = id.trim().toLowerCase();
  const candidates = new Set<string>();
  candidates.add(trimmed);

  // Also try the original casing
  candidates.add(id.trim());

  // Convert spaces/dashes to the other form
  if (trimmed.includes(' ')) {
    candidates.add(trimmed.replace(/\s+/g, '-'));
  }
  if (trimmed.includes('-')) {
    candidates.add(trimmed.replace(/-/g, ' '));
  }

  return [...candidates];
}

export function resolveExistingStatuteId(
  db: Database,
  inputId: string,
): string | null {
  // Try exact match first
  const exact = db.prepare(
    "SELECT id FROM legal_documents WHERE id = ? LIMIT 1"
  ).get(inputId) as { id: string } | undefined;

  if (exact) return exact.id;

  // Try LIKE match on title
  const byTitle = db.prepare(
    "SELECT id FROM legal_documents WHERE title LIKE ? LIMIT 1"
  ).get(`%${inputId}%`) as { id: string } | undefined;

  return byTitle?.id ?? null;
}
