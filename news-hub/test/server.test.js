import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fetchSource } from '../server/feeds.js';
import { isPrivateAddress, assertPublicUrl } from '../server/safe-url.js';

const rss = readFileSync(new URL('./fixtures/rss.xml', import.meta.url), 'utf8');
const ics = readFileSync(new URL('./fixtures/events.ics', import.meta.url), 'utf8');

// A local "publisher" serving fixture feeds.
let publisher;
let base;
before(async () => {
  publisher = createServer((req, res) => {
    if (req.url === '/rss') return res.end(rss);
    if (req.url === '/cal.ics') return res.end(ics);
    if (req.url === '/redirect') { res.writeHead(302, { location: '/rss' }); return res.end(); }
    res.writeHead(404).end();
  }).listen(0);
  await new Promise((r) => publisher.once('listening', r));
  base = `http://127.0.0.1:${publisher.address().port}`;
});
after(() => publisher.close());

test('private address detection', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111', '172.32.0.1']) {
    assert.ok(!isPrivateAddress(ip), ip);
  }
});

test('user URLs pointing at internal hosts are rejected', async () => {
  await assert.rejects(assertPublicUrl('http://127.0.0.1/'), /private/);
  await assert.rejects(assertPublicUrl('http://[::1]:8080/'), /private/);
  await assert.rejects(assertPublicUrl('file:///etc/passwd'), /http/);
  await assert.rejects(fetchSource({ id: 'x', url: `${base}/rss`, sector: 'world' }), /private/);
});

test('fetchSource normalises a feed (following redirects)', async () => {
  const items = await fetchSource({ id: 'ex', name: 'Example', url: `${base}/redirect`, sector: 'world' }, { allowPrivate: true });
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'article');
  assert.equal(items[0].sourceId, 'ex');
  assert.equal(items[0].sector, 'world');
  assert.match(items[0].id, /^[\w-]{12}$/);
});

test('fetchSource returns calendar events as kind=event', async () => {
  // The fixture dates are fixed; only check normalisation, not the date window.
  const items = await fetchSource({ id: 'cal', url: `${base}/cal.ics`, sector: 'events' }, { allowPrivate: true });
  for (const e of items) {
    assert.equal(e.kind, 'event');
    assert.equal(e.sourceName, 'City Jazz Club');
  }
});

test('API: catalog and demo feed', async () => {
  process.env.DEMO = '1';
  const { server } = await import(`../server/server.js?demo`);
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const api = `http://127.0.0.1:${server.address().port}`;
  try {
    const catalog = await (await fetch(`${api}/api/catalog`)).json();
    assert.ok(catalog.sectors.length >= 5);
    assert.ok(catalog.defaults.every((id) => catalog.sources.some((s) => s.id === id)));

    const res = await fetch(`${api}/api/feed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['bbc-sport', 'espn', 'holidays-us', 'bsky-npr', 'nope'], custom: [{ id: 1 }] }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.demo, true);
    assert.ok(body.items.some((i) => i.kind === 'article'));
    assert.ok(body.items.some((i) => i.kind === 'event'));
    assert.ok(body.items.some((i) => i.kind === 'social' && i.sector === 'social'));
    assert.ok(body.clusters.every((c) => c.itemIds.every((id) => body.items.find((i) => i.id === id).kind === 'article')));
    assert.deepEqual(body.errors, []);

    assert.equal((await fetch(`${api}/../server/server.js`)).status, 404);
    assert.equal((await fetch(`${api}/api/feed`, { method: 'POST', body: '{nope' })).status, 400);
    assert.match(await (await fetch(`${api}/`)).text(), /Mosaic/);
  } finally {
    server.close();
    delete process.env.DEMO;
  }
});
