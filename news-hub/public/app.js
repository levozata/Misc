// The Mosaic — client. All personalisation lives in this browser
// (localStorage); the server only fetches and normalises feeds. The front
// page is laid out like a printed broadsheet: a lead story above the fold,
// a column of secondary stories, an "In brief" rail, then sector sections
// packed into an asymmetric grid that always fills the full page width.

import { platformOf, followUrl } from './follow.js';

const STORE_KEY = 'mosaic:state:v1';
const LAST_KEY = 'mosaic:last:v1';
const REFRESH_MS = 10 * 60 * 1000;

const DEFAULT_TOPICS = [
  { id: 't-climate', name: 'Climate', color: '#1FA39B', keywords: ['climate', 'emissions', 'methane', 'flood', 'floods', 'wildfire', 'heatwave', 'drought', 'coral'] },
  { id: 't-elections', name: 'Elections', color: '#4D95EA', keywords: ['election', 'elections', 'vote', 'parliament', 'ballot', 'coalition', 'referendum'] },
  { id: 't-ai', name: 'AI', color: '#8E6BD8', keywords: ['ai', 'artificial intelligence', 'chatbot', 'machine learning', 'llm'] },
];

// ------------------------------------------------------------------ state

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

const state = {
  selected: null,        // catalog source ids; null until first catalog load
  custom: [],            // { id, name, url, sector }
  colors: {},            // sectorId -> colour override
  topics: DEFAULT_TOPICS,
  read: {},              // itemId -> timestamp
  saved: {},             // itemId -> item snapshot
  view: 'feed',
  ...loadJson(STORE_KEY),
};
const persist = () => saveJson(STORE_KEY, {
  selected: state.selected, custom: state.custom, colors: state.colors,
  topics: state.topics, read: state.read, saved: state.saved, view: state.view,
});

// Session-only UI state.
const ui = { sectorFilter: new Set(), topicFilter: null, search: '', loading: false };
let catalog = { sectors: [], sources: [], defaults: [] };
let data = loadJson(LAST_KEY) || { items: [], clusters: [], errors: [] };

// ------------------------------------------------------------------ helpers

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const sectorById = (id) => catalog.sectors.find((s) => s.id === id);
const sectorName = (id) => sectorById(id)?.name || id;
const sectorColor = (id) => state.colors[id] || sectorById(id)?.color || '#6b7280';
const uid = () => Math.random().toString(36).slice(2, 10);

// Pick ink or white text for a coloured band, whichever contrasts more.
function inkOn(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.062 ? '#ffffff' : '#1b1a17';
}
const colorVars = (hex) => `--c:${hex};--on-c:${inkOn(hex)}`;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const topicMatchers = new Map();
function topicsFor(item) {
  const text = `${item.title} ${item.summary || ''}`;
  return state.topics.filter((t) => {
    const key = t.keywords.join('|');
    if (!topicMatchers.has(key)) {
      const alts = t.keywords.map((k) => escapeRe(k.trim())).filter(Boolean).join('|');
      topicMatchers.set(key, alts ? new RegExp(`(^|[^\\p{L}\\p{N}])(${alts})(?=$|[^\\p{L}\\p{N}])`, 'iu') : null);
    }
    return topicMatchers.get(key)?.test(text);
  });
}

// Grid columns the front page is laid out on; mirrors the CSS breakpoints.
const gridCols = () => (window.innerWidth >= 1100 ? 12 : window.innerWidth >= 700 ? 6 : 1);

// ------------------------------------------------------------------ data

async function loadCatalog() {
  const res = await fetch('/api/catalog');
  catalog = await res.json();
  if (!state.selected) {
    state.selected = [...catalog.defaults];
    persist();
  }
}

