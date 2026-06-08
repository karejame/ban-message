/**
 * platforms/twitter.js — Twitter / X Adapter
 */

import { domClickBlockStrategy } from '../core/blocker.js';

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

  blockStrategy(username, sourceElement) {
    // Twitter/X: Use native block via GM_xmlhttpRequest
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      if (!csrfToken) {
        this._openBlockPage(username);
        return;
      }
      // Twitter's block endpoint
      GM_xmlhttpRequest({
        method: 'POST',
        url: `https://x.com/i/api/1.1/blocks/create.json`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-csrf-token': csrfToken,
          'authorization': `Bearer ${TOKEN}`,
          'x-twitter-auth-type': 'OAuth2Session',
        },
        data: `screen_name=${encodeURIComponent(username)}&skip_status=true`,
        onerror: () => this._openBlockPage(username),
      });
    } catch (e) {
      this._openBlockPage(username);
    }
  },

  /** 判定账号级别 */
  getAccountLevel(commentEl) {
    // Twitter/X: svg[data-testid="icon-verified"] fill="currentColor"
    // 实际颜色从祖先元素的 color CSS 属性继承，必须用 getComputedStyle 读取
    // ★ 兜底：从最近的 article 父级查找（防止 commentEl 是嵌套子元素）
    const targetEl = commentEl?.closest?.('article[data-testid="tweet"]') || commentEl;
    const verifiedIcon = targetEl?.querySelector('svg[data-testid="icon-verified"]');
    if (verifiedIcon) {
      const computedColor = getComputedStyle(verifiedIcon).color;
      // 解析 RGB 值判断色相区分金标(官方) vs 蓝标(普通认证)
      const rgbMatch = computedColor.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
      if (rgbMatch) {
        const r = Number(rgbMatch[1]), g = Number(rgbMatch[2]), b = Number(rgbMatch[3]);
        // 金色 ≈ 官方认证（金标/企业认证）: 红高、绿中高、蓝低 (如 rgb(255, 215, 0))
        if (r > 200 && g > 150 && b < 80 && (r - b) > 150) {
          return 'official';
        }
      }
      // 有验证图标但不是金色 → 蓝标认证
      // 兜底: 检查父元素内联 color 样式（部分 X UI 版本用内联方式）
      if (verifiedIcon.closest('[style*="color: rgb(255, 215, 0)"]') ||
          verifiedIcon.closest('[style*="color:rgb(255, 215, 0)"]') ||
          verifiedIcon.closest('[style*="color:#ffd700"]') ||
          verifiedIcon.closest('[style*="color: #ffd700"]')) {
        return 'official';
      }
      return 'verified';
    }
    return 'normal';
  },
};
