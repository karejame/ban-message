/**
 * platforms/reddit.js — Reddit Adapter
 *
 * Supports both new Reddit (shreddit web components) and old Reddit.
 */

export const RedditPlatform = {
  name: 'Reddit',
  hostnames: ['reddit.com'],

  selectors: {
    // New Reddit uses custom web components
    commentContainer: 'shreddit-comment, .Comment',
    commentText:      '[id^="comment-rtjson-content"], .RichTextJSON-root, p',
    username:         'a[href^="/user/"]',
    replyContainer:   '[data-type="comment"][style*="padding-left"]',
  },

  blockStrategy(username, sourceElement) {
    // Reddit: find the user link, right-click menu isn't reliable.
    // Strategy: navigate to the block URL via the user profile.
    // Users must confirm — we can't silently block on Reddit without the API.
    const userLink = sourceElement?.querySelector('a[href^="/user/"]');
    if (!userLink) return;

    const profileUrl = userLink.href;
    // Open profile in background tab; user can block from there
    // A more aggressive approach: use Reddit's blocking endpoint (requires auth token extraction)
    // For MVP, we notify the user to block manually.
    GM_notification({
      text:    `Open ${username}'s profile to block them?`,
      title:   '🛡️ CyberShield',
      onclick: () => window.open(profileUrl, '_blank'),
    });
  },
};
