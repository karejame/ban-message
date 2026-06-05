/**
 * platforms/weibo.js — 微博 Adapter
 */

import { t } from '../core/i18n.js';

export const WeiboPlatform = {
  name: '微博 Weibo',
  hostnames: ['weibo.com', 'weibo.cn'],

  selectors: {
    // Each comment card in the comment list
    commentContainer: '.Feed_retweet, .comment-item, [class*="CommentItem"]',
    // Text content of the comment
    commentText:      '[class*="comment-text"], [class*="CommentContent"], .txt',
    // Username link
    username:         'a[usercard], [class*="nick"], .name a',
    replyContainer:   '[class*="reply"], [class*="Reply"]',
  },

  getCurrentUser() {
    const userLink = document.querySelector('.WB_global_nav .gn_name a, .name a[href*="/u/"]');
    return userLink?.textContent || null;
  },

  blockStrategy(username, sourceElement) {
    // 微博: Three-tier fallback strategy
    // 1. Try API block (requires SUB token)
    // 2. Try DOM simulation
    // 3. Fallback to notification

    // Try API first
    const subToken = this._extractSubToken();
    if (subToken) {
      this._apiBlock(username, subToken)
        .then(success => {
          if (success) return;
          this._domBlock(username, sourceElement);
        })
        .catch(() => this._domBlock(username, sourceElement));
    } else {
      this._domBlock(username, sourceElement);
    }
  },

  _extractSubToken() {
    // Try to extract SUB token from cookie
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'SUB') {
        return value;
      }
    }
    return null;
  },

  async _apiBlock(username, subToken) {
    try {
      // 微博拉黑 API
      const response = await fetch('/aj/f/blacknew/add?ajwvr=6', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': `SUB=${subToken}`,
        },
        body: `uid=${encodeURIComponent(username)}&filter_type=1`,
      });
      const data = await response.json();
      return data.code === '100000';
    } catch (e) {
      return false;
    }
  },

  _domBlock(username, sourceElement) {
    // DOM simulation: hover menu on username → 拉黑
    const userEl = sourceElement?.querySelector('a[usercard], .name a');
    if (!userEl) {
      GM_notification({
        title: '🛡️ CyberShield — 微博',
        text:  t('weiboManual', { user: username }),
      });
      return;
    }

    // Dispatch hover event to open the user card
    userEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    setTimeout(() => {
      // Look for the block button in the popup card
      const blockBtn = document.querySelector('[class*="block"], [data-action="block"], [title="拉黑"]');
      if (blockBtn) {
        blockBtn.click();
      } else {
        GM_notification({
          title: '🛡️ CyberShield — 微博',
          text:  t('weiboManual', { user: username }),
        });
      }
    }, 600);
  },
};
