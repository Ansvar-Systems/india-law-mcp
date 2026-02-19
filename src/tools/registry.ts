/**
 * Tool registry for India Law MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation, SearchLegislationInput } from './search-legislation.js';
import { getProvision, GetProvisionInput } from './get-provision.js';
import { listSources } from './list-sources.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, GetEUBasisInput } from './get-eu-basis.js';
import { getIndianImplementations, GetIndianImplementationsInput } from './get-indian-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getAbout, type AboutContext } from './about.js';
export type { AboutContext } from './about.js';

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this to verify data coverage, currency, and content basis before relying on results.',
  inputSchema: { type: 'object', properties: {} },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description:
      'Search Indian statutes, rules, and directions by keyword. Returns provision-level results with BM25 relevance ranking. ' +
      'Supports natural language queries (e.g., "data protection rights") and FTS5 syntax (AND, OR, NOT, "phrase", prefix*). ' +
      'Results include: document ID, title, provision reference, snippet with >>>highlight<<< markers, and relevance score. ' +
      'Use document_id to filter within a single statute. Use status to filter by in_force/amended/repealed. ' +
      'Default limit is 10 (max 50). For broad legal research, prefer build_legal_stance instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in English or Hindi. Supports natural language or FTS5 syntax (AND, OR, NOT, "phrase", prefix*). Example: "personal data" OR "data fiduciary"',
        },
        document_id: {
          type: 'string',
          description: 'Filter to a specific statute by ID (e.g., "act-22-2023") or title (e.g., "Digital Personal Data Protection Act, 2023")',
        },
        status: {
          type: 'string',
          enum: ['in_force', 'amended', 'repealed'],
          description: 'Filter by legislative status. Omit to search all statuses.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10, max: 50). Lower values save tokens.',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description:
      'Retrieve the full text of a specific provision (section) from an Indian statute, or all provisions for a statute if no section is specified. ' +
      'Indian provisions use section notation: s4, s43A, s66(1). Pass document_id as either the internal ID (e.g., "act-22-2023") ' +
      'or the human-readable title (e.g., "Digital Personal Data Protection Act, 2023"). ' +
      'Returns: document ID, title, status, provision reference, chapter, section, title, and full content text. ' +
      'Note: Indian Acts may use alphanumeric section numbers (e.g., 43A, 66A). ' +
      'WARNING: Omitting section/provision_ref returns ALL provisions (capped at 200) for the statute.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Statute identifier (e.g., "act-22-2023") or title (e.g., "Digital Personal Data Protection Act, 2023"). Fuzzy title matching is supported.',
        },
        section: {
          type: 'string',
          description: 'Section number (e.g., "4", "43A", "66(1)"). Matched against provision_ref and section columns.',
        },
        provision_ref: {
          type: 'string',
          description: 'Direct provision reference (e.g., "s4", "s43A"). Takes precedence over section if both provided.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'list_sources',
    description:
      'Returns metadata about all data sources backing this server, including jurisdiction, authoritative source details, ' +
      'database tier, schema version, build date, record counts, and known limitations. ' +
      'Call this first to understand data coverage and freshness before relying on other tools.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_citation',
    description:
      'Validate an Indian legal citation against the database. Returns whether the cited statute and provision exist. ' +
      'Use this as a zero-hallucination check before presenting legal references to users. ' +
      'Supported formats: "Section 4, Digital Personal Data Protection Act, 2023", "s. 43A, Information Technology Act, 2000", "S. 66 IT Act 2000". ' +
      'Returns: valid (boolean), parsed components, warnings about repealed/amended status.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Indian legal citation to validate. Examples: "Section 4, Digital Personal Data Protection Act, 2023", "s. 43A IT Act 2000"',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description:
      'Build a comprehensive set of citations for a legal question by searching across all Indian statutes simultaneously. ' +
      'Returns aggregated results from legislation search, cross-referenced with EU/international law where applicable. ' +
      'Best for broad legal research questions like "What Indian laws govern personal data processing?" ' +
      'For targeted lookups of a known provision, use get_provision instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Legal question or topic to research (e.g., "personal data processing obligations in India")',
        },
        document_id: {
          type: 'string',
          description: 'Optionally limit search to one statute by ID or title',
        },
        limit: {
          type: 'number',
          description: 'Max results per category (default: 5, max: 20)',
          default: 5,
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description:
      'Format an Indian legal citation per standard legal conventions. ' +
      'Formats: "full" → "Section 4, Digital Personal Data Protection Act, 2023", ' +
      '"short" → "s. 4 DPDPA 2023", "pinpoint" → "s. 4". ' +
      'Does NOT validate existence — use validate_citation for that.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Citation string to format (e.g., "s. 4 DPDPA 2023")',
        },
        format: {
          type: 'string',
          enum: ['full', 'short', 'pinpoint'],
          description: 'Output format. "full" (default): formal citation. "short": abbreviated. "pinpoint": section reference only.',
          default: 'full',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description:
      'Check whether an Indian statute or provision is currently in force, amended, or repealed. ' +
      'Returns: is_current (boolean), status, dates (issued, in-force), and warnings. ' +
      'Essential before citing legislation — repealed acts should not be cited as current law.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Statute identifier (e.g., "act-22-2023") or title (e.g., "Digital Personal Data Protection Act, 2023")',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check a specific section (e.g., "s4")',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description:
      'Get EU/international legal basis for an Indian statute. Returns all EU instruments that the Indian statute ' +
      'is modelled on, equivalent to, or references, including CELEX numbers and equivalence status. ' +
      'Useful for understanding GDPR-DPDPA, NIS2-IT Act, and other cross-jurisdictional relationships. ' +
      'Example: DPDPA 2023 → equivalent to GDPR (Regulation 2016/679).',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Indian statute identifier (e.g., "act-22-2023") or title (e.g., "Digital Personal Data Protection Act, 2023")',
        },
        include_articles: {
          type: 'boolean',
          description: 'Include specific EU article references in the response (default: false)',
          default: false,
        },
        reference_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['implements', 'supplements', 'applies', 'references', 'complies_with', 'equivalent_to', 'derogates_from', 'amended_by', 'repealed_by', 'cites_article'],
          },
          description: 'Filter by reference type (e.g., ["equivalent_to"]). Omit to return all types.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_indian_implementations',
    description:
      'Find Indian statutes that implement or are equivalent to a specific EU directive or regulation. ' +
      'Input the EU document ID in "type:year/number" format (e.g., "regulation:2016/679" for GDPR). ' +
      'Returns matching Indian statutes with equivalence status and whether each is the primary equivalent.',
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: {
          type: 'string',
          description: 'EU document ID in format "type:year/number" (e.g., "regulation:2016/679" for GDPR)',
        },
        primary_only: {
          type: 'boolean',
          description: 'Return only primary equivalent statutes (default: false)',
          default: false,
        },
        in_force_only: {
          type: 'boolean',
          description: 'Return only statutes currently in force (default: false)',
          default: false,
        },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description:
      'Search for EU directives and regulations that have Indian equivalents or cross-references. ' +
      'Search by keyword (e.g., "data protection", "cybersecurity"), filter by type (directive/regulation), ' +
      'or year range. Returns EU documents with counts of Indian statutes referencing them.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword search across EU document titles and short names (e.g., "data protection")',
        },
        type: {
          type: 'string',
          enum: ['directive', 'regulation'],
          description: 'Filter by EU document type',
        },
        year_from: { type: 'number', description: 'Filter: EU documents from this year onwards' },
        year_to: { type: 'number', description: 'Filter: EU documents up to this year' },
        has_indian_implementation: {
          type: 'boolean',
          description: 'If true, only return EU documents that have at least one Indian equivalent statute',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20, max: 100)',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description:
      'Get EU/international legal basis for a specific provision within an Indian statute, with article-level precision. ' +
      'Example: DPDPA 2023 s4 → references GDPR Article 6. ' +
      'Use this for pinpoint cross-jurisdictional comparison at the provision level.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Indian statute identifier (e.g., "act-22-2023") or title',
        },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g., "s4", "s43A")',
        },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description:
      'Check EU/international equivalence status for an Indian statute or provision. Detects references to EU directives, ' +
      'identifies equivalent provisions, and flags gaps. Returns compliance status: compliant, partial, unclear, or not_applicable. ' +
      'Note: India does not have a GDPR adequacy decision; this tool assesses structural equivalence only.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Indian statute identifier (e.g., "act-22-2023") or title',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional: check a specific provision (e.g., "s4")',
        },
        eu_document_id: {
          type: 'string',
          description: 'Optional: check equivalence with a specific EU document (e.g., "regulation:2016/679")',
        },
      },
      required: ['document_id'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context ? [...TOOLS, ABOUT_TOOL] : TOOLS;
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(db, args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(db, args as unknown as GetProvisionInput);
          break;
        case 'list_sources':
          result = await listSources(db);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(db, args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(db, args as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(db, args as unknown as GetEUBasisInput);
          break;
        case 'get_indian_implementations':
          result = await getIndianImplementations(db, args as unknown as GetIndianImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(db, args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(db, args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(db, args as unknown as ValidateEUComplianceInput);
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
