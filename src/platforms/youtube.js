/**
 * platforms/youtube.js — YouTube Adapter
 */

import { domClickBlockStrategy } from '../core/blocker.js';

export const YoutubePlatform = {
  name: 'YouTube',
  hostnames: ['youtube.com', 'youtu.be'],

  selectors: {
    commentContainer: 'ytd-comment-thread-renderer, ytd-comment-renderer',
    commentText:      '#content-text',
    username:         '#author-text',
    replyContainer:   'ytd-comment-replies-renderer',
  },

  blockStrategy: domClickBlockStrategy({
    moreButtonSel:    '#action-menu > yt-icon-button',
    blockMenuItemSel: 'ytd-menu-service-item-renderer:last-child',
  }),
};
