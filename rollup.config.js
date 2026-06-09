import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         CyberShield
// @name:zh-CN   CyberShield 网暴保护盾
// @namespace    https://github.com/andykair55-byte/CivilityFilter.git
// @version      0.7.0
// @description  Protect yourself from online harassment. Detects, blurs, and logs toxic content.
// @description:zh-CN 保护你免受网络暴力。自动检测、屏蔽并记录骚扰内容。
// @author       CyberShield Contributors
// @license      MIT
//  
// @match        *://twitter.com/*
// @match        *://x.com/*
// @match        *://www.reddit.com/*
// @match        *://www.youtube.com/*
// @match        *://weibo.com/*
// @match        *://www.weibo.com/*
// @match        *://*.bilibili.com/*
// @match        *://www.zhihu.com/*
// @match        *://tieba.baidu.com/*
//
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_notification
// @connect      api.anthropic.com
// @connect      api.bilibili.com
// @connect      bilibili.com
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      open.bigmodel.cn
// @connect      api.moonshot.cn
// @connect      generativelanguage.googleapis.com
// @connect      openrouter.ai
// @connect      xiaomimimo.com
// @connect      *
//
// @run-at       document-idle
// ==/UserScript==
`;

export default {
  input: 'cyber-shield.user.js',
  output: {
    file: 'dist/cyber-shield.user.js',
    format: 'iife',
    banner: USERSCRIPT_HEADER,
  },
  plugins: [json(), resolve()],
};
