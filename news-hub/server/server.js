import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTORS, SOURCES, SOURCE_BY_ID, DEFAULT_SELECTION } from './catalog.js';
import { fetchSource } from './feeds.js';
import { clusterItems } from './cluster.js';

const PORT = Number(process.env.PORT) || 8080;
const DEMO = process.env.DEMO === '1';
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_URLS === '1';
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_BODY = 64 * 1024;
const MAX_SOURCES = 80;
const MAX_CUSTOM = 30;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
});

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

const SECTOR_IDS = new Set(SECTORS.map((s) => s.id));

// Custom sources come from the browser; keep only well-formed fields.
function cleanCustom(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_CUSTOM).flatMap((s) => {
    if (!s || typeof s.url !== 'string' || typeof s.id !== 'string') return [];
    return [{
      id: `custom:${s.id.slice(0, 40)}`,
      url: s.url.slice(0, 2000),
      name: typeof s.name === 'string' ? s.name.slice(0, 80) : '',
      sector: SECTOR_IDS.has(s.sector) ? s.sector : 'world',
    }];
  });
}

async function handleFeed(req, res) {
  const body = await readJson(req);
  const catalog = (Array.isArray(body.ids) ? body.ids : [])
    .map((id) => SOURCE_BY_ID.get(id)).filter(Boolean);
  const custom = cleanCustom(body.custom);
  const sources = [...catalog, ...custom].slice(0, MAX_SOURCES);
  const isCatalog = new Set(catalog.map((s) => s.id));

  const results = await Promise.allSettled(sources.map((s) => fetchSource(s, {
    trusted: isCatalog.has(s.id), allowPrivate: ALLOW_PRIVATE, demo: DEMO,
  })));

  const items = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else errors.push({ sourceId: sources[i].id, error: String(r.reason?.message || r.reason) });
  });

  const articles = items.filter((i) => i.kind === 'article')
    .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0));
  const events = items.filter((i) => i.kind === 'event')
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const social = items.filter((i) => i.kind === 'social')
    .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0));

  sendJson(res, 200, {
    fetchedAt: new Date().toISOString(),
    demo: DEMO,
    items: [...articles, ...events, ...social],
    clusters: clusterItems(articles),
    errors,
  });
}

async function serveStatic(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, rel || 'index.html');
  if (!file.startsWith(PUBLIC_DIR) || file.includes(`${sep}..${sep}`)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(file);
    send(res, 200, data, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
  } catch {
    send(res, 404, 'Not found', { 'content-type': 'text/plain' });
  }
}

export const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/catalog' && req.method === 'GET') {
      return sendJson(res, 200, { sectors: SECTORS, sources: SOURCES, defaults: DEFAULT_SELECTION });
    }
    if (pathname === '/api/feed' && req.method === 'POST') return await handleFeed(req, res);
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.status ? err.message : 'Internal error' });
    if (!err.status) console.error(err);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`News hub running on http://localhost:${PORT}${DEMO ? ' (demo data)' : ''}`);
  });
}
