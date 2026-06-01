/**
 * platforms/generic.js — Generic Fallback Adapter
 *
 * Used on any site that doesn't have a dedicated adapter.
 * Scans common comment patterns: p tags, divs with "comment" in class/id.
 */

export const GenericPlatform = {
  name: 'Generic',
  hostnames: [],

  selectors: {
    // Broad selector catching most comment systems
    commentContainer: [
      '[class*="comment"]',
      '[class*="Comment"]',
      '[id*="comment"]',
      '[data-type="comment"]',
      'article',
    ].join(', '),

    commentText: 'p, [class*="content"], [class*="body"], [class*="text"]',
    username:    '[class*="author"], [class*="user"], [class*="name"], [rel="author"]',
    replyContainer: '[class*="reply"], [class*="Reply"]',
  },

  blockStrategy: null, // No generic block action — platform-specific only
};
