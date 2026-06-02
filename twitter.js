/**
 * platforms/twitter.js — Twitter / X Adapter
 */

import { domClickBlockStrategy } from './blocker.js';

export const TwitterPlatform = {
  name: 'Twitter/X',
  hostnames: ['twitter.com', 'x.com'],

  selectors: {
    // Each tweet/reply in a thread
    commentContainer: 'article[data-testid="tweet"]',
    // The text body of a tweet
    commentText:      '[data-testid="tweetText"]',
    // Display name + @handle wrapper
    username:         '[data-testid="User-Name"] a[href^="/"]',
    // Tweets that are replies (they appear inside a thread context)
    replyContainer:   '[data-testid="reply"]',
  },

  getCurrentUser() {
    const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img');
    const alt = el?.alt?.trim();
    if (!alt) return null;
    const handle = alt.match(/@([a-zA-Z0-9_]+)/);
    return handle ? handle[1] : alt;
  },

  blockStrategy: domClickBlockStrategy({
    // The "..." more options button on each tweet
    moreButtonSel:   '[data-testid="caret"]',
    // The "Block @user" menu item
    blockMenuItemSel: '[data-testid="block"]',
  }),
};
