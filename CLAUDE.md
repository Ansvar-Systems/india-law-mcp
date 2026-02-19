# India Law MCP — Project Guide

## Overview
MCP server providing Indian primary legislation via Model Context Protocol. Data sourced from India Code (indiacode.nic.in, National Informatics Centre). Strategy B deployment (runtime DB download on Vercel cold start).

## Architecture
- **Dual transport**: stdio (`src/index.ts`) + Streamable HTTP (`api/mcp.ts`)
- **Shared tool registry**: `src/tools/registry.ts` — both transports use identical tools
- **Database**: SQLite + FTS5, built by `scripts/build-db.ts` from seed JSON
- **Ingestion**: `scripts/ingest.ts` fetches HTML pages from indiacode.nic.in via cheerio

## Key Conventions
- All tool implementations return `ToolResponse<T>` with `results` + `_metadata`
- Database queries MUST use parameterized statements (never string interpolation)
- FTS5 queries go through `buildFtsQueryVariants()` for sanitization
- Statute IDs resolved via `resolveExistingStatuteId()` (exact match then LIKE)
- Journal mode must be DELETE (not WAL) for WASM/serverless compatibility
- Indian Acts may use alphanumeric section numbers (e.g., 43A, 66A) — handle in citation parser
- The `language` column supports 'en' (English, primary) and 'hi' (Hindi) for select Acts

## Commands
- `npm test` — run unit + integration tests (vitest)
- `npm run test:contract` — run golden contract tests
- `npm run test:coverage` — coverage report
- `npm run build` — compile TypeScript
- `npm run validate` — full test suite (unit + contract)
- `npm run dev` — stdio server in dev mode
- `npm run ingest` — fetch legislation from upstream
- `npm run build:db` — rebuild SQLite from seed JSON

## Testing
- Unit tests in `tests/` (in-memory test DB)
- Golden contract tests in `__tests__/contract/` driven by `fixtures/golden-tests.json`
- Drift detection via `fixtures/golden-hashes.json`
- Always run `npm run validate` before committing

## File Structure
- `src/tools/*.ts` — one file per MCP tool
- `src/utils/*.ts` — shared utilities (FTS, metadata, statute ID resolution)
- `src/citation/*.ts` — citation parsing, formatting, validation
- `scripts/` — ingestion pipeline and maintenance scripts
- `api/` — Vercel serverless functions (health + MCP endpoint)
- `fixtures/` — golden tests and drift hashes

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a Pull Request.
- Branch protection requires: verified signatures, PR review, and status checks to pass.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, etc.
