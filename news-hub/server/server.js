import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { send, sendJson, handleCatalog, handleFeed, handleShareImage } from './api.js';

const PORT = Number(process.env.PORT) || 8080;
const DEMO = process.env.DEMO === '1';
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

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
      return handleCatalog(req, res);
    }
    if (pathname === '/api/feed' && req.method === 'POST') return await handleFeed(req, res);
    if (pathname === '/api/share-image' && req.method === 'GET') return await handleShareImage(req, res);
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
