import { Detector, Verdict } from './detector.js';
import { Blocker } from './blocker.js';
import { Evidence } from './evidence.js';
import { t } from './i18n.js';
import { emit } from './events.js';

export class Scanner {
  constructor(platform, config) {
    this.platform = platform;
    this.config   = config;
    this.detector = new Detector(config);
    this.blocker  = new Blocker(platform, config);
    this.evidence = new Evidence(config);
    this.observer = null;
    this._seen = new WeakSet();
    this._pendingNodes = [];
    this._flushTimer = null;
  }

  start() {
    if (!this.config.enabled) return;

    this._scanAll();

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this._pendingNodes.push(node);
          }
        }
      }
      this._scheduleFlush();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log(`[CyberShield] Scanner started on ${this.platform.name}`);
  }

  stop() {
    this.observer?.disconnect();
    if (this._flushTimer) {
      cancelAnimationFrame(this._flushTimer);
      this._flushTimer = null;
    }
    this._pendingNodes = [];
  }

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = requestAnimationFrame(() => {
      this._flushTimer = null;
      const batch = this._pendingNodes;
      this._pendingNodes = [];
      for (const node of batch) {
        this._scanSubtree(node);
      }
    });
  }

  _scanAll() {
    const containers = document.querySelectorAll(this.platform.selectors.commentContainer);
    console.log(`[CyberShield] Found ${containers.length} comment containers on page`);
    emit('scan:status', { count: containers.length, selector: this.platform.selectors.commentContainer });
    for (const el of containers) {
      this._processComment(el);
    }

    if (containers.length === 0) {
      this._tryProbeSelectors();
    }
  }

  _tryProbeSelectors() {
    const probes = ['[class*="reply"]', '[class*="comment"]', '[class*="Reply"]', '[class*="Comment"]', '[class*="item"]', '[class*="content"]'];
    for (const probe of probes) {
      const hits = document.querySelectorAll(probe);
      if (hits.length > 0) {
        const sample = hits[0].className || hits[0].tagName;
        console.log(`[CyberShield] Probe "${probe}" → ${hits.length} hits, sample:`, sample);
      }
    }
  }

  _scanSubtree(root) {
    if (root.matches?.(this.platform.selectors.commentContainer)) {
      this._processComment(root);
      return;
    }
    const children = root.querySelectorAll?.(this.platform.selectors.commentContainer);
    if (children) {
      for (const el of children) {
        this._processComment(el);
      }
    }
  }

  _processComment(el) {
    if (this._seen.has(el)) return;
    this._seen.add(el);

    const text = this._extractText(el);
    if (!text || text.length < 3) return;

    const username = this._extractUsername(el);
    if (this.config.whitelist.includes(username)) return;

    const context = this._buildContext(el, username);

    const result = this.detector.analyze(text, context, (aiResult) => {
      if (aiResult?.verdict === Verdict.TOXIC) {
        this._handleToxic(el, text, username, aiResult);
      }
    });

    if (result.verdict === Verdict.TOXIC) {
      console.log(`[CyberShield] TOXIC @${username || '?'}: "${text.slice(0, 60)}"`);
      this._handleToxic(el, text, username, result);
    } else if (result.verdict === Verdict.SUSPICIOUS) {
      this._handleSuspicious(el, result);
    }

    emit('scan:result', {
      text: text.slice(0, 200),
      username,
      verdict: result.verdict,
      reason: result.reason,
      confidence: result.confidence,
      timestamp: Date.now(),
    });
  }

  _handleToxic(el, text, username, result) {
    this.evidence.log({ text, username, result, url: location.href, timestamp: Date.now() });

    this.evidence.captureScreenshot(el).then(dataUrl => {
      if (dataUrl) {
        const log = this.evidence.getAll();
        if (log[0]) {
          log[0].screenshot = dataUrl;
          this.evidence._save(log);
        }
      }
    }).catch(() => {});

    this._blurElement(el, result);

    if (this.config.autoBlock && username) {
      this.blocker.block(username, el);
    }
  }

  _handleSuspicious(el, result) {
    el.style.border = '1px dashed rgba(255, 165, 0, 0.4)';
    el.dataset.csVerdict = 'suspicious';
    el.title = `[CyberShield] Suspicious: ${result.reason}`;
    console.log(`[CyberShield] SUSPICIOUS: "${result.reason}"`);
  }

  _blurElement(el, result) {
    el.dataset.csVerdict = 'toxic';
    el.dataset.csReason = result.reason;
    el.classList.add('cs-blurred');

    const overlay = document.createElement('div');
    overlay.className = 'cs-blur-overlay';
    overlay.innerHTML = `
      <span class="cs-icon">🛡️</span>
      <span class="cs-label">${t('blurLabel')}</span>
      <button class="cs-reveal-btn">${t('blurBtn')}</button>
    `;

    const positionOverlay = () => {
      const r = el.getBoundingClientRect();
      overlay.style.top = r.top + 'px';
      overlay.style.left = r.left + 'px';
      overlay.style.width = r.width + 'px';
      overlay.style.height = r.height + 'px';
    };

    positionOverlay();
    document.body.appendChild(overlay);

    const onScroll = () => positionOverlay();
    window.addEventListener('scroll', onScroll, { passive: true });

    overlay.querySelector('.cs-reveal-btn').addEventListener('click', () => {
      el.classList.remove('cs-blurred');
      overlay.remove();
      window.removeEventListener('scroll', onScroll);
    });
  }

  _extractText(el) {
    const sel = this.platform.selectors.commentText;
    const textEl = sel ? el.querySelector(sel) : el;
    return textEl?.innerText?.trim() || '';
  }

  _extractUsername(el) {
    const sel = this.platform.selectors.username;
    if (!sel) return null;
    const userEl = el.querySelector(sel);
    return userEl?.innerText?.trim() || userEl?.getAttribute('href')?.split('/').pop() || null;
  }

  _buildContext(el, username) {
    return {
      platform:    this.platform.name,
      username,
      isReply:     !!el.closest(this.platform.selectors.replyContainer || '[data-reply]'),
      mentionsUser: this._checkMentionsUser(el),
    };
  }

  _checkMentionsUser() {
    return false;
  }
}

GM_addStyle(`
  .cs-blurred {
    filter: blur(8px);
    pointer-events: none;
    user-select: none;
    transition: filter 0.2s ease;
  }

  .cs-blur-overlay {
    position: fixed;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: color-mix(in srgb, var(--cs-bg, #fff) 92%, transparent);
    backdrop-filter: blur(4px);
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--cs-border, #e5e7eb) 80%, transparent);
    font-size: 13px;
    color: var(--cs-text, #555);
    pointer-events: auto;
    box-sizing: border-box;
    padding: 32px 16px;
    flex-wrap: wrap;
  }

  .cs-reveal-btn {
    padding: 4px 14px;
    border: 1px solid var(--cs-border, #ccc);
    border-radius: 6px;
    background: var(--cs-bg, #fff);
    color: var(--cs-text, #333);
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
  }

  .cs-reveal-btn:hover {
    background: var(--cs-accent, #2563eb);
    color: #fff;
    border-color: var(--cs-accent, #2563eb);
  }
`);