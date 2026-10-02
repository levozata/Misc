// Dependency-free, tolerant parsers for RSS 2.0, RSS 1.0 (RDF), Atom and
// iCalendar. Feeds in the wild are frequently malformed, so these extract
// what they can instead of validating strictly.

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Text content of an element: CDATA sections are taken verbatim, everything
// else is entity-decoded.
function textOf(raw) {
  let out = '';
  let last = 0;
  for (const m of raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += decodeEntities(raw.slice(last, m.index)) + m[1];
    last = m.index + m[0].length;
  }
  return (out + decodeEntities(raw.slice(last))).trim();
}

export function stripHtml(html, max = 280) {
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : text;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseAttrs(s) {
  const attrs = {};
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4]);
  }
  return attrs;
}

function elements(xml, name) {
  const n = escapeRe(name);
  const re = new RegExp(`<${n}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${n}\\s*>)`, 'gi');
  return [...xml.matchAll(re)].map((m) => ({ attrs: parseAttrs(m[1] || ''), inner: m[2] ?? '' }));
}

function firstText(xml, names) {
  for (const name of names) {
    const el = elements(xml, name)[0];
    if (el) {
      const t = textOf(el.inner);
      if (t) return t;
    }
  }
  return '';
}

const isHttpUrl = (u) => /^https?:\/\//i.test(u || '');

function toIso(value) {
  if (!value) return null;
  const t = Date.parse(value.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function findImage(block, htmlBodies) {
  for (const name of ['media:content', 'media:thumbnail', 'enclosure']) {
    for (const { attrs } of elements(block, name)) {
      const type = attrs.type || '';
      const looksImage = name === 'media:thumbnail' || attrs.medium === 'image' || type.startsWith('image/')
        || (!type && /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(attrs.url || ''));
      if (looksImage && isHttpUrl(attrs.url)) return attrs.url;
    }
  }
  for (const html of htmlBodies) {
    const m = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
    if (m && isHttpUrl(decodeEntities(m[1]))) return decodeEntities(m[1]);
  }
  return null;
}

function atomLink(block) {
  const links = elements(block, 'link');
  const pick = links.find((l) => !l.attrs.rel || l.attrs.rel === 'alternate') || links[0];
  return pick?.attrs.href || '';
}

export function parseXmlFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockName = isAtom ? 'entry' : 'item';
  const firstBlock = xml.search(new RegExp(`<${blockName}[\\s>]`, 'i'));
  const head = firstBlock === -1 ? xml : xml.slice(0, firstBlock);
  const title = firstText(head, ['title']);

  const items = elements(xml, blockName).map(({ inner }) => {
    const rawBodies = [];
    for (const name of ['content:encoded', 'content', 'description', 'summary']) {
      const el = elements(inner, name)[0];
      if (el) rawBodies.push(textOf(el.inner));
    }
    const link = isAtom ? atomLink(inner) : (firstText(inner, ['link']) || atomLink(inner));
    const guid = firstText(inner, ['guid', 'id']);
    // Prefer the shorter description/summary for the teaser, full content as fallback.
    const teaser = [...rawBodies].reverse().find(Boolean) || '';
    return {
      title: stripHtml(firstText(inner, ['title']), 300),
      link: isHttpUrl(link) ? link : (isHttpUrl(guid) ? guid : ''),
      guid: guid || link,
      summary: stripHtml(teaser),
      image: findImage(inner, rawBodies),
      published: toIso(firstText(inner, ['pubDate', 'dc:date', 'published', 'updated', 'a10:updated'])),
      author: stripHtml(firstText(inner, ['dc:creator', 'author']), 80),
    };
  }).filter((i) => i.title && i.link);

  return { title, items };
}

// ---------------------------------------------------------------- iCalendar

function unescapeIcal(s) {
  return s.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

// Returns { iso, allDay }. Times with a TZID or no zone are "floating": they
// are emitted without a trailing Z so the browser renders them as local time,
// which is right for the common case of a city venue's calendar.
function parseIcalDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { iso: `${y}-${mo}-${d}`, allDay: true };
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}${z ? 'Z' : ''}`, allDay: false };
}

export function parseIcal(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let title = '';
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/i);
    if (!m) continue;
    const [, rawName, rawParams, value] = m;
    const name = rawName.toUpperCase();
    const params = Object.fromEntries(rawParams.split(';').filter(Boolean).map((p) => {
      const [k, ...v] = p.split('=');
      return [k.toUpperCase(), v.join('=').replace(/^"|"$/g, '')];
    }));
    if (!cur) {
      if (name === 'X-WR-CALNAME') title = unescapeIcal(value);
      continue;
    }
    if (name === 'DTSTART' || name === 'DTEND') cur[name] = parseIcalDate(value, params);
    else if (!(name in cur)) cur[name] = unescapeIcal(value);
  }

  const items = events.filter((e) => e.SUMMARY && e.DTSTART).map((e) => ({
    title: e.SUMMARY.trim(),
    link: isHttpUrl(e.URL) ? e.URL : '',
    guid: e.UID || `${e.SUMMARY}-${e.DTSTART.iso}`,
    summary: stripHtml(e.DESCRIPTION || ''),
    image: null,
    published: null,
    start: e.DTSTART.iso,
    end: e.DTEND?.iso || null,
    allDay: e.DTSTART.allDay,
    location: (e.LOCATION || '').trim(),
    recurring: Boolean(e.RRULE),
  }));
  return { title, items };
}

export function parseAny(text) {
  if (/BEGIN:VCALENDAR/.test(text.slice(0, 2000))) return { kind: 'ical', ...parseIcal(text) };
  return { kind: 'feed', ...parseXmlFeed(text) };
}
