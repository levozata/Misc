// Groups headlines from different outlets that cover the same story, using
// word overlap between titles. Cheap, language-agnostic-ish and good enough
// to surface "this story is being covered by 4 of your sources".

const STOPWORDS = new Set(`a an the and or but if of to in on at by for with from as is are was were be been
being it its this that these those he she they we you i his her their our your my not no yes do does did
has have had will would can could should may might must new news says said say after before over under
into out up down about than then there here what when where who why how all any more most some such
just also video watch live update updates latest report reports amid vs via per week day today year`
  .split(/\s+/));

export function tokens(title) {
  const words = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']s\b/g, '').split(/[^\p{L}\p{N}]+/u);
  const out = new Set();
  for (let w of words) {
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

function overlap(a, b) {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { shared, jaccard: shared / (a.size + b.size - shared || 1) };
}

/**
 * @param items objects with { id, sourceId, title, published }
 * @returns clusters sorted by size then recency: { id, label, itemIds, sources }
 */
export function clusterItems(items, { minShared = 2, minJaccard = 0.25, windowHours = 48 } = {}) {
  const cutoff = Date.now() - windowHours * 3600e3;
  const pool = items
    .filter((i) => !i.start && (!i.published || Date.parse(i.published) >= cutoff))
    .map((i) => ({ item: i, toks: tokens(i.title) }))
    .filter((x) => x.toks.size >= 2);

  const parent = pool.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (pool[i].item.sourceId === pool[j].item.sourceId) continue;
      const { shared, jaccard } = overlap(pool[i].toks, pool[j].toks);
      if (shared >= minShared && jaccard >= minJaccard) parent[find(i)] = find(j);
    }
  }

  const groups = new Map();
  pool.forEach((x, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(x);
  });

  const clusters = [];
  for (const members of groups.values()) {
    const sources = new Set(members.map((m) => m.item.sourceId));
    if (sources.size < 2) continue;
    const counts = new Map();
    for (const m of members) for (const t of m.toks) counts.set(t, (counts.get(t) || 0) + 1);
    const label = [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    const sorted = members.map((m) => m.item)
      .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0));
    clusters.push({
      id: `c-${sorted[0].id}`,
      label,
      itemIds: sorted.map((i) => i.id),
      sources: [...sources],
      latest: sorted[0].published,
    });
  }
  return clusters.sort((a, b) => b.sources.length - a.sources.length
    || Date.parse(b.latest || 0) - Date.parse(a.latest || 0));
}
