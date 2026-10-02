// Picture quality helpers. Feeds often carry only small thumbnails, which
// look blurry when the front page stretches them across a wide slot. This
// module (1) upgrades thumbnail URLs on CDNs whose sizing is in the URL, and
// (2) reads an article page's share image (og:image), which publishers
// usually provide at ~1200px.

import { decodeEntities } from './parse.js';

export const TARGET_WIDTH = 1200;

/**
 * Rewrites a known thumbnail URL to a larger rendition. Unknown URLs are
 * returned unchanged; signed URLs are never touched (the signature would
 * break). The client falls back to the original if an upgrade 404s.
 */
export function upgradeImageUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return raw; }
  const before = u.href;

  // BBC: /ace/standard/240/… or /news/240/… → widest standard rendition.
  if (u.hostname === 'ichef.bbci.co.uk') {
    u.pathname = u.pathname.replace(/\/(ace\/(?:standard|ws)|news)\/\d{2,4}\//, '/$1/976/');
  }

  // WordPress resized copies: photo-300x200.jpg → photo.jpg (the original).
  if (u.pathname.includes('/wp-content/uploads/')) {
    u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp|gif))$/i, '$1');
  }

  const signed = ['s', 'sig', 'signature', 'token'].some((k) => u.searchParams.has(k));
  if (!signed) {
    // Query-string sizing (WordPress/Jetpack, CNBC, ESPN, many CDNs): scale
    // width and height together so any crop keeps its shape.
    for (const [wk, hk] of [['w', 'h'], ['width', 'height']]) {
      const w = Number(u.searchParams.get(wk));
      if (w > 0 && w < TARGET_WIDTH) {
        const scale = TARGET_WIDTH / w;
        u.searchParams.set(wk, String(TARGET_WIDTH));
        const h = Number(u.searchParams.get(hk));
        if (h > 0) u.searchParams.set(hk, String(Math.round(h * scale)));
      }
    }
    const resize = u.searchParams.get('resize')?.match(/^(\d+),(\d+)$/);
    if (resize && Number(resize[1]) < TARGET_WIDTH) {
      const scale = TARGET_WIDTH / Number(resize[1]);
      u.searchParams.set('resize', `${TARGET_WIDTH},${Math.round(Number(resize[2]) * scale)}`);
    }
  }
  return u.href === before ? raw : u.href;
}

function metaContent(html, names) {
  for (const name of names) {
    const n = name.replace(/[.:]/g, '\\$&');
    // Attribute order varies between sites: property-then-content and the reverse.
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${n}["'][^>]*content\\s*=\\s*["']([^"']+)["']`
      + `|<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${n}["']`, 'i');
    const m = html.match(re);
    if (m) return decodeEntities(m[1] || m[2]).trim();
  }
  return '';
}

/** Extracts the share image from an article page's <head>. */
export function extractShareImage(html, pageUrl) {
  const raw = metaContent(html, ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'])
    || html.match(/<link[^>]+rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!raw) return null;
  let url;
  try { url = new URL(decodeEntities(raw), pageUrl).href; } catch { return null; }
  if (!/^https?:\/\//i.test(url)) return null;
  const width = Number(metaContent(html, ['og:image:width'])) || null;
  return { image: url, width };
}
