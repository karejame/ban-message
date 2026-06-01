/**
 * platforms/weibo.js — 微博 Adapter
 */

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

  blockStrategy(username, sourceElement) {
    // 微博: hover menu on username → 拉黑
    // Trigger hover on the username element to open the card popup
    const userEl = sourceElement?.querySelector('a[usercard], .name a');
    if (!userEl) return;

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
          text:  `请手动拉黑用户 @${username}`,
        });
      }
    }, 600);
  },
};
