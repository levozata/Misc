import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalogFn from '../api/catalog.js';
import feedFn from '../api/feed.js';

function mockRes() {
  return {
    status: 0, body: '',
    writeHead(status) { this.status = status; },
    end(body) { this.body = body; },
    json() { return JSON.parse(this.body); },
  };
}

test('Vercel /api/catalog function', async () => {
  const res = mockRes();
  await catalogFn({ method: 'GET' }, res);
  assert.equal(res.status, 200);
  assert.ok(res.json().sources.length > 20);
});

test('Vercel /api/feed function accepts a pre-parsed body and checks the method', async () => {
  const res = mockRes();
  await feedFn({ method: 'POST', body: { ids: [], custom: [] } }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json().items, []);

  const bad = mockRes();
  await feedFn({ method: 'GET' }, bad);
  assert.equal(bad.status, 405);
});
