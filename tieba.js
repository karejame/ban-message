/**
 * platforms/tieba.js — 百度贴吧 Adapter
 */

export const TiebaPlatform = {
  name: '贴吧 Tieba',
  hostnames: ['tieba.baidu.com'],

  selectors: {
    commentContainer: '.l_post, .j_lzl_single_container',
    commentText:      '.j_d_post_content, .lzl_content_main',
    username:         '.p_author_name, .lzl_p_author',
    replyContainer:   '.j_lzl_single_container',
  },

  blockStrategy(username) {
    // 贴吧 has very limited block UI - best we can do is notify
    GM_notification({
      title: '🛡️ CyberShield — 贴吧',
      text:  `请手动屏蔽用户 ${username}（贴吧暂不支持自动拉黑）`,
    });
  },
};
