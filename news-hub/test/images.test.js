import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeImageUrl, extractShareImage } from '../server/images.js';
import { parseAny } from '../server/parse.js';

test('thumbnail URLs are upgraded to larger renditions', () => {
  assert.equal(upgradeImageUrl('https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/abc/live/x.jpg'),
    'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/abc/live/x.jpg');
  assert.equal(upgradeImageUrl('https://ichef.bbci.co.uk/news/240/cpsprodpb/x.jpg'),
    'https://ichef.bbci.co.uk/news/976/cpsprodpb/x.jpg');
  assert.equal(upgradeImageUrl('https://hyperallergic.com/wp-content/uploads/2026/10/photo-300x200.jpg'),
    'https://hyperallergic.com/wp-content/uploads/2026/10/photo.jpg');
  assert.equal(upgradeImageUrl('https://variety.com/wp-content/uploads/a.jpg?w=300&h=200&crop=1'),
    'https://variety.com/wp-content/uploads/a.jpg?w=1200&h=800&crop=1');
  assert.equal(upgradeImageUrl('https://i0.wp.com/x.com/a.jpg?resize=320,180'),
    'https://i0.wp.com/x.com/a.jpg?resize=1200%2C675');
});

test('signed, already-large and unknown URLs are left alone', () => {
  const guardian = 'https://i.guim.co.uk/img/media/abc/0_0_100_100/master/100.jpg?width=140&quality=85&s=deadbeef';
  assert.equal(upgradeImageUrl(guardian), guardian);
  assert.equal(upgradeImageUrl('https://cdn.example.com/a.jpg?w=1600'), 'https://cdn.example.com/a.jpg?w=1600');
  assert.equal(upgradeImageUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(upgradeImageUrl('not a url'), 'not a url');
});

test('share image is read from og/twitter meta tags in either attribute order', () => {
  assert.deepEqual(extractShareImage(
    '<head><meta property="og:image" content="https://img.example.com/big.jpg"><meta property="og:image:width" content="1200"></head>',
    'https://example.com/story'), { image: 'https://img.example.com/big.jpg', width: 1200 });
  assert.deepEqual(extractShareImage(
    '<meta content="/images/a.jpg?x=1&amp;y=2" name="twitter:image">', 'https://example.com/news/story'),
  { image: 'https://example.com/images/a.jpg?x=1&y=2', width: null });
  assert.equal(extractShareImage('<head><title>No image</title></head>', 'https://example.com/'), null);
  assert.equal(extractShareImage('<meta property="og:image" content="javascript:alert(1)">', 'https://example.com/'), null);
});

test('feeds: the widest offered image wins and its width is recorded', () => {
  const feed = parseAny(`<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item>
    <title>Story</title><link>https://example.com/s</link>
    <media:thumbnail url="https://img.example.com/thumb.jpg" width="240"/>
    <media:content url="https://img.example.com/small.jpg" medium="image" width="140"/>
    <media:content url="https://img.example.com/large.jpg" medium="image" width="1024"/>
    <description>&lt;img src="https://track.example.com/p.gif" width="1"&gt;</description>
  </item></channel></rss>`);
  assert.equal(feed.items[0].image, 'https://img.example.com/large.jpg');
  assert.equal(feed.items[0].imageWidth, 1024);
});
