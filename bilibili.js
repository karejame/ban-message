/**
 * platforms/bilibili.js — B站 Bilibili Adapter
 */

export const BilibiliPlatform = {
  name: 'Bilibili B站',
  hostnames: ['bilibili.com'],

  selectors: {
    commentContainer: '.reply-item, [class*="ReplyItem"], .comment-item',
    commentText:      '.reply-content, [class*="ReplyContent"], .text',
    username:         '.user-name, [class*="UserName"], a.name',
    replyContainer:   '.sub-reply-item, [class*="SubReply"]',
  },

  blockStrategy(username, sourceElement) {
    // B站: right-click or hover on username → 拉黑用户
    const userEl = sourceElement?.querySelector('.user-name, a.name');
    if (!userEl) return;

    userEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    setTimeout(() => {
      const blockBtn = document.querySelector('[class*="block-user"], [data-type="block"]');
      if (blockBtn) {
        blockBtn.click();
      } else {
        GM_notification({
          title: '🛡️ CyberShield — B站',
          text:  `请手动拉黑用户 @${username}`,
        });
      }
    }, 600);
  },
};
