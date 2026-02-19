# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-XX-XX
### Added
- Initial release of India Law MCP
- `search_legislation` tool for full-text search across all Indian statutes and rules
- `get_provision` tool for retrieving specific sections/provisions
- `get_provision_eu_basis` tool for EU/international cross-references (DPDPA-GDPR, IT Act-NIS2)
- `validate_citation` tool for legal citation validation
- `check_statute_currency` tool for checking statute amendment status
- `list_laws` tool for browsing available legislation
- Coverage of DPDPA 2023, IT Act 2000, Companies Act 2013, Consumer Protection Act 2019, Aadhaar Act 2016
- CERT-In directions on 6-hour mandatory incident reporting
- Contract tests with 12 golden test cases
- Drift detection with 6 stable provision anchors
- Health and version endpoints
- Vercel deployment (dual tier bundled free)
- npm package with stdio transport
- MCP Registry publishing

[Unreleased]: https://github.com/Ansvar-Systems/india-law-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Ansvar-Systems/india-law-mcp/releases/tag/v1.0.0
