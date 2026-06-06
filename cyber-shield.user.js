// ─── Module imports ───────────────────────────────────────────────────────────
import { Detector, Verdict } from './src/core/detector.js';
import { Scanner } from './src/core/scanner.js';
import { Blocker } from './src/core/blocker.js';
import { Evidence } from './src/core/evidence.js';
import { PlatformRegistry } from './src/platforms/index.js';
import { Panel } from './src/core/panel.js';
import { on } from './src/core/events.js';

(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────────────────

  const Config = {
    DEFAULTS: {
      enabled: true,
      sensitivity: 'medium',      // 'low' | 'medium' | 'high'
      autoBlock: false,            // auto-trigger platform block
      aiEnabled: false,            // Layer 3: AI semantic
      aiMode: 'eco',               // 'off' | 'eco' | 'full'
      aiProvider: 'claude',        // 'claude' | 'openai' | 'custom'
      apiKey: '',                  // user's API key (empty by default)
      aiEndpoint: '',              // custom API endpoint URL
      aiModel: '',                 // custom model override (empty = provider default)
      showBlurred: true,           // show blurred content with reveal option
      evidenceLog: true,           // save evidence automatically
      whitelist: [],               // usernames to always show
      blocklist: [],               // manually blocked users
      customKeywords: [],          // user-defined filter keywords [{keyword, aliases, addedAt}]
    },

    async load() {
      const saved = GM_getValue('cs_config', null);
      return saved ? { ...this.DEFAULTS, ...JSON.parse(saved) } : { ...this.DEFAULTS };
    },

    save(config) {
      GM_setValue('cs_config', JSON.stringify(config));
    },
  };

  // ─── Bootstrap ──────────────────────────────────────────────────────────────

  const CyberShield = {
    version: '0.7.0',
    config: null,
    platform: null,
    scanner: null,
    _lastUrl: null,
    _navTimer: null,

    async init() {
      try {
        this.config = await Config.load();
        this.platform = PlatformRegistry.detect();
        this._lastUrl = location.href;

        console.log(`[CyberShield] Initializing on: ${this.platform.name}`);

        // Start scanning
        this.scanner = new Scanner(this.platform, this.config);

        // Inject UI (传入 scanner 引用，面板需要操作 scanner)
        Panel.mount(this.config, this.scanner);

        await this.scanner.start();

        // ── 监听 SPA 页面跳转 ────────────────────────────────────────────
        this._setupNavigationDetection();

        // ── 监听配置变更事件 ────────────────────────────────────────────────
        on('config:updated', (data) => {
          if (data.type === 'customKeywords') {
            console.log('[CyberShield] Custom keywords changed, re-scanning page...');
            this.scanner.detector.reloadCustomKeywords();
            this.scanner._updateRuleCounts();
            // 新增：重扫页面以应用新关键词
            this.scanner.manualScan();
          }
        });

        // ── 监听面板脚本控制事件 ────────────────────────────────────────────
        on('scanner:stop', () => {
          this.scanner.stop();
          console.log('[CyberShield] Scanner stopped by user');
        });

        on('scanner:start', () => {
          this.scanner.start();
          console.log('[CyberShield] Scanner started by user');
        });

        on('scanner:manualScan', () => {
          this.scanner.manualScan();
          console.log('[CyberShield] Manual scan triggered by user');
        });

        // ── 监听页面导航事件 ──────────────────────────────────────────────
        on('navigation:changed', () => {
          console.log('[CyberShield] Navigation detected, re-scanning...');
          // 清除旧扫描状态
          this.scanner._seen = new WeakSet();
          this.scanner._spamMap = new Map();
          this.scanner._harassMap = new Map();
          // 延迟重扫，等待新页面内容加载
          if (this._navTimer) clearTimeout(this._navTimer);
          this._navTimer = setTimeout(() => {
            this.scanner._scanAll();
            this.scanner._updateRuleCounts();
          }, 800);
        });

        console.log('[CyberShield] Ready!');
      } catch (err) {
        console.error('[CyberShield] Initialization error:', err);
      }
    },

    /**
     * 检测 SPA 页面跳转（popstate / hashchange / pushState 拦截）
     */
    _setupNavigationDetection() {
      // popstate: 浏览器前进/后退
      window.addEventListener('popstate', () => this._checkUrlChange());

      // hashchange: 基于 hash 的路由
      window.addEventListener('hashchange', () => this._checkUrlChange());

      // monkey-patch pushState / replaceState: 拦截 SPA 框架的路由
      const patchHistoryMethod = (methodName) => {
        const original = history[methodName];
        history[methodName] = function (...args) {
          original.apply(this, args);
          // 延迟触发，让 URL 先完成更新
          setTimeout(() => CyberShield._checkUrlChange(), 50);
        };
      };
      patchHistoryMethod('pushState');
      patchHistoryMethod('replaceState');
    },

    _checkUrlChange() {
      if (location.href !== this._lastUrl) {
        this._lastUrl = location.href;
        emit('navigation:changed');
      }
    },
  };

  // ─── Kick off ───────────────────────────────────────────────────────────────

  window.addEventListener('load', () => CyberShield.init());
})();