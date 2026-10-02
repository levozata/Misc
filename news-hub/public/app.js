// Mosaic news hub — client. All personalisation lives in this browser
// (localStorage); the server only fetches and normalises feeds.

const STORE_KEY = 'mosaic:state:v1';
const LAST_KEY = 'mosaic:last:v1';
const REFRESH_MS = 10 * 60 * 1000;

const DEFAULT_TOPICS = [
  { id: 't-climate', name: 'Climate', color: '#10b981', keywords: ['climate', 'emissions', 'methane', 'flood', 'floods', 'wildfire', 'heatwave', 'drought'] },
  { id: 't-elections', name: 'Elections', color: '#3b82f6', keywords: ['election', 'elections', 'vote', 'parliament', 'ballot', 'coalition', 'referendum'] },
  { id: 't-ai', name: 'AI', color: '#a855f7', keywords: ['ai', 'artificial intelligence', 'chatbot', 'machine learning', 'llm'] },
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
const sectorColor = (id) => state.colors[id] || sectorById(id)?.color || '#6b7280';
const uid = () => Math.random().toString(36).slice(2, 10);

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
  if (data.demo) parts.push('Demo mode — sample headlines.');
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

// ------------------------------------------------------------------ render

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
  const present = new Set(data.items.map((i) => i.sector));
  const sectors = catalog.sectors.filter((s) => present.has(s.id));
  $('#sector-chips').replaceChildren(
    el('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(!ui.sectorFilter.size),
      onclick: () => { ui.sectorFilter.clear(); render(); },
    }, 'All sectors'),
    ...sectors.map((s) => el('button', {
      type: 'button', class: 'chip', style: `--c:${sectorColor(s.id)}`,
      'aria-pressed': String(ui.sectorFilter.has(s.id)),
      onclick: () => {
        ui.sectorFilter.has(s.id) ? ui.sectorFilter.delete(s.id) : ui.sectorFilter.add(s.id);
        render();
      },
    }, el('span', { class: 'dot' }), s.name)),
  );
  $('#topic-chips').replaceChildren(...state.topics.map((t) => el('button', {
    type: 'button', class: 'chip topic', style: `--c:${t.color}`,
    'aria-pressed': String(ui.topicFilter === t.id),
    onclick: () => { ui.topicFilter = ui.topicFilter === t.id ? null : t.id; render(); },
  }, '#', t.name)));
}

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

function card(item) {
  const href = safeHref(item.link);
  const topics = topicsFor(item);
  const saved = Boolean(state.saved[item.id]);
  return el('article', {
    class: `card${state.read[item.id] ? ' read' : ''}`,
    style: `--c:${sectorColor(item.sector)}`,
  },
  el('a', {
    class: 'card-link', href, target: '_blank', rel: 'noopener noreferrer',
    onclick: () => { markRead(item); setTimeout(render, 0); },
  },
  item.image && el('img', {
    class: 'thumb', src: item.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
    onerror: (e) => e.target.remove(),
  }),
  el('div', { class: 'meta' },
    el('span', { class: 'dot' }),
    el('span', { class: 'source' }, item.sourceName),
    item.published && el('time', { datetime: item.published }, ` · ${timeAgo(item.published)}`)),
  el('h3', {}, item.title),
  item.summary && el('p', { class: 'summary' }, item.summary)),
  el('div', { class: 'card-foot' },
    el('div', { class: 'tags' }, topics.map((t) => el('span', { class: 'tag', style: `--c:${t.color}` }, t.name))),
    el('button', {
      type: 'button', class: `save${saved ? ' on' : ''}`, 'aria-pressed': String(saved),
      title: saved ? 'Remove from saved' : 'Save for later', onclick: () => toggleSaved(item),
    }, saved ? '★' : '☆')));
}

function empty(text, action) {
  return el('div', { class: 'empty' }, el('p', {}, text), action);
}

function renderFeed() {
  const items = visibleItems('article');
  if (!items.length) {
    return empty(data.items.length ? 'Nothing matches these filters.' : 'No stories yet.',
      el('button', { type: 'button', class: 'btn', onclick: openSettings }, 'Choose sources'));
  }
  return el('div', { class: 'grid' }, items.map(card));
}

