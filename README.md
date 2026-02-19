# India Law MCP

[![npm version](https://img.shields.io/npm/v/@ansvar/india-law-mcp)](https://www.npmjs.com/package/@ansvar/india-law-mcp)
[![CI](https://github.com/Ansvar-Systems/india-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/india-law-mcp/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/Ansvar-Systems/india-law-mcp/badge)](https://securityscorecards.dev/viewer/?uri=github.com/Ansvar-Systems/india-law-mcp)

An MCP (Model Context Protocol) server providing full-text search and section-level retrieval of Indian legislation. Covers the Digital Personal Data Protection Act (DPDPA, 2023), Information Technology Act (2000, amended 2008), IT Rules (SPDI Rules 2011, Intermediary Guidelines 2021), Companies Act 2013, Consumer Protection Act 2019, and Aadhaar Act 2016. Includes CERT-In directions on incident reporting. All data is sourced from the official India Code portal (indiacode.nic.in) maintained by the National Informatics Centre, with supplementary sources from legislative.gov.in, meity.gov.in, and cert-in.org.in.

## Data Sources

| Source | Authority | Method | Update Frequency | License | Coverage |
|--------|-----------|--------|-----------------|---------|----------|
| [India Code](https://www.indiacode.nic.in) | Ministry of Law and Justice / NIC | HTML Scrape | On change | Government Open Data | All Central Acts of Parliament |
| [Legislative Department](https://legislative.gov.in) | Legislative Department, MoLJ | HTML Scrape | On change | Government Open Data | Subordinate legislation, IT Rules, gazette notifications |
| [MeitY](https://www.meity.gov.in) | Ministry of Electronics and IT | HTML Scrape | On change | Government Open Data | IT Act rules, CERT-In directions, DPDPA rules |
| [CERT-In](https://www.cert-in.org.in) | CERT-In, MeitY | HTML Scrape | On change | Government Public Data | Incident reporting directions, cybersecurity advisories |

> Full provenance metadata: [`sources.yml`](./sources.yml)

## Laws Covered

| Law | Year | Key Topic |
|-----|------|-----------|
| **Digital Personal Data Protection Act (DPDPA)** | 2023 | India's comprehensive data protection law |
| **Information Technology Act** | 2000 (amended 2008) | Cybercrime, intermediary liability, electronic records |
| **IT (SPDI) Rules** | 2011 | Sensitive personal data protection for body corporates |
| **IT (Intermediary Guidelines) Rules** | 2021 | Platform obligations, content moderation, grievance redressal |
| **Companies Act** | 2013 | Corporate governance, director duties, compliance |
| **Consumer Protection Act** | 2019 | Consumer rights, e-commerce, unfair trade practices |
| **Aadhaar Act** | 2016 | Biometric identity system, authentication, data protection |
| **Constitution (selected provisions)** | 1950 (amended) | Fundamental rights, Article 21 (right to privacy) |

Additionally includes key subordinate legislation and directions:

- CERT-In Directions (April 2022) — 6-hour mandatory incident reporting
- DPDPA Rules (as notified)
- Network Data Security Management rules

## Quick Start

### npx (no install)

```bash
npx @ansvar/india-law-mcp
```

### npm install

```bash
npm install -g @ansvar/india-law-mcp
india-law-mcp
```

### Claude Desktop Configuration

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "india-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/india-law-mcp"]
    }
  }
}
```

### Cursor Configuration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "india-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/india-law-mcp"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_legislation` | Full-text search across all Indian laws and rules. Supports English and Hindi queries. Returns matching provisions with act name, section number, and relevance score. |
| `get_provision` | Retrieve a specific section/provision by act identifier and section number. Returns full text, citation URL, and metadata. |
| `get_provision_eu_basis` | Cross-reference lookup showing the relationship between Indian laws and their EU/international equivalents (e.g., DPDPA vs GDPR, IT Act vs NIS2). |
| `validate_citation` | Validate a legal citation against the database. Checks act name, section number, and returns canonical citation format. |
| `check_statute_currency` | Check whether a law or provision is the current version. Returns adoption date, effective date, and amendment history. |
| `list_laws` | List all laws in the database with metadata: official name, year, effective date, status, and section count. |

## Deployment Tiers

| Tier | Content | Database Size | Platform |
|------|---------|---------------|----------|
| **Free** | All Central Acts + IT Rules + CERT-In directions + EU cross-references | ~100-200 MB | Vercel (bundled) or local |
| **Professional** | + State Acts + Supreme Court landmark judgments + regulatory guidance + full subordinate legislation | ~500 MB-1 GB | Azure Container Apps / Docker / local |

### Deployment Strategy: MEDIUM - Dual Tier, Bundled Free

The free-tier database containing Central Acts and key subordinate legislation is estimated at 100-200 MB, within the Vercel 250 MB bundle limit. The free-tier database is bundled directly with the Vercel deployment. The professional tier with Supreme Court judgments and expanded subordinate legislation requires local Docker or Azure Container Apps deployment.

### Capability Detection

Both tiers use the same codebase. At startup, the server detects available SQLite tables and gates tools accordingly:

```
Free tier:     core_legislation, eu_references, cert_in_directions
Professional:  core_legislation, eu_references, cert_in_directions, supreme_court_judgments, state_acts, subordinate_legislation
```

Tools that require professional capabilities return an upgrade message on the free tier.

## Database Size Estimates

| Component | Estimated Size | Notes |
|-----------|---------------|-------|
| Central Acts (Parliament) | ~40-60 MB | ~800 Central Acts, full English text |
| IT Rules and subordinate legislation (key) | ~20-30 MB | SPDI Rules, Intermediary Guidelines, etc. |
| CERT-In directions and advisories | ~5-10 MB | Incident reporting, compliance requirements |
| EU cross-references | ~5-10 MB | DPDPA-GDPR, IT Act-NIS2 mappings |
| FTS5 indexes | ~30-50 MB | Full-text search indexes |
| **Free tier total** | **~100-200 MB** | |
| Supreme Court landmark judgments | ~200-400 MB | Privacy, IT Act interpretations |
| State Acts | ~200-300 MB | Selected State IT and data protection rules |
| **Professional tier total** | **~500 MB-1 GB** | |

## Data Freshness

- **SLO:** 30 days maximum data age
- **Automated checks:** Weekly upstream change detection
- **Drift detection:** Nightly hash verification of 6 stable provisions (Constitution Art. 21, DPDPA Sec. 2, IT Act Sec. 2, Companies Act Sec. 1, Consumer Protection Act Sec. 1, Aadhaar Act Sec. 1)
- **Health endpoint:** Returns `status: stale` when data exceeds 30-day SLO

## Language Support

The primary language is **English (en)**, which is the principal language of Indian legislation. Hindi (hi) translations are available for most Central Acts. All official law text on India Code is available in English, which is legally authoritative alongside Hindi.

## Contributing

Contributions are welcome. Please read [SECURITY.md](./SECURITY.md) before submitting issues or pull requests.

For data accuracy issues (wrong text, missing sections, stale provisions), use the [data error report template](https://github.com/Ansvar-Systems/india-law-mcp/issues/new?template=data-error.md).

## License

Apache-2.0

The law text itself is public domain under Indian government open data policy. This project's code and database structure are licensed under Apache-2.0.
