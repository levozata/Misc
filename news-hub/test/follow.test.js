import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUrl, platformOf } from '../public/follow.js';

test('handles become public RSS feed URLs', () => {
  assert.deepEqual(followUrl('bluesky', '@npr.org'), { url: 'https://bsky.app/profile/npr.org/rss', name: '@npr.org' });
  assert.deepEqual(followUrl('mastodon', '@Gargron@mastodon.social'), { url: 'https://mastodon.social/@Gargron.rss', name: '@Gargron@mastodon.social' });
  assert.equal(followUrl('reddit', 'r/books').url, 'https://www.reddit.com/r/books/.rss');
  assert.equal(followUrl('reddit', 'books').url, 'https://www.reddit.com/r/books/.rss');
  assert.equal(followUrl('reddit', 'u/spez').url, 'https://www.reddit.com/user/spez/.rss');
  assert.equal(followUrl('youtube', 'UCabcdefghijklmnopqrstuv').url,
    'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv');
  assert.equal(followUrl('bluesky', 'https://example.com/feed').url, 'https://example.com/feed');
});

test('malformed handles are rejected', () => {
  assert.equal(followUrl('bluesky', 'not a handle'), null);
  assert.equal(followUrl('mastodon', '@onlyuser'), null);
  assert.equal(followUrl('youtube', '@somechannel'), null);
  assert.equal(followUrl('reddit', 'r/<script>'), null);
});

test('platform is detected from post links', () => {
  assert.equal(platformOf('https://bsky.app/profile/x/post/1').name, 'Bluesky');
  assert.equal(platformOf('https://www.reddit.com/r/books/comments/1').name, 'Reddit');
  assert.equal(platformOf('https://mastodon.social/@Mastodon/1').name, 'Mastodon');
  assert.equal(platformOf('https://www.youtube.com/watch?v=1').name, 'YouTube');
  assert.equal(platformOf('nonsense').name, 'Social');
});