function renderStories() {
  const byId = new Map(visibleItems('article').map((i) => [i.id, i]));
  const clusters = (data.clusters || [])
    .map((c) => ({ ...c, items: c.itemIds.map((id) => byId.get(id)).filter(Boolean) }))
    .filter((c) => new Set(c.items.map((i) => i.sourceId)).size >= 2);
  if (!clusters.length) {
    return empty('No story is being covered by several of your sources right now. Add more outlets in the same sector to see stories cluster together.');
  }
  return el('div', { class: 'stories' }, clusters.map((c) => {
    const lead = c.items[0];
    const sectors = [...new Set(c.items.map((i) => i.sector))];
    return el('section', { class: 'story', style: `--c:${sectorColor(lead.sector)}` },
      el('header', {},
        el('div', { class: 'story-sectors' }, sectors.map((s) => el('span', { class: 'dot', style: `--c:${sectorColor(s)}` }))),
        el('span', { class: 'story-count' }, `${new Set(c.items.map((i) => i.sourceId)).size} sources`),
        c.label.length ? el('span', { class: 'story-label' }, c.label.join(' · ')) : null),
      el('h3', {}, lead.title),
      el('ul', {}, c.items.map((i) => el('li', {},
        el('a', {
          href: safeHref(i.link), target: '_blank', rel: 'noopener noreferrer',
          class: state.read[i.id] ? 'read' : '', onclick: () => markRead(i),
        },
        el('span', { class: 'source', style: `--c:${sectorColor(i.sector)}` }, i.sourceName),
        ' ', i.title),
        i.published ? el('time', { datetime: i.published }, timeAgo(i.published)) : null))));
  }));
}

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

function renderEvents() {
  const events = visibleItems('event');
  if (!events.length) {
    return empty('No upcoming events. Add an iCal (.ics) calendar from a venue, museum or Meetup group in settings.',
      el('button', { type: 'button', class: 'btn', onclick: openSettings }, 'Add a calendar'));
  }
  const groups = new Map();
  for (const e of events) {
    const d = parseStart(e);
    const k = dayKey(d);
    if (!groups.has(k)) groups.set(k, { date: d, items: [] });
    groups.get(k).items.push(e);
  }
  return el('div', { class: 'events' }, [...groups.values()].map((g) => el('section', { class: 'day' },
    el('h3', { class: 'day-label' }, dayLabel(g.date)),
    g.items.map((e) => {
      const d = parseStart(e);
      return el('a', {
        class: 'event', href: safeHref(e.link), target: '_blank', rel: 'noopener noreferrer',
        style: `--c:${sectorColor(e.sector)}`,
      },
      el('div', { class: 'event-time' }, e.allDay ? 'All day' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })),
      el('div', {},
        el('div', { class: 'event-title' }, e.title),
        el('div', { class: 'event-meta' }, [e.location, e.sourceName].filter(Boolean).join(' · '))));
    }))));
}

function renderSaved() {
  const items = Object.values(state.saved).sort((a, b) => Date.parse(b.published || b.start || 0) - Date.parse(a.published || a.start || 0));
  if (!items.length) return empty('Tap ☆ on any story to keep it here.');
  return el('div', { class: 'grid' }, items.map(card));
}

function render() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', String(t.dataset.view === state.view)));
  renderChips();
  const views = { feed: renderFeed, stories: renderStories, events: renderEvents, saved: renderSaved };
  $('#content').replaceChildren((views[state.view] || renderFeed)());
}

// ------------------------------------------------------------------ settings

function openSettings() {
  renderSettings();
  $('#settings').showModal();
}

function renderSettings() {
  const list = $('#source-list');
  list.replaceChildren(...catalog.sectors.map((sector) => {
    const sources = catalog.sources.filter((s) => s.sector === sector.id);
    const customs = state.custom.filter((s) => s.sector === sector.id);
    return el('fieldset', { class: 'sector', style: `--c:${sectorColor(sector.id)}` },
      el('legend', {},
        el('input', {
          type: 'color', value: sectorColor(sector.id), 'aria-label': `${sector.name} colour`,
          onchange: (e) => { state.colors[sector.id] = e.target.value; persist(); renderSettings(); render(); },
        }),
        sector.name,
        state.colors[sector.id] && el('button', {
          type: 'button', class: 'link-btn',
          onclick: () => { delete state.colors[sector.id]; persist(); renderSettings(); render(); },
        }, 'reset colour')),
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
    el('span', { class: 'dot', style: `--c:${sectorColor(s.sector)}` }),
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

let settingsDirty = false;

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

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  state.view = t.dataset.view;
  persist();
  render();
}));
$('#search').addEventListener('input', (e) => { ui.search = e.target.value; render(); });
$('#refresh').addEventListener('click', refresh);
$('#open-settings').addEventListener('click', openSettings);

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