async function refresh() {
  if (ui.loading) return;
  ui.loading = true;
  $('#refresh').classList.add('spinning');
  setStatus('Fetching your sources…');
  try {
    const res = await fetch('/api/feed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: state.selected, custom: state.custom }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    data = await res.json();
    saveJson(LAST_KEY, data);
    setStatus(statusText());
  } catch (err) {
    setStatus(`Couldn't refresh (${err.message}). Showing your last loaded stories.`, true);
  } finally {
    ui.loading = false;
    $('#refresh').classList.remove('spinning');
    render();
  }
}

function sourceName(id) {
  return catalog.sources.find((s) => s.id === id)?.name
    || state.custom.find((s) => `custom:${s.id}` === id)?.name || id;
}

function statusText() {
  const parts = [];
  if (data.demo) parts.push('Demo edition — sample headlines.');
  if (data.errors?.length) {
    parts.push(`${data.errors.length} source${data.errors.length > 1 ? 's' : ''} couldn't be loaded: `
      + data.errors.map((e) => `${sourceName(e.sourceId)} (${e.error})`).join(', '));
  }
  return parts.join(' ');
}

function setStatus(text, isError = false) {
  const s = $('#status');
  s.textContent = text;
  s.classList.toggle('error', isError);
  s.hidden = !text;
}

// ------------------------------------------------------------------ masthead

function renderMasthead() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400e3);
  $('#edition-no').textContent = `Vol. ${now.getFullYear() - 2025} · No. ${dayOfYear}`;
  $('#today').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const n = (state.selected?.length || 0) + state.custom.length;
  $('#edition-sources').textContent = `Your edition · ${n} source${n === 1 ? '' : 's'}`;
  $('#edition-updated').textContent = data.fetchedAt ? `Updated ${timeAgo(data.fetchedAt)}` : '';
}

// ------------------------------------------------------------------ filters

function filtersActive() {
  return ui.sectorFilter.size > 0 || ui.topicFilter || ui.search.trim();
}

