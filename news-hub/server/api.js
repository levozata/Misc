// Request handlers shared by the local server (server.js) and the Vercel
// functions in /api, so both deployments behave identically.

import { SECTORS, SOURCES, SOURCE_BY_ID, DEFAULT_SELECTION } from './catalog.js';
import { fetchSource, fetchShareImage } from './feeds.js';
import { clusterItems } from './cluster.js';
import { demoShareImage } from './demo.js';

const DEMO = process.env.DEMO === '1';
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_URLS === '1';
const MAX_BODY = 64 * 1024;
const MAX_SOURCES = 80;
const MAX_CUSTOM = 30;

export function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}
export const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
});

async function readJson(req) {
  // Vercel's Node runtime may have parsed the body already.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
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

export async function handleFeed(req, res) {
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

// GET /api/share-image?url=<article> → { image, width } of the article's
// og:image, so the front page can show a sharp picture in its big slots.
export async function handleShareImage(req, res) {
  const url = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
  if (!/^https?:\/\//i.test(url) || url.length > 2000) return sendJson(res, 400, { error: 'Invalid url' });
  let result = null;
  let error = null;
  if (DEMO) result = demoShareImage(url);
  else {
    try {
      result = await fetchShareImage(url, { allowPrivate: ALLOW_PRIVATE });
    } catch (err) {
      error = String(err?.message || err);
      console.warn(`share-image failed for ${url}: ${error}`);
    }
  }
  // Cacheable by the browser and Vercel's CDN; share images rarely change.
  // Failures are cached briefly so a transient error isn't remembered.
  send(res, 200, JSON.stringify(error ? { error } : (result || {})), {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': error
      ? 'public, max-age=60, s-maxage=300'
      : 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
  });
}

export function handleCatalog(req, res) {
  sendJson(res, 200, { sectors: SECTORS, sources: SOURCES, defaults: DEFAULT_SELECTION });
}

// Wraps a handler with method checking and JSON error responses.
export function route(method, handler) {
  return async (req, res) => {
    try {
      if (req.method !== method) return sendJson(res, 405, { error: 'Method not allowed' });
      return await handler(req, res);
    } catch (err) {
      sendJson(res, err.status || 500, { error: err.status ? err.message : 'Internal error' });
      if (!err.status) console.error(err);
    }
  };
}
