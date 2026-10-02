// The built-in source catalog. Users pick from these and can add their own
// RSS / Atom / iCal URLs on top. Each sector has a default colour that the
// user can override in the app. Defaults are built around the Cambly palette
// (Sunglow #FFC929, Persimmon #FE614E, Cornflower #4D95EA) plus companions.

export const SECTORS = [
  { id: 'world',    name: 'World News',     color: '#4D95EA' },
  { id: 'business', name: 'Business',       color: '#23395B' },
  { id: 'tech',     name: 'Technology',     color: '#8E6BD8' },
  { id: 'science',  name: 'Science',        color: '#1FA39B' },
  { id: 'culture',  name: 'Culture & Arts', color: '#FE614E' },
  { id: 'film',     name: 'Film & TV',      color: '#D6457A' },
  { id: 'music',    name: 'Music',          color: '#FFC929' },
  { id: 'sports',   name: 'Sports',         color: '#3FA34D' },
  { id: 'events',   name: 'Events',         color: '#FF9A3C' },
  { id: 'social',   name: 'Social',         color: '#FF8FAB' },
];

// type: 'feed' covers RSS 2.0, RSS 1.0 (RDF) and Atom; 'ical' is an .ics calendar.
export const SOURCES = [
  { id: 'bbc-world',      sector: 'world',    name: 'BBC World',           url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'guardian-world', sector: 'world',    name: 'The Guardian — World', url: 'https://www.theguardian.com/world/rss' },
  { id: 'aljazeera',      sector: 'world',    name: 'Al Jazeera',          url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'npr',            sector: 'world',    name: 'NPR News',            url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'france24',       sector: 'world',    name: 'France 24',           url: 'https://www.france24.com/en/rss' },
  { id: 'dw',             sector: 'world',    name: 'DW',                  url: 'https://rss.dw.com/rdf/rss-en-all' },

  { id: 'bbc-business',      sector: 'business', name: 'BBC Business',           url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'guardian-business', sector: 'business', name: 'The Guardian — Business', url: 'https://www.theguardian.com/uk/business/rss' },
  { id: 'cnbc',              sector: 'business', name: 'CNBC',                   url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },

  { id: 'verge',      sector: 'tech', name: 'The Verge',    url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'ars',        sector: 'tech', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { id: 'hackernews', sector: 'tech', name: 'Hacker News',  url: 'https://hnrss.org/frontpage' },
  { id: 'wired',      sector: 'tech', name: 'Wired',        url: 'https://www.wired.com/feed/rss' },

  { id: 'nature',       sector: 'science', name: 'Nature',       url: 'https://www.nature.com/nature.rss' },
  { id: 'sciencedaily', sector: 'science', name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml' },
  { id: 'nasa',         sector: 'science', name: 'NASA',         url: 'https://www.nasa.gov/news-release/feed/' },

  { id: 'guardian-culture', sector: 'culture', name: 'The Guardian — Culture', url: 'https://www.theguardian.com/culture/rss' },
  { id: 'hyperallergic',    sector: 'culture', name: 'Hyperallergic',          url: 'https://hyperallergic.com/feed/' },
  { id: 'lithub',           sector: 'culture', name: 'Literary Hub',           url: 'https://lithub.com/feed/' },
  { id: 'openculture',      sector: 'culture', name: 'Open Culture',           url: 'https://www.openculture.com/feed' },

  { id: 'indiewire', sector: 'film', name: 'IndieWire', url: 'https://www.indiewire.com/feed/' },
  { id: 'variety',   sector: 'film', name: 'Variety',   url: 'https://variety.com/feed/' },

  { id: 'pitchfork', sector: 'music', name: 'Pitchfork', url: 'https://pitchfork.com/feed/feed-news/rss' },
  { id: 'stereogum', sector: 'music', name: 'Stereogum', url: 'https://www.stereogum.com/feed/' },

  { id: 'bbc-sport', sector: 'sports', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  { id: 'espn',      sector: 'sports', name: 'ESPN',      url: 'https://www.espn.com/espn/rss/news' },

  { id: 'holidays-us', sector: 'events', name: 'US Holidays (Google Calendar)', type: 'ical',
    url: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics' },

  // Social media follow-ups: networks that publish public RSS feeds.
  { id: 'bsky-guardian',    sector: 'social', name: 'The Guardian on Bluesky', url: 'https://bsky.app/profile/theguardian.com/rss' },
  { id: 'bsky-npr',         sector: 'social', name: 'NPR on Bluesky',          url: 'https://bsky.app/profile/npr.org/rss' },
  { id: 'bsky-nasa',        sector: 'social', name: 'NASA on Bluesky',         url: 'https://bsky.app/profile/nasa.gov/rss' },
  { id: 'mastodon-official', sector: 'social', name: 'Mastodon (official)',    url: 'https://mastodon.social/@Mastodon.rss' },
  { id: 'reddit-worldnews', sector: 'social', name: 'r/worldnews',             url: 'https://www.reddit.com/r/worldnews/.rss' },
  { id: 'reddit-books',     sector: 'social', name: 'r/books',                 url: 'https://www.reddit.com/r/books/.rss' },
  { id: 'reddit-art',       sector: 'social', name: 'r/Art',                   url: 'https://www.reddit.com/r/Art/.rss' },
].map((s) => ({ type: 'feed', ...s }));

// What a first-time visitor sees before they customise anything.
export const DEFAULT_SELECTION = [
  'bbc-world', 'guardian-world', 'npr', 'bbc-business', 'cnbc', 'verge', 'ars',
  'nature', 'sciencedaily', 'guardian-culture', 'hyperallergic', 'variety',
  'pitchfork', 'stereogum', 'bbc-sport', 'espn', 'holidays-us',
  'bsky-guardian', 'bsky-npr', 'reddit-worldnews', 'reddit-books',
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
