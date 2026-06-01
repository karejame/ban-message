/**
 * blocker.js — Block / Mute Action Executor
 *
 * Triggers the platform's native block or mute UI actions via DOM simulation.
 * No API calls — purely DOM-based so it works regardless of API access policies.
 */

export class Blocker {
  constructor(platform, config) {
    this.platform = platform;
    this.config   = config;
    this._queue   = new Map(); // username → debounce timer
  }

  /**
   * Block a user. Debounced to avoid spamming if same user appears many times.
   * @param {string} username
   * @param {Element} sourceElement  The comment element that triggered this
   */
  block(username, sourceElement) {
    if (this._queue.has(username)) return; // already pending

    const timer = setTimeout(() => {
      this._executeBlock(username, sourceElement);
      this._queue.delete(username);
    }, 800);

    this._queue.set(username, timer);
  }

  /**
   * Cancel a pending block (e.g. user clicked "undo")
   */
  cancel(username) {
    const timer = this._queue.get(username);
    if (timer) {
      clearTimeout(timer);
      this._queue.delete(username);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _executeBlock(username, sourceElement) {
    const strategy = this.platform.blockStrategy;

    if (!strategy) {
      console.warn(`[CyberShield] No block strategy for ${this.platform.name}`);
      return;
    }

    try {
      strategy(username, sourceElement);
      console.log(`[CyberShield] Blocked: @${username}`);
    } catch (err) {
      console.error(`[CyberShield] Block failed for @${username}:`, err);
    }
  }
}

// ── Shared block strategy helpers (used by platform adapters) ─────────────────

/**
 * Generic strategy: find the "more options" menu on the comment and click block.
 * Each platform adapter customizes the selectors.
 */
export function domClickBlockStrategy({ moreButtonSel, blockMenuItemSel }) {
  return (username, sourceElement) => {
    const moreBtn = sourceElement?.querySelector(moreButtonSel);
    if (!moreBtn) return;

    moreBtn.click();

    // Wait for menu to open, then click block item
    setTimeout(() => {
      const blockItem = document.querySelector(blockMenuItemSel);
      if (blockItem) {
        blockItem.click();
        // Confirm dialog if present
        setTimeout(() => {
          const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
          confirmBtn?.click();
        }, 300);
      }
    }, 400);
  };
}