function visibleItems(kind) {
  const q = ui.search.trim().toLowerCase();
  return data.items.filter((i) => {
    if (kind && i.kind !== kind) return false;
    if (ui.sectorFilter.size && !ui.sectorFilter.has(i.sector)) return false;
    if (ui.topicFilter && !topicsFor(i).some((t) => t.id === ui.topicFilter)) return false;
    if (q && !`${i.title} ${i.summary} ${i.sourceName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderChips() {
  const counts = new Map();
  for (const i of data.items) counts.set(i.sector, (counts.get(i.sector) || 0) + 1);
  const sectors = catalog.sectors.filter((s) => counts.has(s.id));
  $('#sector-chips').replaceChildren(
    el('span', { class: 'index-label' }, 'Inside'),
    el('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(!ui.sectorFilter.size),
      onclick: () => { ui.sectorFilter.clear(); render(); },
    }, 'All'),
    ...sectors.map((s) => el('button', {
      type: 'button', class: 'chip', style: colorVars(sectorColor(s.id)),
      'aria-pressed': String(ui.sectorFilter.has(s.id)),
      onclick: () => {
        ui.sectorFilter.has(s.id) ? ui.sectorFilter.delete(s.id) : ui.sectorFilter.add(s.id);
        render();
      },
    }, el('span', { class: 'mark' }), s.name, el('span', { class: 'count' }, counts.get(s.id)))),
  );
  $('#topic-chips').replaceChildren(
    el('span', { class: 'index-label' }, 'Topics'),
    ...state.topics.map((t) => el('button', {
      type: 'button', class: 'chip topic', style: colorVars(t.color),
      'aria-pressed': String(ui.topicFilter === t.id),
      onclick: () => { ui.topicFilter = ui.topicFilter === t.id ? null : t.id; render(); },
    }, '#', t.name)),
  );
}

// ------------------------------------------------------------------ stories

function markRead(item) {
  state.read[item.id] = Date.now();
  persist();
}

function toggleSaved(item) {
  if (state.saved[item.id]) delete state.saved[item.id];
  else state.saved[item.id] = item;
  persist();
  render();
}

function storyLink(item, ...children) {
  return el('a', {
    href: safeHref(item.link), target: '_blank', rel: 'noopener noreferrer',
    onclick: () => { markRead(item); setTimeout(render, 0); },
  }, ...children);
}

function saveButton(item) {
  const saved = Boolean(state.saved[item.id]);
  return el('button', {
    type: 'button', class: `save${saved ? ' on' : ''}`, 'aria-pressed': String(saved),
    title: saved ? 'Remove clipping' : 'Clip for later', 'aria-label': saved ? 'Remove clipping' : 'Clip for later',
    onclick: () => toggleSaved(item),
  }, saved ? '★' : '☆');
}

/**
 * One article in newspaper style. size: lead | major | minor | brief.
 * extra: optional nodes appended (e.g. "also reported by").
 */
function story(item, size = 'minor', { showImage = true, showKicker = true, extra = null } = {}) {
  const topics = topicsFor(item);
  const cls = `story story-${size}${state.read[item.id] ? ' read' : ''}`;
  if (size === 'brief') {
    return el('article', { class: cls, style: colorVars(sectorColor(item.sector)) },
      el('span', { class: 'mark' }),
      el('div', {},
        el('h4', { class: 'headline' }, storyLink(item, item.title)),
        el('p', { class: 'byline' }, item.sourceName, item.published ? ` · ${timeAgo(item.published)}` : '')));
  }
  return el('article', { class: cls, style: colorVars(sectorColor(item.sector)) },
    showImage && item.image && storyLink(item, el('img', {
      class: 'figure', src: item.image, alt: '', loading: size === 'lead' ? 'eager' : 'lazy',
      referrerpolicy: 'no-referrer', onerror: (e) => e.target.closest('a')?.remove(),
    })),
    showKicker && el('div', { class: 'kicker' }, el('span', { class: 'mark' }), sectorName(item.sector)),
    el(size === 'lead' ? 'h2' : 'h3', { class: 'headline' }, storyLink(item, item.title)),
    el('p', { class: 'byline' },
      el('span', {}, 'By ', el('strong', {}, item.sourceName), item.published ? ` · ${timeAgo(item.published)}` : ''),
      saveButton(item)),
    item.summary && el('p', { class: 'dek' }, item.summary),
    extra,
    topics.length ? el('div', { class: 'tags' }, topics.map((t) => el('span', { class: 'tag', style: colorVars(t.color) }, t.name))) : null);
}

function empty(text, action) {
  return el('div', { class: 'empty' }, el('p', {}, text), action);
}

function clustersWith(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (data.clusters || [])
    .map((c) => ({ ...c, items: c.itemIds.map((id) => byId.get(id)).filter(Boolean) }))
    .filter((c) => new Set(c.items.map((i) => i.sourceId)).size >= 2);
}

function alsoReported(cluster, lead) {
  if (!cluster) return null;
  const others = [...new Set(cluster.items.filter((i) => i.sourceId !== lead.sourceId).map((i) => i.sourceName))];
  if (!others.length) return null;
  return el('p', { class: 'also' }, el('span', {}, 'Also reported by '), others.join(', '));
}

// ------------------------------------------------------------------ social

function postCard(item, { compact = false } = {}) {
  const p = platformOf(item.link);
  return el('article', { class: `post${compact ? ' compact' : ''}${state.read[item.id] ? ' read' : ''}`, style: colorVars(p.color) },
    el('header', { class: 'post-head' },
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, (item.sourceName || '?').replace(/^[@r]\/?/i, '').slice(0, 1).toUpperCase()),
      el('span', { class: 'post-who' },
        el('strong', {}, item.sourceName),
        el('span', {}, p.name, item.published ? ` · ${timeAgo(item.published)}` : '')),
      compact ? null : saveButton(item)),
    el('p', { class: 'post-text' }, storyLink(item, item.title)),
    !compact && item.image ? storyLink(item, el('img', {
      class: 'figure', src: item.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
      onerror: (e) => e.target.closest('a')?.remove(),
    })) : null);
}

function renderSocial() {
  const posts = visibleItems('social');
  const following = [
    ...catalog.sources.filter((s) => s.sector === 'social' && state.selected.includes(s.id)),
    ...state.custom.filter((s) => s.sector === 'social'),
  ];
  return el('div', { class: 'social-page' },
    el('header', { class: 'results-head' },
      el('h2', {}, 'Social follow-up'),
      el('span', {}, `${posts.length} posts from ${following.length} account${following.length === 1 ? '' : 's'}`),
      el('button', { type: 'button', class: 'band-link', onclick: () => openSettings('#follow-form') }, 'Follow an account')),
    following.length ? el('div', { class: 'following' }, following.map((s) => el('span', {
      class: 'chip', style: colorVars(platformOf(s.url).color),
    }, el('span', { class: 'mark' }), s.name))) : null,
    posts.length
      ? el('div', { class: 'social-wall' }, posts.map((i) => postCard(i)))
      : empty('No posts yet. Follow outlets, journalists or communities on Bluesky, Mastodon, Reddit or YouTube.',
        el('button', { type: 'button', class: 'pill-btn', onclick: () => openSettings('#follow-form') }, 'Follow an account')));
}

// ------------------------------------------------------------------ filling gaps
// Grid rows are as tall as their tallest block, which leaves blank space
// under shorter columns. After layout, each block's .filler (which takes up
// exactly the leftover height) is topped up with extra headlines and posts
// until it is full — the way a printed paper fills a column with shorts.

let fillPool = null;
let fillTimer = 0;

function filler(sector = '') {
  return el('div', { class: 'filler', 'data-sector': sector });
}

function fillGaps() {
  const fillers = [...document.querySelectorAll('.filler')];
  fillers.forEach((f) => f.replaceChildren());
  if (!fillPool) return;
  const taken = new Set();
  for (const f of fillers) {
    if (f.clientHeight < 70) continue;
    const sector = f.dataset.sector;
    const queue = [
      ...fillPool.articles.filter((i) => sector && i.sector === sector),
      ...fillPool.articles.filter((i) => !sector || i.sector !== sector),
      ...fillPool.social,
    ];
    let lastKind = null;
    for (const item of queue) {
      if (taken.has(item.id)) continue;
      const kind = item.kind === 'social' ? 'social' : 'article';
      const nodes = [];
      if (kind !== lastKind) {
        nodes.push(el('h4', { class: 'filler-title' }, kind === 'social' ? 'From social' : (sector ? `More ${sectorName(sector)}` : 'More headlines')));
      }
      nodes.push(kind === 'social' ? postCard(item, { compact: true }) : story(item, 'brief'));
      f.append(...nodes);
      if (f.scrollHeight > f.clientHeight + 1) {
        nodes.forEach((n) => n.remove());
        break;
      }
      taken.add(item.id);
      lastKind = kind;
    }
  }
}

function scheduleFill() {
  clearTimeout(fillTimer);
  fillTimer = setTimeout(fillGaps, 60);
}

// ------------------------------------------------------------------ front page

// Assigns each section a column span so every row fills the full width,
// alternating big and small blocks for an asymmetric, printed-page rhythm.
function packSections(sections, cols) {
  if (cols === 1) return sections.map((s) => ({ ...s, span: 1 }));
  const bySize = [...sections].sort((a, b) => b.items.length - a.items.length);
  const order = [];
  while (bySize.length) {
    order.push(bySize.shift());
    if (bySize.length) order.push(bySize.pop());
  }
  const want = (s) => (cols === 12
    ? (s.items.length >= 6 ? 8 : s.items.length >= 3 ? 5 : 4)
    : (s.items.length >= 4 ? 6 : 3));
  const out = [];
  let rem = cols;
  for (const s of order) {
    let span = Math.min(want(s), rem);
    if (span < 3) { // leftover too narrow for a section: widen the previous one
      out[out.length - 1].span += rem;
      rem = cols;
      span = Math.min(want(s), rem);
    }
    out.push({ ...s, span });
    rem -= span;
    if (rem === 0) rem = cols;
  }
  if (rem !== cols && out.length) out[out.length - 1].span += rem;
  return out;
}

function renderSection({ sector, items, span }, cols, clusterOf) {
  const also = (i) => alsoReported(clusterOf.get(i.id), i);
  const color = sectorColor(sector);
  const wide = cols > 1 && span / cols >= 0.6;
  const lead = items.find((i) => i.image) || items[0];
  const rest = items.filter((i) => i !== lead);
  return el('section', {
    class: `paper-section${wide ? ' wide' : ''}`,
    style: `${colorVars(color)};grid-column:span ${span}`,
  },
  el('header', { class: 'section-band' },
    el('h2', {}, sectorName(sector)),
    el('button', {
      type: 'button', class: 'band-link',
      onclick: () => { ui.sectorFilter = new Set([sector]); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    }, `${items.length} ${items.length === 1 ? 'story' : 'stories'} →`)),
  el('div', { class: 'section-body' },
    story(lead, 'major', { showKicker: false, extra: also(lead) }),
    rest.length ? el('div', { class: 'newsprint' }, rest.map((i) => story(i, 'minor', {
      showImage: false, showKicker: false, extra: also(i),
    }))) : null),
  filler(sector));
}

function renderFront() {
  const articles = visibleItems('article');
  const posts = visibleItems('social');
  fillPool = null;
  if (filtersActive()) return renderResults(articles, posts);
  if (!articles.length) {
    return empty(data.items.length ? 'Nothing in today’s paper matches these filters.' : 'The presses are warming up — no stories yet.',
      el('button', { type: 'button', class: 'pill-btn', onclick: () => openSettings() }, 'Choose sources'));
  }

  const cols = gridCols();
  const used = new Set();
  const clusters = clustersWith(articles);
  const clusterOf = new Map();
  for (const c of clusters) for (const i of c.items) clusterOf.set(i.id, c);
  // Taking a story also retires the rest of its cluster, so the front page
  // doesn't print the same news twice.
  const take = (item) => {
    used.add(item.id);
    clusterOf.get(item.id)?.items.forEach((i) => used.add(i.id));
    return item;
  };
  const unused = () => articles.filter((i) => !used.has(i.id));

  const leadCluster = clusters[0];
  const lead = take(leadCluster?.items.find((i) => i.image) || leadCluster?.items[0]
    || articles.find((i) => i.image) || articles[0]);

  // Secondary column: biggest remaining stories, preferring a mix of sections.
  const secondary = [];
  const seenSectors = new Set([lead.sector]);
  for (const c of clusters.slice(1)) {
    if (secondary.length >= 3) break;
    const head = c.items.find((i) => !used.has(i.id));
    if (head && !seenSectors.has(head.sector)) { secondary.push(take(head)); seenSectors.add(head.sector); }
  }
  for (const i of unused()) {
    if (secondary.length >= 3) break;
    if (!seenSectors.has(i.sector)) { secondary.push(take(i)); seenSectors.add(i.sector); }
  }

  // Two follow-up stories fill the space under the lead, as on a printed page.
  const followers = unused().filter((i) => i.sector !== lead.sector).slice(0, 2).map(take);
  const briefs = unused().slice(0, 7).map(take);
  const events = visibleItems('event').slice(0, 5);
  const pulse = posts.slice(0, 4);

  const fold = el('div', { class: 'fold' },
    el('div', { class: 'fold-lead' },
      story(lead, 'lead', { extra: alsoReported(clusterOf.get(lead.id), lead) }),
      followers.length ? el('div', { class: 'lead-follow' }, followers.map((i) => story(i, 'minor', {
        showImage: false, extra: alsoReported(clusterOf.get(i.id), i),
      }))) : null,
      filler()),
    el('div', { class: 'fold-secondary' }, secondary.map((i) => story(i, 'major', {
      showImage: false, extra: alsoReported(clusterOf.get(i.id), i),
    })), filler()),
    el('aside', { class: 'fold-rail' },
      briefs.length ? el('div', { class: 'brief-box' },
        el('h3', { class: 'rail-title' }, 'In brief'),
        briefs.map((i) => story(i, 'brief'))) : null,
      events.length ? el('div', { class: 'whats-on' },
        el('h3', { class: 'rail-title' }, 'What’s on'),
        events.map((e) => eventLine(e)),
        el('button', { type: 'button', class: 'band-link', onclick: () => setView('events') }, 'All listings →')) : null,
      pulse.length ? el('div', { class: 'pulse' },
        el('h3', { class: 'rail-title' }, 'Social pulse'),
        pulse.map((i) => postCard(i, { compact: true })),
        el('button', { type: 'button', class: 'band-link', onclick: () => setView('social') }, 'All posts →')) : null,
      filler()));

  // One entry per story: other outlets' versions become "also reported by".
  const bySector = new Map();
  for (const i of articles) {
    if (used.has(i.id)) continue;
    take(i);
    if (!bySector.has(i.sector)) bySector.set(i.sector, []);
    bySector.get(i.sector).push(i);
  }
  const sections = packSections(
    [...bySector].map(([sector, items]) => ({ sector, items: items.slice(0, 9) })), cols);
  fillPool = {
    articles: [...bySector.values()].flatMap((items) => items.slice(9)),
    social: posts.slice(pulse.length),
  };

  return el('div', { class: 'front' },
    fold,
    sections.length ? el('div', { class: 'sections', style: `--cols:${cols}` },
      sections.map((s) => renderSection(s, cols, clusterOf))) : null);
}

function renderResults(articles, posts = []) {
  const label = [
    ...[...ui.sectorFilter].map(sectorName),
    ui.topicFilter && `#${state.topics.find((t) => t.id === ui.topicFilter)?.name}`,
    ui.search.trim() && `“${ui.search.trim()}”`,
  ].filter(Boolean).join(' · ');
  return el('div', { class: 'results' },
    el('header', { class: 'results-head' },
      el('h2', {}, label || 'Results'),
      el('span', {}, `${articles.length} ${articles.length === 1 ? 'story' : 'stories'}${posts.length ? ` · ${posts.length} posts` : ''}`),
      el('button', {
        type: 'button', class: 'band-link',
        onclick: () => { ui.sectorFilter.clear(); ui.topicFilter = null; ui.search = ''; $('#search').value = ''; render(); },
      }, 'Back to the front page')),
    articles.length ? el('div', { class: 'newsprint wide-columns' }, articles.map((i, n) => story(i, n === 0 ? 'major' : 'minor'))) : null,
    posts.length ? el('div', { class: 'social-wall' }, posts.map((i) => postCard(i))) : null,
    !articles.length && !posts.length ? empty('Nothing in today’s paper matches these filters.') : null);
}

// ------------------------------------------------------------------ coverage

function renderStories() {
  const clusters = clustersWith(visibleItems('article'));
  if (!clusters.length) {
    return empty('No story is being covered by several of your sources right now. Add more outlets in the same section to see coverage compared side by side.');
  }
  return el('div', { class: 'coverage' }, clusters.map((c) => {
    const lead = c.items.find((i) => i.image) || c.items[0];
    const sectors = [...new Set(c.items.map((i) => i.sector))];
    const n = new Set(c.items.map((i) => i.sourceId)).size;
    return el('section', { class: 'coverage-block', style: colorVars(sectorColor(lead.sector)) },
      el('div', { class: 'kicker' },
        sectors.map((s) => el('span', { class: 'mark', style: colorVars(sectorColor(s)) })),
        `${n} sources`, c.label.length ? el('span', { class: 'label' }, ` · ${c.label.join(' · ')}`) : null),
      lead.image ? storyLink(lead, el('img', {
        class: 'figure', src: lead.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
        onerror: (e) => e.target.closest('a')?.remove(),
      })) : null,
      el('h2', { class: 'headline' }, storyLink(lead, lead.title)),
      el('ol', { class: 'versions' }, c.items.map((i) => el('li', { class: state.read[i.id] ? 'read' : '' },
        el('span', { class: 'by' }, i.sourceName),
        storyLink(i, i.title),
        i.published ? el('time', { datetime: i.published }, timeAgo(i.published)) : null))));
  }));
}

// ------------------------------------------------------------------ listings

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function dayLabel(d) {
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400e3);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

// Date-only values ("2026-10-05") must be read as local dates, not UTC midnight.
const parseStart = (e) => (e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(e.start));
const eventTime = (e) => (e.allDay ? 'All day'
  : parseStart(e).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));

function eventLine(e, withDay = true) {
  const d = parseStart(e);
  return el('a', {
    class: 'listing', href: safeHref(e.link), target: '_blank', rel: 'noopener noreferrer',
    style: colorVars(sectorColor(e.sector)),
  },
  el('span', { class: 'listing-when' }, withDay ? `${dayLabel(d)}, ${eventTime(e)}` : eventTime(e)),
  el('span', { class: 'listing-title' }, e.title),
  el('span', { class: 'listing-meta' }, [e.location, e.sourceName].filter(Boolean).join(' · ')));
}

function renderEvents() {
  const events = visibleItems('event');
  if (!events.length) {
    return empty('No upcoming events. Add an iCal (.ics) calendar from a venue, museum or Meetup group in Customise.',
      el('button', { type: 'button', class: 'pill-btn', onclick: openSettings }, 'Add a calendar'));
  }
  const groups = new Map();
  for (const e of events) {
    const d = parseStart(e);
    const k = dayKey(d);
    if (!groups.has(k)) groups.set(k, { date: d, items: [] });
    groups.get(k).items.push(e);
  }
  return el('div', { class: 'listings' },
    el('header', { class: 'results-head' }, el('h2', {}, 'What’s on'), el('span', {}, `${events.length} listings`)),
    el('div', { class: 'listings-columns' }, [...groups.values()].map((g) => el('section', { class: 'listing-day' },
      el('h3', {}, dayLabel(g.date)),
      g.items.map((e) => eventLine(e, false))))));
}

function renderSaved() {
  const items = Object.values(state.saved)
    .sort((a, b) => Date.parse(b.published || b.start || 0) - Date.parse(a.published || a.start || 0));
  if (!items.length) return empty('Tap ☆ on any story to clip it and keep it here.');
  return el('div', { class: 'results' },
    el('header', { class: 'results-head' }, el('h2', {}, 'Clippings'), el('span', {}, `${items.length} saved`)),
    el('div', { class: 'newsprint wide-columns' }, items.map((i) => (i.kind === 'social' ? postCard(i) : story(i, 'minor')))));
}

// ------------------------------------------------------------------ render

function setView(view) {
  state.view = view;
  persist();
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', String(t.dataset.view === state.view)));
  renderMasthead();
  renderChips();
  const views = { feed: renderFront, stories: renderStories, events: renderEvents, social: renderSocial, saved: renderSaved };
  if (state.view !== 'feed') fillPool = null;
  $('#content').replaceChildren((views[state.view] || renderFront)());
  requestAnimationFrame(fillGaps);
}

// ------------------------------------------------------------------ settings

function openSettings(focusSel) {
  renderSettings();
  $('#settings').showModal();
  if (typeof focusSel === 'string') $(focusSel)?.scrollIntoView({ block: 'center' });
}

let settingsDirty = false;

function renderSettings() {
  const list = $('#source-list');
  list.replaceChildren(...catalog.sectors.map((sector) => {
    const sources = catalog.sources.filter((s) => s.sector === sector.id);
    const customs = state.custom.filter((s) => s.sector === sector.id);
    return el('fieldset', { class: 'sector', style: colorVars(sectorColor(sector.id)) },
      el('legend', {},
        el('input', {
          type: 'color', value: sectorColor(sector.id), 'aria-label': `${sector.name} colour`,
          onchange: (e) => { state.colors[sector.id] = e.target.value; persist(); renderSettings(); render(); },
        }),
        sector.name,
        state.colors[sector.id] && el('button', {
          type: 'button', class: 'link-btn',
          onclick: () => { delete state.colors[sector.id]; persist(); renderSettings(); render(); },
        }, 'reset')),
      sources.map((s) => el('label', { class: 'source-option' },
        el('input', {
          type: 'checkbox', checked: state.selected.includes(s.id),
          onchange: (e) => {
            state.selected = e.target.checked
              ? [...state.selected, s.id] : state.selected.filter((id) => id !== s.id);
            persist();
            settingsDirty = true;
          },
        }),
        s.name, s.type === 'ical' ? el('span', { class: 'badge' }, 'calendar') : null)),
      customs.map((s) => el('div', { class: 'source-option custom' }, '＋ ', s.name, el('span', { class: 'badge' }, 'yours'))));
  }));

  const sel = $('#custom-form select');
  sel.replaceChildren(...catalog.sectors.map((s) => el('option', { value: s.id }, s.name)));

  $('#custom-list').replaceChildren(...state.custom.map((s) => el('li', {},
    el('span', { class: 'mark', style: colorVars(sectorColor(s.sector)) }),
    el('span', { class: 'grow' }, `${s.name} `, el('small', {}, s.url)),
    el('button', {
      type: 'button', class: 'link-btn',
      onclick: () => { state.custom = state.custom.filter((c) => c.id !== s.id); persist(); settingsDirty = true; renderSettings(); },
    }, 'remove'))));

  $('#topic-list').replaceChildren(...state.topics.map((t) => el('li', {},
    el('input', {
      type: 'color', value: t.color, 'aria-label': `${t.name} colour`,
      onchange: (e) => { t.color = e.target.value; persist(); render(); },
    }),
    el('span', { class: 'grow' }, el('strong', {}, t.name), ' ', el('small', {}, t.keywords.join(', '))),
    el('button', {
      type: 'button', class: 'link-btn',
      onclick: () => {
        state.topics = state.topics.filter((x) => x.id !== t.id);
        if (ui.topicFilter === t.id) ui.topicFilter = null;
        persist(); renderSettings(); render();
      },
    }, 'remove'))));
}

$('#custom-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const url = String(f.get('url')).trim();
  if (!safeHref(url)) return;
  state.custom.push({ id: uid(), name: String(f.get('name')).trim(), url, sector: String(f.get('sector')) });
  persist();
  settingsDirty = true;
  e.target.reset();
  renderSettings();
});

