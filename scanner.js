/**
 * scanner.js — DOM Scanner
 *
 * Uses MutationObserver to watch for new comment nodes injected by the platform,
 * runs them through the Detector, and dispatches actions (blur, block, log).
 */

import { Detector, Verdict } from './detector.js';
import { Blocker } from './blocker.js';
import { Evidence } from './evidence.js';

export class Scanner {
  constructor(platform, config) {
    this.platform = platform;
    this.config   = config;
    this.detector = new Detector(config);
    this.blocker  = new Blocker(platform, config);
    this.evidence = new Evidence(config);
    this.observer = null;
    this._seen    = new WeakSet(); // avoid re-scanning same nodes
  }

  start() {
    if (!this.config.enabled) return;

    // Scan whatever is already on the page
    this._scanAll();

    // Watch for new content (infinite scroll, live updates)
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this._scanSubtree(node);
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree:   true,
    });

    console.log(`[CyberShield] Scanner started on ${this.platform.name}`);
  }

  stop() {
    this.observer?.disconnect();
    console.log('[CyberShield] Scanner stopped.');
  }

  // ── Scan helpers ─────────────────────────────────────────────────────────────

  _scanAll() {
    const containers = document.querySelectorAll(this.platform.selectors.commentContainer);
    containers.forEach(el => this._processComment(el));
  }

  _scanSubtree(root) {
    // Is root itself a comment container?
    if (root.matches?.(this.platform.selectors.commentContainer)) {
      this._processComment(root);
    }
    // Or does it contain comment containers?
    root.querySelectorAll?.(this.platform.selectors.commentContainer)
      .forEach(el => this._processComment(el));
  }

  _processComment(el) {
    if (this._seen.has(el)) return;
    this._seen.add(el);

    const text     = this._extractText(el);
    const username = this._extractUsername(el);
    const context  = this._buildContext(el, username);

    if (!text || text.length < 3) return;

    // Skip whitelisted users
    if (this.config.whitelist.includes(username)) return;

    const result = this.detector.analyze(text, context, (aiResult) => {
      // AI result arrived asynchronously
      if (aiResult?.verdict === Verdict.TOXIC) {
        this._handleToxic(el, text, username, aiResult);
      }
    });

    if (result.verdict === Verdict.TOXIC) {
      this._handleToxic(el, text, username, result);
    } else if (result.verdict === Verdict.SUSPICIOUS) {
      this._handleSuspicious(el, result);
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  _handleToxic(el, text, username, result) {
    // 1. Blur the element
    this._blurElement(el, result);

    // 2. Log evidence
    this.evidence.log({ text, username, result, url: location.href, timestamp: Date.now() });

    // 3. Auto-block if configured
    if (this.config.autoBlock && username) {
      this.blocker.block(username, el);
    }
  }

  _handleSuspicious(el, result) {
    // Lighter treatment: just add a subtle warning border
    el.style.border = '1px dashed rgba(255, 165, 0, 0.4)';
    el.dataset.csVerdict = 'suspicious';
    el.title = `[CyberShield] Suspicious: ${result.reason}`;
  }

  _blurElement(el, result) {
    el.dataset.csVerdict = 'toxic';
    el.dataset.csReason  = result.reason;

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-blur-wrapper';
    wrapper.innerHTML = `
      <div class="cs-blur-overlay">
        <span class="cs-icon">🛡️</span>
        <span class="cs-label">Potentially harmful content hidden</span>
        <button class="cs-reveal-btn">Show anyway</button>
      </div>
    `;

    el.parentNode?.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    el.classList.add('cs-blurred');

    wrapper.querySelector('.cs-reveal-btn').addEventListener('click', () => {
      el.classList.remove('cs-blurred');
      wrapper.querySelector('.cs-blur-overlay').style.display = 'none';
    });
  }

  // ── Platform-aware extraction ─────────────────────────────────────────────────

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
    // TODO: platform adapters can override this to check if the comment
    // @-mentions the currently logged-in user
    return false;
  }
}

// ── Static styles (injected once) ─────────────────────────────────────────────

GM_addStyle(`
  .cs-blurred {
    filter: blur(8px);
    pointer-events: none;
    user-select: none;
    transition: filter 0.2s ease;
  }

  .cs-blur-wrapper {
    position: relative;
  }

  .cs-blur-overlay {
    position: absolute;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(0,0,0,0.05);
    backdrop-filter: blur(2px);
    border-radius: 4px;
    border: 1px solid rgba(255,0,0,0.15);
    font-size: 13px;
    color: #555;
  }

  .cs-reveal-btn {
    padding: 2px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    font-size: 12px;
  }

  .cs-reveal-btn:hover {
    background: #f0f0f0;
  }
`);
