import { Evidence } from './evidence.js';
import { t, getLang } from './i18n.js';
import { on } from './events.js';

export const Panel = {
  _el: null,
  _evidence: null,
  _config: null,

  mount(config) {
    this._config = config;
    this._evidence = new Evidence(config);
    this._inject();
    this._bind();
    this._listen();
  },

  _inject() {
    GM_addStyle(PANEL_CSS);

    const el = document.createElement('div');
    el.id = 'cs-panel';
    el.innerHTML = PANEL_HTML(this._config);
    document.body.appendChild(el);
    this._el = el;
    this._setCollapsed(true);
  },

  _bind() {
    const el = this._el;

    el.querySelector('#cs-toggle').addEventListener('click', () => {
      this._setCollapsed(!el.classList.contains('cs-collapsed'));
    });

    el.querySelector('#cs-enabled').addEventListener('change', (e) => {
      this._config.enabled = e.target.checked;
      this._save();
      this._updateStatus();
    });

    el.querySelector('#cs-sensitivity').addEventListener('change', (e) => {
      this._config.sensitivity = e.target.value;
      this._save();
    });

    el.querySelector('#cs-ai-toggle').addEventListener('change', (e) => {
      this._config.aiEnabled = e.target.checked;
      this._save();
      const row = el.querySelector('#cs-api-key-row');
      if (row) row.style.display = e.target.checked ? 'flex' : 'none';
    });

    el.querySelector('#cs-api-key')?.addEventListener('change', (e) => {
      this._config.apiKey = e.target.value.trim();
      this._save();
    });

    el.querySelector('#cs-auto-block').addEventListener('change', (e) => {
      this._config.autoBlock = e.target.checked;
      this._save();
    });

    el.querySelector('#cs-evidence-btn').addEventListener('click', () => {
      this._showEvidenceModal();
    });

    el.querySelector('#cs-export-btn').addEventListener('click', () => {
      this._evidence.exportJSON();
    });

    el.querySelector('#cs-diagnose-btn').addEventListener('click', () => {
      this._runDiagnose();
    });

    this._makeDraggable(el);
  },

  _setCollapsed(collapsed) {
    this._el.classList.toggle('cs-collapsed', collapsed);
  },

  _updateStatus() {
    const dot = this._el.querySelector('#cs-status-dot');
    if (dot) {
      dot.className = this._config.enabled ? 'cs-dot cs-dot-on' : 'cs-dot cs-dot-off';
    }
  },

  _save() {
    GM_setValue('cs_config', JSON.stringify(this._config));
  },

  _showEvidenceModal() {
    const existing = document.getElementById('cs-modal');
    if (existing) { existing.remove(); return; }

    const log = this._evidence.getAll();
    const modal = document.createElement('div');
    modal.id = 'cs-modal';
    modal.innerHTML = `
      <div class="cs-modal-inner">
        <div class="cs-modal-header">
          <span>🛡️ ${t('modalTitle')} (${log.length})</span>
          <button id="cs-modal-close">✕</button>
        </div>
        <div class="cs-modal-body">
          ${log.length === 0
            ? `<p class="cs-empty">${t('emptyLog')}</p>`
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

  _makeDraggable(el) {
    let startX, startY, startLeft, startTop, dragging = false, didDrag = false;

    const toggle = el.querySelector('#cs-toggle');
    const handle = el.querySelector('#cs-drag-handle');

    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      didDrag = false;
      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didDrag = true;
      }
      el.style.left = `${startLeft + dx}px`;
      el.style.top = `${startTop + dy}px`;
    });

    document.addEventListener('mouseup', () => { dragging = false; });

    toggle.addEventListener('click', (e) => {
      if (didDrag) {
        e.stopPropagation();
        didDrag = false;
      }
    });
  },

  _listen() {
    this._unsub = [
      on('scan:result', (data) => this._addFeedEntry(data)),
      on('scan:status', (data) => this._updateScanStatus(data)),
    ];
  },

  _updateScanStatus(data) {
    const label = this._el.querySelector('#cs-feed-status');
    if (!label) return;
    if (data.count > 0) {
      label.textContent = t('feedFound', { n: data.count });
      label.style.color = 'var(--cs-toggle-on)';
    } else {
      label.textContent = t('feedNoMatch');
      label.style.color = 'var(--cs-text-secondary)';
    }
  },

  _addFeedEntry(data) {
    const container = this._el.querySelector('#cs-feed-body');
    if (!container) return;

    const empty = container.querySelector('.cs-feed-empty');
    if (empty) empty.remove();

    const colors = { safe: '#22c55e', suspicious: '#f59e0b', toxic: '#ef4444' };
    const labels = { safe: t('feedSafe'), suspicious: t('feedSuspicious'), toxic: t('feedToxic') };
    const color = colors[data.verdict] || '#888';
    const label = labels[data.verdict] || data.verdict;

    const entry = document.createElement('div');
    entry.className = 'cs-feed-item';
    entry.style.borderLeftColor = color;
    entry.innerHTML = `
      <span class="cs-feed-dot" style="background:${color}"></span>
      <span class="cs-feed-user">${escapeHtml(data.username || '?')}</span>
      <span class="cs-feed-tag" style="background:${color}15;color:${color}">${label}</span>
      <span class="cs-feed-text">${escapeHtml(data.text.slice(0, 60))}</span>
    `;

    container.insertBefore(entry, container.firstChild);

    const max = 30;
    while (container.children.length > max) {
      container.lastChild.remove();
    }
  },

  _runDiagnose() {
    const selectors = [
      'reply-item', 'comment-item', 'bili-comment',
      '[class*="reply"]', '[class*="comment"]',
      '[class*="Reply"]', '[class*="Comment"]',
      '.reply-item', '.comment-item', '.bili-comment',
    ];
    console.log('%c[CyberShield Diagnosis]', 'font-size:16px;font-weight:bold;color:#60a5fa');
    console.log('URL:', location.href);
    console.log('Platform:', this._config?.platform?.name || 'unknown');
    for (const sel of selectors) {
      const n = document.querySelectorAll(sel).length;
      if (n > 0) {
        const sample = document.querySelector(sel);
        console.log(`  "${sel}" → ${n} matches, sample:`, sample.className?.slice(0, 100), sample);
      }
    }
    console.log('%cCheck the console output above, match results are shown in ✅ green', 'color:#22c55e');
  },
};

function PANEL_HTML(config) {
  const isZh = getLang() === 'zh';
  return `
    <div id="cs-drag-handle">
      <button id="cs-toggle" title="CyberShield">🛡️</button>
      <span id="cs-status-dot" class="cs-dot ${config.enabled ? 'cs-dot-on' : 'cs-dot-off'}"></span>
    </div>
    <div id="cs-body">
      <div class="cs-panel-header">
        <span class="cs-panel-title">${t('panelTitle')}</span>
        <span class="cs-panel-badge">${t('version', { ver: '0.1' })}</span>
      </div>

      <div class="cs-toggle-row">
        <span class="cs-label">${t('protection')}</span>
        <label class="cs-switch">
          <input type="checkbox" id="cs-enabled" ${config.enabled ? 'checked' : ''}>
          <span class="cs-slider"></span>
        </label>
      </div>

      <div class="cs-select-row">
        <span class="cs-label">${t('sensitivity')}</span>
        <select id="cs-sensitivity" class="cs-select">
          <option value="low"    ${config.sensitivity === 'low'    ? 'selected' : ''}>${t('low')}</option>
          <option value="medium" ${config.sensitivity === 'medium' ? 'selected' : ''}>${t('medium')}</option>
          <option value="high"   ${config.sensitivity === 'high'   ? 'selected' : ''}>${t('high')}</option>
        </select>
      </div>

      <div class="cs-toggle-row">
        <span class="cs-label">${t('autoBlock')}</span>
        <label class="cs-switch">
          <input type="checkbox" id="cs-auto-block" ${config.autoBlock ? 'checked' : ''}>
          <span class="cs-slider"></span>
        </label>
      </div>

      <div class="cs-toggle-row">
        <span class="cs-label">${t('aiMode')}</span>
        <label class="cs-switch">
          <input type="checkbox" id="cs-ai-toggle" ${config.aiEnabled ? 'checked' : ''}>
          <span class="cs-slider"></span>
        </label>
      </div>

      <div class="cs-api-row" id="cs-api-key-row" style="display:${config.aiEnabled ? 'flex' : 'none'}">
        <span class="cs-label cs-label-sm">${t('apiKey')}</span>
        <input type="password" id="cs-api-key" class="cs-input" placeholder="${t('apiKeyPlaceholder')}" value="${config.apiKey || ''}">
        <span class="cs-hint">${t('aiDesc')}</span>
      </div>

      <div class="cs-divider"></div>

      <div class="cs-btn-row">
        <button id="cs-evidence-btn" class="cs-btn">📋 ${t('evidence')}</button>
        <button id="cs-export-btn" class="cs-btn">💾 ${t('export')}</button>
      </div>

      <div class="cs-divider"></div>

      <div class="cs-feed-header">
        <span>📊 ${t('feedTitle')}</span>
        <span id="cs-feed-status" class="cs-feed-status"></span>
        <button id="cs-diagnose-btn" class="cs-diagnose-btn" title="${t('diagnose')}">🔍</button>
      </div>
      <div id="cs-feed-body">
        <div class="cs-feed-empty">${t('feedEmpty')}</div>
      </div>
    </div>
  `;
}

const PANEL_CSS = `
  :root {
    --cs-bg: #ffffff;
    --cs-bg-body: #f5f6f8;
    --cs-text: #1a1a2e;
    --cs-text-secondary: #6b7280;
    --cs-border: #e5e7eb;
    --cs-shadow: rgba(0,0,0,0.1);
    --cs-accent: #2563eb;
    --cs-accent-hover: #1d4ed8;
    --cs-toggle-bg: #d1d5db;
    --cs-toggle-on: #10b981;
    --cs-input-bg: #f9fafb;
    --cs-input-border: #d1d5db;
    --cs-divider: #e5e7eb;
    --cs-modal-overlay: rgba(0,0,0,0.4);
    --cs-entry-bg: #f9fafb;
    --cs-entry-border: #e5e7eb;
    --cs-toxic-bg: #fef2f2;
    --cs-toxic-text: #dc2626;
    --cs-suspicious-bg: #fff7ed;
    --cs-suspicious-text: #ea580c;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --cs-bg: #1a1b2e;
      --cs-bg-body: #12132a;
      --cs-text: #e8e8f0;
      --cs-text-secondary: #9494a8;
      --cs-border: #2d2e42;
      --cs-shadow: rgba(0,0,0,0.4);
      --cs-accent: #60a5fa;
      --cs-accent-hover: #3b82f6;
      --cs-toggle-bg: #3d3e54;
      --cs-toggle-on: #34d399;
      --cs-input-bg: #0d0e1a;
      --cs-input-border: #3d3e54;
      --cs-divider: #2d2e42;
      --cs-modal-overlay: rgba(0,0,0,0.6);
      --cs-entry-bg: #0d0e1a;
      --cs-entry-border: #2d2e42;
      --cs-toxic-bg: #450a0a;
      --cs-toxic-text: #fca5a5;
      --cs-suspicious-bg: #431407;
      --cs-suspicious-text: #fdba74;
    }
  }

  #cs-panel {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 13px;
    user-select: none;
  }

  #cs-drag-handle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: grab;
    justify-content: flex-end;
  }

  #cs-drag-handle:active { cursor: grabbing; }

  #cs-toggle {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 2px solid var(--cs-accent);
    background: var(--cs-bg);
    font-size: 18px;
    cursor: pointer;
    box-shadow: 0 2px 12px var(--cs-shadow);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  #cs-toggle:hover {
    transform: scale(1.12);
    box-shadow: 0 4px 20px var(--cs-shadow);
  }

  .cs-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: background 0.3s;
    flex-shrink: 0;
  }

  .cs-dot-on { background: var(--cs-toggle-on); box-shadow: 0 0 6px var(--cs-toggle-on); }
  .cs-dot-off { background: var(--cs-text-secondary); }

  #cs-body {
    margin-top: 10px;
    background: var(--cs-bg);
    color: var(--cs-text);
    border-radius: 14px;
    padding: 14px 16px;
    width: 260px;
    box-shadow: 0 6px 30px var(--cs-shadow);
    border: 1px solid var(--cs-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: csFadeIn 0.2s ease;
  }

  @keyframes csFadeIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  #cs-panel.cs-collapsed #cs-body { display: none; }

  .cs-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cs-panel-title {
    font-weight: 700;
    font-size: 14px;
    color: var(--cs-accent);
    letter-spacing: 0.3px;
  }

  .cs-panel-badge {
    font-size: 10px;
    color: var(--cs-text-secondary);
    background: var(--cs-bg-body);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .cs-label {
    font-size: 13px;
    color: var(--cs-text);
  }

  .cs-label-sm { font-size: 12px; }

  .cs-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cs-switch {
    position: relative;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }

  .cs-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .cs-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--cs-toggle-bg);
    border-radius: 20px;
    transition: background 0.25s;
  }

  .cs-slider::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.25s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }

  .cs-switch input:checked + .cs-slider { background: var(--cs-toggle-on); }
  .cs-switch input:checked + .cs-slider::before { transform: translateX(16px); }

  .cs-select-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cs-select {
    background: var(--cs-input-bg);
    border: 1px solid var(--cs-input-border);
    color: var(--cs-text);
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    max-width: 100px;
    outline: none;
    cursor: pointer;
  }

  .cs-select:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
  }

  .cs-api-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cs-input {
    background: var(--cs-input-bg);
    border: 1px solid var(--cs-input-border);
    color: var(--cs-text);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 12px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .cs-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
  }

  .cs-hint {
    font-size: 10px;
    color: var(--cs-text-secondary);
    line-height: 1.3;
  }

  .cs-divider {
    height: 1px;
    background: var(--cs-divider);
    margin: 2px 0;
  }

  .cs-btn-row {
    display: flex;
    gap: 6px;
  }

  .cs-btn {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid var(--cs-border);
    border-radius: 8px;
    background: var(--cs-bg-body);
    color: var(--cs-text);
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .cs-btn:hover {
    background: var(--cs-accent);
    color: #fff;
    border-color: var(--cs-accent);
  }

  #cs-modal {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: var(--cs-modal-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: csFadeIn 0.2s ease;
  }

  .cs-modal-inner {
    background: var(--cs-bg);
    border-radius: 14px;
    width: 560px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 40px var(--cs-shadow);
    border: 1px solid var(--cs-border);
  }

  .cs-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--cs-divider);
    color: var(--cs-text);
    font-weight: 700;
    font-size: 14px;
  }

  .cs-modal-header button {
    background: none;
    border: none;
    color: var(--cs-text-secondary);
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
    border-radius: 4px;
  }

  .cs-modal-header button:hover { background: var(--cs-bg-body); }

  .cs-modal-body {
    overflow-y: auto;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cs-entry {
    border: 1px solid var(--cs-entry-border);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--cs-entry-bg);
  }

  .cs-entry-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; }
  .cs-entry-user { color: var(--cs-accent); font-weight: 600; }
  .cs-entry-verdict { padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .cs-verdict-toxic { background: var(--cs-toxic-bg); color: var(--cs-toxic-text); }
  .cs-verdict-suspicious { background: var(--cs-suspicious-bg); color: var(--cs-suspicious-text); }
  .cs-entry-time { color: var(--cs-text-secondary); margin-left: auto; font-size: 10px; }
  .cs-entry-text { color: var(--cs-text); font-size: 12px; line-height: 1.4; word-break: break-all; }
  .cs-entry-url a { color: var(--cs-text-secondary); font-size: 10px; text-decoration: none; opacity: 0.6; }
  .cs-entry-url a:hover { opacity: 1; }
  .cs-empty { color: var(--cs-text-secondary); text-align: center; padding: 30px 0; font-size: 13px; }

  .cs-feed-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--cs-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cs-feed-status {
    flex: 1;
    font-size: 10px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .cs-diagnose-btn {
    background: none;
    border: 1px solid var(--cs-border);
    border-radius: 4px;
    padding: 0 4px;
    cursor: pointer;
    font-size: 10px;
    color: var(--cs-text-secondary);
    line-height: 1.4;
  }

  .cs-diagnose-btn:hover {
    background: var(--cs-accent);
    border-color: var(--cs-accent);
    color: #fff;
  }

  #cs-feed-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 180px;
    overflow-y: auto;
  }

  .cs-feed-empty {
    font-size: 11px;
    color: var(--cs-text-secondary);
    text-align: center;
    padding: 10px 0;
  }

  .cs-feed-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 6px;
    border-left: 3px solid #888;
    border-radius: 4px;
    background: var(--cs-entry-bg);
    font-size: 11px;
    animation: csFeedIn 0.25s ease;
  }

  @keyframes csFeedIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .cs-feed-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cs-feed-user {
    color: var(--cs-accent);
    font-weight: 600;
    flex-shrink: 0;
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cs-feed-tag {
    font-size: 9px;
    font-weight: 600;
    padding: 0 5px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .cs-feed-text {
    color: var(--cs-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
`;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}