$('#follow-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const made = followUrl(String(f.get('platform')), String(f.get('handle')));
  const msg = $('#follow-error');
  if (!made || !safeHref(made.url)) {
    msg.textContent = 'That doesn’t look like a handle for this network — see the examples above.';
    return;
  }
  msg.textContent = '';
  state.custom.push({ id: uid(), name: made.name, url: made.url, sector: 'social' });
  persist();
  settingsDirty = true;
  e.target.reset();
  renderSettings();
});

$('#topic-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const keywords = String(f.get('keywords')).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!keywords.length) return;
  state.topics.push({ id: `t-${uid()}`, name: String(f.get('name')).trim(), color: String(f.get('color')), keywords });
  persist();
  e.target.reset();
  renderSettings();
  render();
});

$('#settings').addEventListener('close', () => {
  if (settingsDirty) { settingsDirty = false; refresh(); }
});

// ------------------------------------------------------------------ wiring

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
$('#search').addEventListener('input', (e) => { ui.search = e.target.value; render(); });
$('#refresh').addEventListener('click', refresh);
$('#open-settings').addEventListener('click', openSettings);

// The section grid is packed for a column count, so re-pack when it changes.
let lastCols = gridCols();
window.addEventListener('resize', () => {
  const cols = gridCols();
  if (cols !== lastCols) { lastCols = cols; render(); } else scheduleFill();
});
// Late-loading images and fonts change column heights; refill the gaps.
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') scheduleFill(); }, true);
document.fonts?.ready.then(scheduleFill);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - Date.parse(data.fetchedAt || 0) > REFRESH_MS) refresh();
});
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);

// Forget read markers older than 30 days so storage doesn't grow forever.
const monthAgo = Date.now() - 30 * 86400e3;
for (const [id, t] of Object.entries(state.read)) if (t < monthAgo) delete state.read[id];

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => {
  try {
    await loadCatalog();
  } catch {
    setStatus('Offline — showing your last loaded stories.', true);
  }
  render();
  refresh();
})();
