// ─── Module imports ───────────────────────────────────────────────────────────
import { Detector, Verdict } from './detector.js';
import { Scanner } from './scanner.js';
import { Blocker } from './blocker.js';
import { Evidence } from './evidence.js';
import { PlatformRegistry } from './index.js';
import { Panel } from './panel.js';

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
    version: '0.1.0',
    config: null,
    platform: null,
    scanner: null,

    async init() {
      try {
        this.config = await Config.load();
        this.platform = PlatformRegistry.detect();

        console.log(`[CyberShield] Initializing on: ${this.platform.name}`);

        // Inject UI
        Panel.mount(this.config);

        // Start scanning
        this.scanner = new Scanner(this.platform, this.config);
        this.scanner.start();

        console.log('[CyberShield] Ready! 🛡️');
      } catch (err) {
        console.error('[CyberShield] Initialization error:', err);
      }
    },
  };

  // ─── Kick off ───────────────────────────────────────────────────────────────

  window.addEventListener('load', () => CyberShield.init());
})();
