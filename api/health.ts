import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVER_NAME = 'india-law-mcp';
const SERVER_VERSION = '1.0.0';
const REPO_URL = 'https://github.com/Ansvar-Systems/india-law-mcp';
const FRESHNESS_MAX_DAYS = 30;

export default function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', `https://${req.headers.host}`);

  if (url.pathname === '/version' || url.searchParams.has('version')) {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      node_version: process.version,
      transport: ['stdio', 'streamable-http'],
      capabilities: ['statutes', 'eu_cross_references', 'cert_in_directions'],
      tier: 'free',
      source_schema_version: '1.0',
      repo_url: REPO_URL,
      report_issue_url: `${REPO_URL}/issues/new?template=data-error.md`,
    });
    return;
  }

  res.status(200).json({
    status: 'ok',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    uptime_seconds: Math.floor(process.uptime()),
    data_freshness: {
      max_age_days: FRESHNESS_MAX_DAYS,
      note: 'Serving bundled free-tier database',
    },
    capabilities: ['statutes', 'eu_cross_references', 'cert_in_directions'],
    tier: 'free',
  });
}
