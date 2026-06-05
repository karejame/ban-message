/**
 * platforms/tieba.js — 百度贴吧 Adapter
 */

import { t } from '../core/i18n.js';

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
      text:  t('tiebaManual', { user: username }),
    });
  },
};
