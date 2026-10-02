// Sample content for `npm run demo`, so the app can be tried (and developed)
// without network access. Headlines are invented; links go to the source's
// home page. Several sources in a sector share a story so clustering shows up.

const STORIES = {
  world: [
    'Coalition talks collapse as parliament faces snap election',
    'UN climate summit opens with pledge on methane cuts',
    'Floods force thousands from homes across river delta',
    'Ceasefire talks resume in Geneva after two-week pause',
    'Election results delayed as parliament recount continues',
  ],
  business: [
    'Central bank holds interest rates steady amid slowing inflation',
    'Chipmaker shares jump after record quarterly earnings',
    'Port strike threatens holiday shipping deliveries',
  ],
  tech: [
    'Open-source browser engine reaches 1.0 release',
    'EU regulators open inquiry into app store payment rules',
    'Researchers demo battery that charges in five minutes',
    'App store payment rules face new EU antitrust inquiry',
  ],
  science: [
    'Telescope spots water vapour on distant exoplanet',
    'Ancient forest discovered beneath Antarctic ice sheet',
    'Exoplanet water vapour detection confirmed by second telescope',
  ],
  culture: [
    'Major retrospective of Hilma af Klint opens in Paris',
    'Booker Prize shortlist announced with three debut novels',
    'City museum returns looted bronzes to Benin',
    'Hilma af Klint retrospective draws record crowds in Paris',
  ],
  film: [
    'Festival jury awards top prize to quiet family drama',
    'Streaming service renews sci-fi series for final season',
  ],
  music: [
    'Jazz pianist announces surprise album and world tour',
    'Legendary venue saved from closure by fan campaign',
    'Fan campaign saves legendary music venue from closure',
  ],
  sports: [
    'Underdogs clinch league title on final day of season',
    'Marathon world record falls in Berlin',
    'Berlin marathon sees new world record',
  ],
  events: [
    'Open-air cinema: classic noir double bill',
    'Late opening at the modern art museum',
    'Neighbourhood book fair',
    'Jazz in the park',
    'Farmers market & street food night',
  ],
};

const IMAGES = ['https://picsum.photos/seed/', '/640/360'];

function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 2 ** 32);
}

export function demoItems(source) {
  const rand = seeded(source.id);
  const home = new URL(source.url).origin;
  const stories = STORIES[source.sector] || STORIES.world;
  const now = Date.now();

  if (source.type === 'ical' || source.sector === 'events') {
    return {
      kind: 'ical',
      title: source.name,
      items: stories.map((title, i) => {
        const start = new Date(now + (i * 2 + 1) * 86400e3 + Math.floor(rand() * 8) * 3600e3);
        start.setMinutes(0, 0, 0);
        return {
          title, link: home, guid: `${source.id}-${i}`,
          summary: 'Sample event from the demo calendar.',
          image: null, published: null,
          start: start.toISOString(), end: new Date(+start + 2 * 3600e3).toISOString(),
          allDay: false, location: ['Riverside Park', 'Main Library', 'Old Town Square'][i % 3], recurring: false,
        };
      }),
    };
  }

  const items = stories.filter(() => rand() > 0.25).map((title, i) => ({
    title,
    link: home,
    guid: `${source.id}-${i}`,
    summary: `Demo story from ${source.name}. In the real app this is the teaser text from the publisher's feed — tap through to read the full article on their site.`,
    image: rand() > 0.4 ? `${IMAGES[0]}${encodeURIComponent(title.slice(0, 20))}${IMAGES[1]}` : null,
    published: new Date(now - Math.floor(rand() * 30) * 3600e3 - i * 600e3).toISOString(),
    author: '',
  }));
  return { kind: 'feed', title: source.name, items };
}
