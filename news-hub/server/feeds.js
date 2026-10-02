import { createHash } from 'node:crypto';
import { parseAny } from './parse.js';
import { assertPublicUrl } from './safe-url.js';
import { demoItems } from './demo.js';

const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS_PER_SOURCE = 40;
const USER_AGENT = 'NewsHub/0.1 (+personal feed reader; links back to publishers)';

const cache = new Map(); // url -> { at, parsed }

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Feed too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function download(rawUrl, { trusted, allowPrivate }) {
  let url = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    if (!trusted) await assertPublicUrl(url, { allowPrivate });
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/calendar, */*;q=0.5',
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).href;
      trusted = false; // a catalog feed may redirect anywhere; re-check
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return readCapped(res);
  }
  throw new Error('Too many redirects');
}

const hash = (s) => createHash('sha1').update(s).digest('base64url').slice(0, 12);

/**
 * Fetch one source and normalise its entries into the item shape the
 * frontend renders. `trusted` marks catalog sources (skips the DNS check
 * for the first hop).
 */
export async function fetchSource(source, { trusted = false, allowPrivate = false, demo = false } = {}) {
  let parsed;
  if (demo) {
    parsed = demoItems(source);
  } else {
    const hit = cache.get(source.url);
    if (hit && Date.now() - hit.at < TTL_MS) {
      parsed = hit.parsed;
    } else {
      parsed = parseAny(await download(source.url, { trusted, allowPrivate }));
      cache.set(source.url, { at: Date.now(), parsed });
    }
  }

  const now = Date.now();
  let entries = parsed.items;
  if (parsed.kind === 'ical') {
    // Keep events from yesterday through the next 120 days, soonest first.
    entries = entries
      .filter((e) => {
        const end = Date.parse(e.end || e.start);
        const start = Date.parse(e.start);
        return end >= now - 86400e3 && start <= now + 120 * 86400e3;
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  return entries.slice(0, MAX_ITEMS_PER_SOURCE).map((e) => ({
    ...e,
    id: hash(`${source.id}|${e.guid || e.link || e.title}`),
    kind: parsed.kind === 'ical' ? 'event' : source.sector === 'social' ? 'social' : 'article',
    sourceId: source.id,
    sourceName: source.name || parsed.title || new URL(source.url).hostname,
    sector: source.sector,
  }));
}

export function clearCache() {
  cache.clear();
}
