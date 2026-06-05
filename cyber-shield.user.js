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
      aiEnabled: false,            // Layer 3: Claude API
      apiKey: '',                  // user's Claude API key
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
    version: '0.6.1',
    config: null,
    platform: null,
    scanner: null,

    async init() {
      try {
        this.config = await Config.load();
        this.platform = PlatformRegistry.detect();

        console.log(`[CyberShield] Initializing on: ${this.platform.name}`);

        // Start scanning
        this.scanner = new Scanner(this.platform, this.config);

        // Inject UI (传入 scanner 引用，面板需要操作 scanner)
        Panel.mount(this.config, this.scanner);

        await this.scanner.start();

        // ── 监听配置变更事件 ────────────────────────────────────────────────
        on('config:updated', (data) => {
          if (data.type === 'customKeywords') {
            console.log('[CyberShield] Custom keywords changed, syncing detector...');
            this.scanner.detector.reloadCustomKeywords();
            this.scanner._updateRuleCounts();
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

        console.log('[CyberShield] Ready!');
      } catch (err) {
        console.error('[CyberShield] Initialization error:', err);
      }
    },
  };

  // ─── Kick off ───────────────────────────────────────────────────────────────

  window.addEventListener('load', () => CyberShield.init());
})();