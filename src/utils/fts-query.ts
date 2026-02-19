/**
 * FTS5 query builder for India Law MCP.
 *
 * Sanitises user input to prevent FTS5 syntax errors from unescaped
 * special characters (quotes, parentheses, colons, etc.) while still
 * allowing intentional FTS5 operators (AND, OR, NOT, *, "phrase").
 */

const EXPLICIT_FTS_SYNTAX = /["""]|(\bAND\b)|(\bOR\b)|(\bNOT\b)|\*$/;

/** Maximum query length to prevent abuse */
const MAX_QUERY_LENGTH = 1000;

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
}

/**
 * Sanitise a single token for safe inclusion in an FTS5 query.
 * Strips characters that have special meaning in FTS5 syntax:
 * - Quotes
 * - Parentheses
 * - Colons (column filters)
 * - Carets (NEAR operator)
 * - Curly braces
 * Preserves alphanumeric, hyphens, underscores, and Unicode letters (including Devanagari).
 */
function sanitiseToken(token: string): string {
  return token.replace(/[^\p{L}\p{N}_-]/gu, '');
}

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);

  if (trimmed.length === 0) {
    return { primary: '""' };
  }

  // If user is using explicit FTS5 syntax, sanitise dangerous chars
  // but preserve the intent of AND/OR/NOT and quotes
  if (EXPLICIT_FTS_SYNTAX.test(trimmed)) {
    let normalised = trimmed
      .replace(/[\u201C\u201D]/g, '"')  // smart quotes → standard
      .replace(/;/g, '')                 // strip semicolons (no SQL leakage)
      .replace(/--/g, '')                // strip comment sequences
      .slice(0, MAX_QUERY_LENGTH);

    // Balance unmatched double quotes to prevent FTS5 "unterminated string" errors
    const quoteCount = (normalised.match(/"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      normalised += '"';
    }

    return { primary: normalised };
  }

  const tokens = trimmed
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(sanitiseToken)
    .filter(t => t.length > 0);

  if (tokens.length === 0) {
    return { primary: '""' };
  }

  const primary = tokens.map(t => `"${t}"*`).join(' ');
  const fallback = tokens.map(t => `${t}*`).join(' OR ');

  return { primary, fallback };
}
