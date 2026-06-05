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

  getCurrentUser() {
    const avatar = document.querySelector('ytd-topbar-menu-button-renderer #avatar-btn');
    return avatar?.getAttribute('aria-label') || null;
  },

  blockStrategy(username, sourceElement) {
    // YouTube: Three-tier fallback strategy
    // 1. Try DOM simulation (click menu → block)
    // 2. Fallback to notification

    const moreBtn = sourceElement?.querySelector('#menu #button, #top-level-buttons-computed #button');
    if (!moreBtn) {
      GM_notification({
        title: '🛡️ CyberShield — YouTube',
        text:  `请手动拉黑用户 @${username}`,
      });
      return;
    }

    // Click the more options button
    moreBtn.click();

    // Wait for menu to appear, then click block
    setTimeout(() => {
      const blockBtn = document.querySelector('tp-yt-paper-list-item:has-text("Block user"), tp-yt-paper-list-item:has-text("屏蔽用户")');
      if (blockBtn) {
        blockBtn.click();
      } else {
        GM_notification({
          title: '🛡️ CyberShield — YouTube',
          text:  `请手动拉黑用户 @${username}`,
        });
      }
    }, 300);
  },
};
