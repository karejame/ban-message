/**
 * ui/panel.js — CyberShield Floating Control Panel
 *
 * A draggable floating panel injected into every page.
 * Lets users control sensitivity, view the evidence log, and toggle features.
 */

import { Evidence } from './evidence.js';

export const Panel = {
  _el: null,
  _evidence: null,
  _config: null,

  mount(config) {
    this._config = config;
    this._evidence = new Evidence(config);
    this._inject();
    this._bind();
  },

  // ── DOM Build ─────────────────────────────────────────────────────────────────

  _inject() {
    GM_addStyle(PANEL_CSS);

    const el = document.createElement('div');
    el.id = 'cs-panel';
    el.innerHTML = PANEL_HTML(this._config);
    document.body.appendChild(el);
    this._el = el;

    // Collapsed by default — just the shield icon shows
    this._setCollapsed(true);
  },

  _bind() {
    const el = this._el;

    // Toggle expand/collapse on shield click
    el.querySelector('#cs-toggle').addEventListener('click', () => {
      this._setCollapsed(!el.classList.contains('cs-collapsed'));
    });

    // Enabled toggle
    el.querySelector('#cs-enabled').addEventListener('change', (e) => {
      this._config.enabled = e.target.checked;
      this._save();
      this._updateStatus();
    });

    // Sensitivity selector
    el.querySelector('#cs-sensitivity').addEventListener('change', (e) => {
      this._config.sensitivity = e.target.value;
      this._save();
    });

    // AI toggle
    el.querySelector('#cs-ai-toggle').addEventListener('change', (e) => {
      this._config.aiEnabled = e.target.checked;
      this._save();
      el.querySelector('#cs-api-key-row').style.display = e.target.checked ? 'flex' : 'none';
    });

    // API key input
    el.querySelector('#cs-api-key').addEventListener('change', (e) => {
      this._config.apiKey = e.target.value.trim();
      this._save();
    });

    // Auto-block toggle
    el.querySelector('#cs-auto-block').addEventListener('change', (e) => {
      this._config.autoBlock = e.target.checked;
      this._save();
    });

    // Evidence log button
    el.querySelector('#cs-evidence-btn').addEventListener('click', () => {
      this._showEvidenceModal();
    });

    // Export button
    el.querySelector('#cs-export-btn').addEventListener('click', () => {
      this._evidence.exportJSON();
    });

    // Make draggable
    this._makeDraggable(el);
  },

  _setCollapsed(collapsed) {
    if (collapsed) {
      this._el.classList.add('cs-collapsed');
    } else {
      this._el.classList.remove('cs-collapsed');
    }
  },

  _updateStatus() {
    const dot = this._el.querySelector('#cs-status-dot');
    if (dot) dot.style.background = this._config.enabled ? '#4caf50' : '#999';
  },

  _save() {
    GM_setValue('cs_config', JSON.stringify(this._config));
  },

  // ── Evidence Modal ────────────────────────────────────────────────────────────

  _showEvidenceModal() {
    const existing = document.getElementById('cs-modal');
    if (existing) { existing.remove(); return; }

    const log = this._evidence.getAll();
    const modal = document.createElement('div');
    modal.id = 'cs-modal';
    modal.innerHTML = `
      <div class="cs-modal-inner">
        <div class="cs-modal-header">
          <span>🛡️ Evidence Vault (${log.length})</span>
          <button id="cs-modal-close">✕</button>
        </div>
        <div class="cs-modal-body">
          ${log.length === 0
            ? '<p class="cs-empty">No incidents logged yet.</p>'
            : log.slice(0, 50).map(entry => `
              <div class="cs-entry">
                <div class="cs-entry-meta">
                  <span class="cs-entry-user">@${entry.username}</span>
                  <span class="cs-entry-verdict cs-verdict-${entry.verdict}">${entry.verdict}</span>
                  <span class="cs-entry-time">${new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <div class="cs-entry-text">${escapeHtml(entry.text || '')}</div>
                <div class="cs-entry-url"><a href="${entry.url}" target="_blank">${entry.url?.slice(0, 60)}…</a></div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('cs-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  // ── Draggable ────────────────────────────────────────────────────────────────

  _makeDraggable(el) {
    let startX, startY, startLeft, startTop, dragging = false;

    el.querySelector('#cs-drag-handle').addEventListener('mousedown', (e) => {
      dragging = true;
      startX   = e.clientX;
      startY   = e.clientY;
      startLeft = el.offsetLeft;
      startTop  = el.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      el.style.left = `${startLeft + e.clientX - startX}px`;
      el.style.top  = `${startTop  + e.clientY - startY}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  },
};

// ── HTML Template ─────────────────────────────────────────────────────────────

function PANEL_HTML(config) {
  return `
    <div id="cs-drag-handle">
      <button id="cs-toggle" title="CyberShield">🛡️</button>
      <span id="cs-status-dot" style="background:${config.enabled ? '#4caf50' : '#999'}"></span>
    </div>
    <div id="cs-body">
      <div class="cs-title">CyberShield <span class="cs-version">v0.1</span></div>

      <label class="cs-row">
        <span>Protection</span>
        <input type="checkbox" id="cs-enabled" ${config.enabled ? 'checked' : ''}>
      </label>

      <label class="cs-row">
        <span>Sensitivity</span>
        <select id="cs-sensitivity">
          <option value="low"    ${config.sensitivity === 'low'    ? 'selected' : ''}>Low</option>
          <option value="medium" ${config.sensitivity === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high"   ${config.sensitivity === 'high'   ? 'selected' : ''}>High</option>
        </select>
      </label>

      <label class="cs-row">
        <span>Auto-block</span>
        <input type="checkbox" id="cs-auto-block" ${config.autoBlock ? 'checked' : ''}>
      </label>

      <label class="cs-row">
        <span>AI Mode</span>
        <input type="checkbox" id="cs-ai-toggle" ${config.aiEnabled ? 'checked' : ''}>
      </label>

      <label class="cs-row" id="cs-api-key-row" style="display:${config.aiEnabled ? 'flex' : 'none'}">
        <span>API Key</span>
        <input type="password" id="cs-api-key" placeholder="sk-ant-…" value="${config.apiKey || ''}">
      </label>

      <div class="cs-divider"></div>

      <div class="cs-row cs-actions">
        <button id="cs-evidence-btn">📋 Evidence</button>
        <button id="cs-export-btn">💾 Export</button>
      </div>
    </div>
  `;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const PANEL_CSS = `
  #cs-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    user-select: none;
  }

  #cs-drag-handle {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: grab;
  }

  #cs-drag-handle:active { cursor: grabbing; }

  #cs-toggle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: #1a1a2e;
    font-size: 18px;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    transition: transform 0.15s;
  }

  #cs-toggle:hover { transform: scale(1.1); }

  #cs-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background 0.3s;
  }

  #cs-body {
    margin-top: 8px;
    background: #1a1a2e;
    color: #e0e0e0;
    border-radius: 12px;
    padding: 12px 14px;
    width: 220px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #cs-panel.cs-collapsed #cs-body { display: none; }

  .cs-title {
    font-weight: 700;
    font-size: 14px;
    color: #fff;
    letter-spacing: 0.5px;
  }

  .cs-version { font-size: 10px; color: #888; margin-left: 4px; }

  .cs-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .cs-row span { color: #aaa; }

  .cs-row select, .cs-row input[type="password"] {
    background: #0d0d1a;
    border: 1px solid #333;
    color: #e0e0e0;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 12px;
    max-width: 110px;
  }

  .cs-divider {
    height: 1px;
    background: #333;
    margin: 2px 0;
  }

  .cs-actions { gap: 6px; }

  .cs-actions button {
    flex: 1;
    padding: 5px 6px;
    border: 1px solid #444;
    border-radius: 6px;
    background: #0d0d1a;
    color: #ccc;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s;
  }

  .cs-actions button:hover { background: #252540; }

  /* Modal */
  #cs-modal {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cs-modal-inner {
    background: #1a1a2e;
    border-radius: 12px;
    width: 560px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  }

  .cs-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid #333;
    color: #fff;
    font-weight: 700;
  }

  .cs-modal-header button {
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 16px;
  }

  .cs-modal-body {
    overflow-y: auto;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cs-entry {
    border: 1px solid #333;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cs-entry-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; }
  .cs-entry-user { color: #7eb8f7; font-weight: 600; }
  .cs-entry-verdict { padding: 1px 6px; border-radius: 10px; font-size: 10px; }
  .cs-verdict-toxic      { background: #ff4444; color: #fff; }
  .cs-verdict-suspicious { background: #ff8c00; color: #fff; }
  .cs-entry-time { color: #666; margin-left: auto; }
  .cs-entry-text { color: #ccc; font-size: 12px; }
  .cs-entry-url a { color: #555; font-size: 10px; text-decoration: none; }
  .cs-empty { color: #555; text-align: center; padding: 30px 0; }
`;

// ── Utils ──────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
