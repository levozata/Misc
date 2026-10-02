# Mosaic — personalised news hub

A website + installable phone app that **doesn't write news**: it collects
headlines from news outlets, culture sites and event calendars that each user
picks, and colour-codes everything by **sector** (World, Tech, Culture, Events…)
and by **topic** (user-defined keyword tags like #Climate or #Elections).

## Try it

```bash
cd news-hub
npm run demo   # sample headlines, no internet needed → http://localhost:8080
npm start      # live feeds from the real sources
npm test
```

Node 20+ is the only requirement. There are no npm dependencies.

On a phone, open the site and use **Add to Home Screen**. It installs as an
app (a PWA) with its own icon, opens full screen, and still opens offline,
showing the last stories it loaded.

## What it does

| View | What you see |
| --- | --- |
| **Feed** | Every article from your sources, newest first. Each card has its sector's colour bar plus coloured topic tags. Stories you've read are dimmed. |
| **Top stories** | Stories that several of your outlets are covering, grouped together, so you can compare how different sources report the same thing. |
| **Events** | Upcoming events from iCal calendars, grouped by day. |
| **Social** | A wall of posts from the accounts you follow on Bluesky, Mastodon, Reddit and YouTube. The front page also has a "Social pulse" box. |
| **Saved** | Anything you starred, kept even after it drops out of the feeds. |

**Filters:** the sector chips (pick several), the topic chips, and the search box.

**Settings (⚙):**
- tick or untick outlets in each sector
- recolour any sector
- add your own source: any RSS/Atom feed or `.ics` calendar (a local theatre,
  museum, club, Meetup group, university…), filed under whichever sector you choose
- create topics: a name, a colour and some keywords
- **follow social accounts** by handle: `@npr.org` (Bluesky),
  `@user@mastodon.social` (Mastodon), `r/books` or `u/name` (Reddit), or a
  YouTube channel id `UC…`. The app turns each handle into that account's
  public RSS feed. X, Instagram, TikTok and Facebook don't publish public
  feeds, so they can't be followed this way.

## Design

The front page is laid out like a **printed broadsheet** and fills the whole
browser width:

- **Masthead:** one compact row: the date and issue number on the left, the
  nameplate in the middle, and your source count and last update on the
  right, above a colour strip.
- **Above the fold:** the lead story (the one most of your outlets are
  covering) with a drop cap and "also reported by". Two follow-up stories sit
  beneath it, and beside it are a column of secondary stories and a rail with
  an **In brief** box and **What's on** listings.
- **Sections:** each sector gets a coloured section band. The sections are
  packed into an asymmetric 12-column grid: big and small sections alternate,
  and every row is filled edge to edge. Inside a section, stories flow in
  newspaper text columns with column rules between them. On tablets the grid
  drops to 6 columns, and on phones to a single column.
- **No empty space:** a printed grid row is as tall as its tallest column,
  which leaves blank space under the shorter ones. After layout, each column's
  leftover space is filled with extra headlines from that section, then
  social posts, until nothing more fits. The fill is redone when images or
  fonts finish loading or the window is resized.
- **Coverage, Listings, Social and Clippings** use flowing multi-column layouts.
  Listings look like a newspaper's events page.

**Colours** come from Cambly's brand palette: Sunglow `#FFC929` for the
primary buttons and highlights, Persimmon `#FE614E`, Cornflower `#4D95EA` and
Banana Mania `#FBE8A3` (the In brief box). Navy, teal, grape, berry, leaf and
tangerine fill out the nine sector colours. All of this sits on warm newsprint
(`#FFFBF0`) with near-black ink, and there is a dark "night edition" too.
Text on a coloured band switches automatically between ink and white, so it
stays readable whatever colour a user picks.

**Type:** Playfair Display (headlines), Source Serif 4 (body text) and DM Sans
(labels and buttons), loaded from Google Fonts with system fallbacks.

## How it's built

```
news-hub/
├── server/
│   ├── server.js    HTTP server: static files + JSON API
│   ├── catalog.js   built-in sectors (with colours) and sources
│   ├── feeds.js     fetching, 10-min cache, size/time limits, normalising
│   ├── parse.js     RSS 2.0 / RSS 1.0 / Atom / iCal parsers (dependency-free)
│   ├── cluster.js   groups headlines about the same story
│   ├── safe-url.js  blocks user URLs that point at internal networks (SSRF)
│   └── demo.js      sample content for `npm run demo`
├── public/          the app: index.html, app.js, styles.css, service worker, manifest
└── test/            node:test suites + fixture feeds
```

- **Why there's a server.** Browsers can't read most publishers' feeds
  directly (CORS), so a small server fetches them, caches each one for 10
  minutes and returns a single normalised list.
- **API.** `GET /api/catalog` returns the sectors, the sources and the default
  selection. `POST /api/feed {ids, custom}` returns `{items, clusters, errors}`.
- **No accounts (yet).** Each user's choices are stored in their own browser
  (localStorage), so the server keeps nothing about them.
- **Story clustering.** Headlines from *different* sources published in the
  last 48 hours are compared by their significant words. Two headlines join a
  cluster when they share at least two of those words and their overlap
  (Jaccard similarity) is at least 0.25.

### Deploying (Vercel)

The repo is ready for Vercel with no build step. `vercel.json` serves
`public/` as the static site, and `api/catalog.js` and `api/feed.js` run as
serverless functions. They share their handlers with the local server
through `server/api.js`. Set the project's root directory to `news-hub`.
Live at <https://mosaic-news-kappa.vercel.app>.

### Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port the server listens on |
| `DEMO` | unset | `1` serves sample data instead of fetching |
| `ALLOW_PRIVATE_URLS` | unset | `1` lets custom sources point at localhost/LAN (development only) |

### Adding sources to the built-in catalog

Edit `server/catalog.js`. Add the sector if it's new, then add the source:
`{ id, sector, name, url }`, plus `type: 'ical'` for calendars. The URLs in
the catalog are well-known public feeds but were not all checked live. If one
breaks, the app lists it as "couldn't be loaded" and keeps showing the rest.

## Legal and ethics notes

- The app only shows the **headline, teaser, thumbnail and a link back** to
  the publisher, which is what RSS feeds are offered for. It never copies full
  articles.
- Read the terms of any feed you add to the public catalog. Some publishers
  restrict commercial use.
- The server identifies itself with a descriptive User-Agent, and its cache
  stops it from re-requesting a publisher's feed more than once every 10
  minutes.

## Roadmap ideas

1. **Accounts and sync** so a user's sources follow them across devices
   (e.g. Supabase auth + a `preferences` table). Today everything stays in one browser.
2. **Source discovery:** paste any website URL and find its feed automatically
   (`<link rel="alternate" type="application/rss+xml">`).
3. **Recurring events:** expand `RRULE`s in calendars. Today only the first
   occurrence shows.
4. **Location-aware events:** a city picker that suggests local venue calendars.
5. **Smarter clustering and topics:** text embeddings instead of word overlap,
   and topics suggested automatically.
6. **Native app stores:** wrap the PWA with Capacitor to publish on iOS and
   Android, and add push notifications for breaking stories in chosen topics.
7. **Background fetching:** a scheduled job that refreshes popular feeds, so
   requests are answered straight from the cache.
