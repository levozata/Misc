// Social media helpers shared by the app (and unit-tested in Node).

export const PLATFORMS = {
  bluesky: { name: 'Bluesky', color: '#0085FF' },
  mastodon: { name: 'Mastodon', color: '#6364FF' },
  reddit: { name: 'Reddit', color: '#FF4500' },
  youtube: { name: 'YouTube', color: '#FF0000' },
  web: { name: 'Social', color: '#FF8FAB' },
};

export function platformOf(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('bsky.app')) return PLATFORMS.bluesky;
    if (u.hostname.endsWith('reddit.com')) return PLATFORMS.reddit;
    if (u.hostname.endsWith('youtube.com') || u.hostname === 'youtu.be') return PLATFORMS.youtube;
    if (u.pathname.startsWith('/@')) return PLATFORMS.mastodon;
  } catch { /* not a URL */ }
  return PLATFORMS.web;
}

// Turns "@npr.org", "@user@mastodon.social", "r/books" or a YouTube channel
// id into that account's public RSS feed. Returns null if it doesn't parse.
export function followUrl(platform, raw) {
  const h = raw.trim();
  if (/^https?:\/\//i.test(h)) return { url: h, name: h.replace(/^https?:\/\//, '') };
  let m;
  switch (platform) {
    case 'bluesky':
      m = h.match(/^@?([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i);
      return m && { url: `https://bsky.app/profile/${m[1]}/rss`, name: `@${m[1]}` };
    case 'mastodon':
      m = h.match(/^@?([\w.]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i);
      return m && { url: `https://${m[2]}/@${m[1]}.rss`, name: `@${m[1]}@${m[2]}` };
    case 'reddit':
      if ((m = h.match(/^\/?u(?:ser)?\/([\w-]+)$/i))) return { url: `https://www.reddit.com/user/${m[1]}/.rss`, name: `u/${m[1]}` };
      m = h.match(/^(?:\/?r\/)?(\w+)$/i);
      return m && { url: `https://www.reddit.com/r/${m[1]}/.rss`, name: `r/${m[1]}` };
    case 'youtube':
      m = h.match(/^(UC[\w-]{22})$/);
      return m && { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`, name: `YouTube ${m[1].slice(0, 8)}…` };
    default:
      return null;
  }
}
