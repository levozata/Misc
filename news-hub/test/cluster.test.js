import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterItems, tokens } from '../server/cluster.js';

const now = new Date().toISOString();
const item = (id, sourceId, title) => ({ id, sourceId, title, published: now });

test('tokens drop stopwords, numbers and plural s', () => {
  assert.deepEqual([...tokens("The Marathon world record falls in Berlin's 2026 race")],
    ['marathon', 'world', 'record', 'fall', 'berlin', 'race']);
});

test('same story from different outlets clusters; unrelated and same-source stories do not', () => {
  const clusters = clusterItems([
    item('a', 'bbc', 'Marathon world record falls in Berlin'),
    item('b', 'espn', 'Berlin marathon sees new world record'),
    item('c', 'bbc', 'Berlin marathon world record: how it happened'),
    item('d', 'espn', 'Underdogs clinch league title on final day'),
    item('e', 'espn', 'Underdogs clinch league title, fans celebrate'),
  ]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].itemIds.sort(), ['a', 'b', 'c']);
  assert.deepEqual(clusters[0].sources.sort(), ['bbc', 'espn']);
  assert.ok(clusters[0].label.includes('marathon'));
});

test('events and old articles are ignored', () => {
  const old = new Date(Date.now() - 5 * 86400e3).toISOString();
  const clusters = clusterItems([
    { ...item('a', 'x', 'Jazz festival opens downtown'), start: now },
    { ...item('b', 'y', 'Jazz festival opens downtown') , start: now },
    { ...item('c', 'x', 'Jazz festival opens downtown'), published: old },
    { ...item('d', 'y', 'Jazz festival opens downtown'), published: old },
  ]);
  assert.equal(clusters.length, 0);
});
