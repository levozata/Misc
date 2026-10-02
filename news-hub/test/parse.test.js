import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAny, decodeEntities, stripHtml } from '../server/parse.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('RSS 2.0: titles, links, teasers, images, dates', () => {
  const feed = parseAny(fixture('rss.xml'));
  assert.equal(feed.kind, 'feed');
  assert.equal(feed.title, 'Example World News');
  assert.equal(feed.items.length, 2, 'item without a link is dropped');

  const [a, b] = feed.items;
  assert.equal(a.title, 'Floods force thousands from homes & farms');
  assert.equal(a.link, 'https://news.example.com/floods');
  assert.equal(a.summary, 'Rivers burst their banks & roads closed.');
  // The 240px thumbnail loses to the body's inline image (no stated size, usually full-size).
  assert.equal(a.image, 'https://img.example.com/a.jpg');
  assert.equal(a.published, '2026-10-01T08:30:00.000Z');
  assert.equal(a.author, 'Jane Reporter');

  assert.equal(b.title, 'Café owners’ protest');
  assert.equal(b.summary, 'Owners protest new rules.');
  assert.equal(b.image, 'https://img.example.com/cafe.png');
  assert.equal(b.published, '2026-09-30T16:00:00.000Z');
});

test('Atom: alternate link, summary preferred over content, image from content', () => {
  const feed = parseAny(fixture('atom.xml'));
  assert.equal(feed.title, 'Example Tech');
  const [e] = feed.items;
  assert.equal(e.link, 'https://tech.example.com/browser');
  assert.equal(e.summary, 'A milestone for the web.');
  assert.equal(e.image, 'https://img.example.com/engine.webp');
  assert.equal(e.published, '2026-10-01T12:00:00.000Z');
  assert.equal(e.author, 'Sam Writer');
});

test('iCal: unfolding, escapes, floating and all-day dates', () => {
  const cal = parseAny(fixture('events.ics'));
  assert.equal(cal.kind, 'ical');
  assert.equal(cal.title, 'City Jazz Club');
  assert.equal(cal.items.length, 3);

  const [jam, open, workshop] = cal.items;
  assert.equal(jam.title, 'Late-night jam session, all welcome');
  assert.equal(jam.location, 'Main Hall, 12 Rue Exemple');
  assert.equal(jam.start, '2026-10-10T20:30:00');
  assert.equal(jam.end, '2026-10-10T23:00:00');
  assert.equal(jam.allDay, false);
  assert.equal(jam.link, 'https://jazz.example.com/events/1');
  assert.equal(jam.summary, 'Bring your instrument. House band from 9pm.');

  assert.equal(open.start, '2026-10-12');
  assert.equal(open.allDay, true);
  assert.equal(open.summary, 'A very long description that is folded across two lines in the file.');

  assert.equal(workshop.start, '2026-10-15T18:00:00Z');
  assert.equal(workshop.recurring, true);
});

test('entity decoding and HTML stripping', () => {
  assert.equal(decodeEntities('&lt;b&gt; &#233; &#x1F600; &bogus;'), '<b> é 😀 &bogus;');
  assert.equal(stripHtml('<p>Hi<script>evil()</script> <i>there</i></p>'), 'Hi there');
  const long = stripHtml('word '.repeat(100), 30);
  assert.ok(long.length <= 30 && long.endsWith('…'));
});

test('social posts without a <title> use the post text as the headline', () => {
  const feed = parseAny(fixture('bluesky.xml'));
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].title, 'Our reporters are live at the summit & posting updates all day.');
  assert.equal(feed.items[0].link, 'https://bsky.app/profile/example.com/post/3abc');
  assert.equal(feed.items[0].published, '2026-10-01T09:15:00.000Z');
});

test('javascript: links are not accepted', () => {
  const feed = parseAny('<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>');
  assert.equal(feed.items.length, 0);
});
