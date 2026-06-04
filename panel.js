import { Evidence } from './evidence.js';
import { t, getLang, toggleLang } from './i18n.js';
import { on, emit } from './events.js';

export const Panel = {
  _el: null,
  _evidence: null,
  _config: null,
  _stats: null,
  _currentPage: 1,       // 1=控制面板, 2=扫描日志
  _scanLog: [],           // 最近20条扫描记录
  _scannerRef: null,      // scanner 引用（用于手动操作）

  mount(config, scanner) {
    this._config = config;
    this._scannerRef = scanner;
    this._evidence = new Evidence(config);
    this._stats = {
      scanned: 0, filtered: 0, suspicious: 0, spamBlocked: 0,
      lastScanTime: null, activeRules: 0,
      hardRules: 0, softRules: 0, regexRules: 0, customRules: 0,
      platform: '', observerActive: false, waitingForInit: false,
      enabled: config.enabled !== false,
      isRunning: true,
    };
    this._scanLog = [];
    this._inject();
    this._bind();
    this._listen();
  },

  // ── 页面切换 ─────────────────────────────────────────────────────────────

  _switchPage(pageNum) {
    this._currentPage = pageNum;
    const page1 = this._el.querySelector('#cs-page-1');
    const page2 = this._el.querySelector('#cs-page-2');
    const tab1 = this._el.querySelector('#cs-tab-1');
    const tab2 = this._el.querySelector('#cs-tab-2');

    if (pageNum === 1) {
      if (page1) page1.style.display = '';
      if (page2) page2.style.display = 'none';
      if (tab1) tab1.classList.add('cs-tab-active');
      if (tab2) tab2.classList.remove('cs-tab-active');
    } else {
      if (page1) page1.style.display = 'none';
      if (page2) page2.style.display = '';
      if (tab1) tab1.classList.remove('cs-tab-active');
      if (tab2) tab2.classList.add('cs-tab-active');
      // 切到日志页时渲染最新日志
      this._renderScanLog();
    }
  },

  /**
   * 切换语言（中 ↔ EN），重新渲染面板。
   */
  _switchLang() {
    const newLang = toggleLang();
    const wasCollapsed = this._el.classList.contains('cs-collapsed');
    console.log(`[CyberShield] Language switched to: ${newLang}`);
    // 重新渲染面板 HTML
    this._el.innerHTML = PANEL_HTML(this._config);
    // 重新绑定事件
    this._bind();
    // 恢复当前页面
    this._switchPage(this._currentPage);
    // 恢复折叠状态
    if (!wasCollapsed) {
      this._setCollapsed(false);
    }
    // 更新状态显示
    this._updateStatus();
  },

  _inject() {
    GM_addStyle(PANEL_CSS);

    const el = document.createElement('div');
    el.id = 'cs-panel';
    el.innerHTML = PANEL_HTML(this._config);
    document.body.appendChild(el);
    this._el = el;
    this._setCollapsed(true);
    this._switchPage(1);
  },

  _bind() {
    const el = this._el;

    // ── 页面切换 Tab ──────────────────────────────────────────────────────
    el.querySelector('#cs-tab-1')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._switchPage(1);
    });
    el.querySelector('#cs-tab-2')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._switchPage(2);
    });

    // ── 语言切换 ────────────────────────────────────────────────────────
    el.querySelector('#cs-lang-btn')?.addEventListener('click', () => this._switchLang());

    // ── 展开/折叠 ────────────────────────────────────────────────────────
    el.querySelector('#cs-toggle').addEventListener('click', () => {
      this._setCollapsed(!el.classList.contains('cs-collapsed'));
    });

    // ── 脚本控制按钮 ─────────────────────────────────────────────────────
    el.querySelector('#cs-btn-stop')?.addEventListener('click', () => this._stopScript());
    el.querySelector('#cs-btn-start')?.addEventListener('click', () => this._startScript());
    el.querySelector('#cs-btn-manual-scan')?.addEventListener('click', () => this._manualScan());

    // ── 配置项 ────────────────────────────────────────────────────────────
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

    // ── 自定义关键词管理 ──────────────────────────────────────────────────
    el.querySelector('#cs-custom-add-btn')?.addEventListener('click', () => {
      this._addCustomKeyword();
    });

    el.querySelector('#cs-custom-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addCustomKeyword();
    });

    el.querySelector('#cs-custom-import-btn')?.addEventListener('click', () => {
      this._importCustomKeywords();
    });

    el.querySelector('#cs-custom-export-btn')?.addEventListener('click', () => {
      this._exportCustomKeywords();
    });

    // ── 日志页手动扫描按钮 ──────────────────────────────────────────────
    el.querySelector('#cs-log-manual-scan')?.addEventListener('click', () => this._manualScan());

    // ── 一键拉黑全部违规用户 ────────────────────────────────────────────
    el.querySelector('#cs-block-all-btn')?.addEventListener('click', () => this._blockAll());

    this._makeDraggable(el);
  },

  // ── 脚本控制 ────────────────────────────────────────────────────────────

  _stopScript() {
    emit('scanner:stop');
    this._stats.isRunning = false;
    this._stats.observerActive = false;
    this._renderStats();
    this._renderControlButtons();
    console.log('[CyberShield] Script stopped by user');
  },

  _startScript() {
    emit('scanner:start');
    this._stats.isRunning = true;
    this._stats.observerActive = true;
    this._renderStats();
    this._renderControlButtons();
    console.log('[CyberShield] Script started by user');
  },

  _manualScan() {
    emit('scanner:manualScan');
    // 切换到日志页查看结果
    this._switchPage(2);
  },

  /**
   * 一键拉黑扫描日志中所有违规用户。
   * 从 scanLog 中提取唯一的违规用户名及其 UID，逐个调用 blocker.block()。
   * ★ 使用存储的 UID 构造合成元素，避免 blockStrategy 无法从 document.body 提取 UID。
   */
  _blockAll() {
    if (!this._scannerRef) {
      console.warn('[CyberShield] No scanner reference for block-all');
      return;
    }

    // 从扫描日志中提取唯一的违规用户及其 UID
    const toxicUsers = new Map(); // username → uid
    for (const entry of this._scanLog) {
      if (entry.verdict === 'toxic' && entry.username && entry.username !== '?' && entry.username !== '(spam)') {
        if (!toxicUsers.has(entry.username)) {
          toxicUsers.set(entry.username, entry.uid || null);
        }
      }
    }

    if (toxicUsers.size === 0) {
      GM_notification({
        title: '🛡️ CyberShield',
        text: t('blockAllEmpty'),
      });
      return;
    }

    let blocked = 0;
    for (const [username, uid] of toxicUsers) {
      // ★ 构造合成元素，包含 UID 信息，供 blockStrategy 提取
      let sourceEl;
      if (uid) {
        sourceEl = document.createElement('div');
        const fakeLink = document.createElement('a');
        fakeLink.href = `https://space.bilibili.com/${uid}`;
        sourceEl.appendChild(fakeLink);
        // 同时设置 data-mid 作为备用
        sourceEl.dataset.mid = uid;
      } else {
        sourceEl = document.body;
      }

      this._scannerRef.blocker.block(username, sourceEl);
      blocked++;
      console.log(`[CyberShield] Block-all: @${username} (UID:${uid || 'unknown'})`);
    }

    GM_notification({
      title: '🛡️ CyberShield',
      text: t('blockAllDone', { n: blocked }),
    });
  },

  _renderControlButtons() {
    const stopBtn = this._el.querySelector('#cs-btn-stop');
    const startBtn = this._el.querySelector('#cs-btn-start');
    const scanBtn = this._el.querySelector('#cs-btn-manual-scan');

    if (this._stats.isRunning) {
      if (stopBtn) stopBtn.style.display = '';
      if (startBtn) startBtn.style.display = 'none';
    } else {
      if (stopBtn) stopBtn.style.display = 'none';
      if (startBtn) startBtn.style.display = '';
    }
    if (scanBtn) scanBtn.disabled = !this._stats.isRunning;
  },

  _setCollapsed(collapsed) {
    this._el.classList.toggle('cs-collapsed', collapsed);
  },

  _updateStatus() {
    // ★ 同步 enabled 状态到 stats
    this._stats.enabled = this._config.enabled !== false;

    // 更新拖拽手柄旁的状态点
    const dot = this._el.querySelector('#cs-status-dot');
    if (dot) {
      dot.className = this._stats.enabled ? 'cs-dot cs-dot-on' : 'cs-dot cs-dot-off';
    }

    // 更新统计面板中的运行状态
    this._renderStats();
  },

  _save() {
    GM_setValue('cs_config', JSON.stringify(this._config));
  },

  // ── 事件监听 ────────────────────────────────────────────────────────────

  _listen() {
    this._unsub = [
      on('scan:result', (data) => {
        this._addScanLog(data);
        this._addFeedEntry(data);
      }),
      on('scan:status', (data) => this._updateScanStatus(data)),
      on('stats:update', (data) => {
        this._stats = { ...this._stats, ...data };
        // ★ 始终从 config 同步 enabled 状态，防止与 scanner 不一致
        this._stats.enabled = this._config.enabled !== false;
        this._renderStats();
        this._renderControlButtons();
      }),
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

  // ── 状态面板渲染 ──────────────────────────────────────────────────────

  _renderStats() {
    const s = this._stats;
    const el = this._el;
    if (!el) return;

    const platEl = el.querySelector('#cs-stat-platform');
    if (platEl) platEl.textContent = s.platform || t('statUnknown');

    const stateEl = el.querySelector('#cs-stat-state');
    const stateDot = el.querySelector('#cs-stat-state-dot');
    if (stateEl && stateDot) {
      if (!s.enabled) {
        stateEl.textContent = t('statDisabled');
        stateDot.className = 'cs-stat-dot cs-stat-dot-off';
      } else if (!s.isRunning) {
        stateEl.textContent = t('statStopped');
        stateDot.className = 'cs-stat-dot cs-stat-dot-off';
      } else if (s.waitingForInit) {
        stateEl.textContent = t('statWaiting');
        stateDot.className = 'cs-stat-dot cs-stat-dot-wait';
      } else if (s.observerActive) {
        stateEl.textContent = t('statActive');
        stateDot.className = 'cs-stat-dot cs-stat-dot-on';
      } else {
        stateEl.textContent = t('statIdle');
        stateDot.className = 'cs-stat-dot cs-stat-dot-off';
      }
    }

    this._setText('#cs-stat-scanned', s.scanned);
    this._setText('#cs-stat-filtered', s.filtered);
    this._setText('#cs-stat-spam', s.spamBlocked);
    this._setText('#cs-stat-rules', s.activeRules);

    const timeEl = el.querySelector('#cs-stat-time');
    if (timeEl) {
      timeEl.textContent = s.lastScanTime
        ? new Date(s.lastScanTime).toLocaleTimeString()
        : '--:--:--';
    }

    const obsDot = el.querySelector('#cs-stat-obs-dot');
    if (obsDot) {
      obsDot.className = s.observerActive
        ? 'cs-stat-micro-dot cs-stat-dot-on'
        : 'cs-stat-micro-dot cs-stat-dot-off';
    }
  },

  _setText(sel, val) {
    const el = this._el?.querySelector(sel);
    if (el) el.textContent = String(val);
  },

  // ── 扫描日志（第二页面） ──────────────────────────────────────────────

  _addScanLog(data) {
    this._scanLog.unshift({
      text: data.text || '',
      username: data.username || '?',
      verdict: data.verdict || 'safe',
      reason: data.reason || '',
      confidence: data.confidence || 0,
      contentType: data.contentType || 'comment',
      uid: data.uid || null,
      timestamp: data.timestamp || Date.now(),
    });
    // 最多保留20条
    if (this._scanLog.length > 20) {
      this._scanLog.length = 20;
    }
  },

  _renderScanLog() {
    const container = this._el?.querySelector('#cs-log-list');
    if (!container) return;

    const countEl = this._el?.querySelector('#cs-log-count');
    if (countEl) countEl.textContent = this._scanLog.length;

    if (this._scanLog.length === 0) {
      container.innerHTML = `<div class="cs-log-empty">${t('logEmpty')}</div>`;
      return;
    }

    container.innerHTML = this._scanLog.map(entry => {
      const colors = { safe: '#22c55e', suspicious: '#f59e0b', toxic: '#ef4444' };
      const labels = { safe: t('feedSafe'), suspicious: t('feedSuspicious'), toxic: t('feedToxic') };
      const color = colors[entry.verdict] || '#888';
      const label = labels[entry.verdict] || entry.verdict;
      const time = new Date(entry.timestamp).toLocaleTimeString();

      // 内容类型标签颜色和文本
      const typeColors = { comment: '#2563eb', reply: '#8b5cf6', message: '#f59e0b' };
      const typeLabels = { comment: t('typeComment'), reply: t('typeReply'), message: t('typeMessage') };
      const typeColor = typeColors[entry.contentType] || '#888';
      const typeLabel = typeLabels[entry.contentType] || entry.contentType;

      return `
        <div class="cs-log-item">
          <div class="cs-log-header">
            <span class="cs-log-user">@${escapeHtml(entry.username)}</span>
            <span class="cs-log-type" style="background:${typeColor}15;color:${typeColor}">${typeLabel}</span>
            <span class="cs-log-verdict" style="background:${color}15;color:${color}">${label}</span>
            <span class="cs-log-time">${time}</span>
          </div>
          <div class="cs-log-text">${escapeHtml(entry.text)}</div>
          ${entry.reason ? `<div class="cs-log-reason">${escapeHtml(entry.reason)}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  // ── 自定义关键词管理 ──────────────────────────────────────────────────

  _addCustomKeyword() {
    const input = this._el.querySelector('#cs-custom-input');
    const val = input?.value?.trim();
    if (!val) return;

    if (!this._config.customKeywords) this._config.customKeywords = [];

    const exists = this._config.customKeywords.some(
      e => e.keyword.toLowerCase() === val.toLowerCase()
    );
    if (exists) {
      input.value = '';
      return;
    }

    const aliases = [];
    const lower = val.toLowerCase().replace(/\s+/g, '');
    if (lower !== val) aliases.push(lower);

    this._config.customKeywords.push({
      keyword: val,
      aliases: aliases,
      addedAt: Date.now(),
    });

    this._save();
    this._renderCustomKeywords();
    input.value = '';
    emit('config:updated', { type: 'customKeywords' });
  },

  _removeCustomKeyword(index) {
    if (!this._config.customKeywords) return;
    this._config.customKeywords.splice(index, 1);
    this._save();
    this._renderCustomKeywords();
    emit('config:updated', { type: 'customKeywords' });
  },

  _renderCustomKeywords() {
    const container = this._el?.querySelector('#cs-custom-list');
    if (!container) return;

    const keywords = this._config.customKeywords || [];

    if (keywords.length === 0) {
      container.innerHTML = `<div class="cs-custom-empty">${t('customEmpty')}</div>`;
      return;
    }

    container.innerHTML = keywords.map((entry, i) => `
      <div class="cs-custom-item">
        <span class="cs-custom-kw">${escapeHtml(entry.keyword)}</span>
        ${entry.aliases && entry.aliases.length > 0
          ? `<span class="cs-custom-aliases">${entry.aliases.map(a => escapeHtml(a)).join(', ')}</span>`
          : ''}
        <button class="cs-custom-del" data-index="${i}" title="${t('customDelete')}">x</button>
      </div>
    `).join('');

    container.querySelectorAll('.cs-custom-del').forEach(btn => {
      btn.addEventListener('click', () => {
        this._removeCustomKeyword(parseInt(btn.dataset.index, 10));
      });
    });
  },

  _exportCustomKeywords() {
    const keywords = this._config.customKeywords || [];
    const data = JSON.stringify(keywords, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cybershield-custom-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  _importCustomKeywords() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (!Array.isArray(imported)) throw new Error('Invalid format');

          const existing = this._config.customKeywords || [];
          const existingNames = new Set(existing.map(e => e.keyword.toLowerCase()));

          let added = 0;
          for (const entry of imported) {
            if (entry.keyword && !existingNames.has(entry.keyword.toLowerCase())) {
              existing.push(entry);
              existingNames.add(entry.keyword.toLowerCase());
              added++;
            }
          }

          this._config.customKeywords = existing;
          this._save();
          this._renderCustomKeywords();
          emit('config:updated', { type: 'customKeywords' });

          console.log(`[CyberShield] Imported ${added} custom keywords`);
        } catch (err) {
          console.error('[CyberShield] Import failed:', err);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  },

  // ── Feed（第一页面底部迷你预览） ──────────────────────────────────────

  _addFeedEntry(data) {
    const container = this._el.querySelector('#cs-feed-body');
    if (!container) return;

    const empty = container.querySelector('.cs-feed-empty');
    if (empty) empty.remove();

    const colors = { safe: '#22c55e', suspicious: '#f59e0b', toxic: '#ef4444' };
    const labels = { safe: t('feedSafe'), suspicious: t('feedSuspicious'), toxic: t('feedToxic') };
    const color = colors[data.verdict] || '#888';
    const label = labels[data.verdict] || data.verdict;

    // 内容类型标签
    const typeColors = { comment: '#2563eb', reply: '#8b5cf6', message: '#f59e0b' };
    const typeLabels = { comment: t('typeComment'), reply: t('typeReply'), message: t('typeMessage') };
    const contentType = data.contentType || 'comment';
    const typeColor = typeColors[contentType] || '#888';
    const typeLabel = typeLabels[contentType] || contentType;

    const entry = document.createElement('div');
    entry.className = 'cs-feed-item';
    entry.style.borderLeftColor = color;
    entry.innerHTML = `
      <span class="cs-feed-dot" style="background:${color}"></span>
      <span class="cs-feed-user">${escapeHtml(data.username || '?')}</span>
      <span class="cs-feed-type-tag" style="background:${typeColor}15;color:${typeColor}">${typeLabel}</span>
      <span class="cs-feed-tag" style="background:${color}15;color:${color}">${label}</span>
      <span class="cs-feed-text">${escapeHtml(data.text.slice(0, 60))}</span>
    `;

    container.insertBefore(entry, container.firstChild);

    while (container.children.length > 8) {
      container.lastChild.remove();
    }
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
          <span>${t('modalTitle')} (${log.length})</span>
          <button id="cs-modal-close">x</button>
        </div>
        <div class="cs-modal-body">
          ${log.length === 0
            ? `<p class="cs-empty">${t('emptyLog')}</p>`
            : log.slice(0, 50).map(entry => {
              const typeColors = { comment: '#2563eb', reply: '#8b5cf6', message: '#f59e0b' };
              const typeLabels = { comment: t('typeComment'), reply: t('typeReply'), message: t('typeMessage') };
              const contentType = entry.contentType || 'comment';
              const typeColor = typeColors[contentType] || '#888';
              const typeLabel = typeLabels[contentType] || contentType;
              return `
              <div class="cs-entry">
                <div class="cs-entry-meta">
                  <span class="cs-entry-user">@${entry.username}</span>
                  <span class="cs-entry-type" style="background:${typeColor}15;color:${typeColor}">${typeLabel}</span>
                  <span class="cs-entry-verdict cs-verdict-${entry.verdict}">${entry.verdict}</span>
                  <span class="cs-entry-time">${new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <div class="cs-entry-text">${escapeHtml(entry.text || '')}</div>
                <div class="cs-entry-url"><a href="${entry.url}" target="_blank">${entry.url?.slice(0, 60)}</a></div>
              </div>
            `}).join('')
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
      // ★ 修复：先设置 left/top 再清除 right/bottom，防止面板瞬间丢失定位
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
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

  _runDiagnose() {
    const selectors = [
      '.reply-item', '.sub-reply-item', '.comment-item',
      '.comment-item-container', 'bili-comment-thread-renderer',
      'bili-comment-renderer', 'bili-rich-text',
      '[class*="reply"]', '[class*="comment"]',
      '[class*="Reply"]', '[class*="Comment"]',
      '[data-testid*="comment"]', '[aria-label*="comment"]',
    ];
    console.log('%c[CyberShield Diagnosis]', 'font-size:16px;font-weight:bold;color:#60a5fa');
    console.log('URL:', location.href);
    console.log('Platform:', this._config?.platform?.name || 'unknown');
    for (const sel of selectors) {
      const n = document.querySelectorAll(sel).length;
      if (n > 0) {
        const sample = document.querySelector(sel);
        console.log(`  "${sel}" -> ${n} matches, sample:`, sample.className?.slice(0, 100), sample);
      }
    }
    console.log('%cCheck the console output above', 'color:#22c55e');
  },
};

// ─── HTML 模板 ────────────────────────────────────────────────────────────────

function PANEL_HTML(config) {
  return `
    <div id="cs-drag-handle">
      <button id="cs-toggle" title="CyberShield">&#x1F6E1;</button>
      <span id="cs-status-dot" class="cs-dot ${config.enabled ? 'cs-dot-on' : 'cs-dot-off'}"></span>
    </div>
    <div id="cs-body">
      <div class="cs-panel-header">
        <span class="cs-panel-title">${t('panelTitle')}</span>
        <span class="cs-panel-badge">v0.5</span>
        <button id="cs-lang-btn" class="cs-lang-btn" title="${t('langSwitchHint')}">${t('langSwitch')}</button>
      </div>

      <!-- ── 页面切换 Tab ──────────────────────────────────────────── -->
      <div class="cs-tabs">
        <button id="cs-tab-1" class="cs-tab cs-tab-active">${t('tabControl')}</button>
        <button id="cs-tab-2" class="cs-tab">${t('tabLog')}</button>
      </div>

      <!-- ── 第一页面：控制面板 ──────────────────────────────────────── -->
      <div id="cs-page-1">

        <!-- ── 运行状态 + 控制按钮 ───────────────────────────────────── -->
        <div class="cs-stats-card">
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('statPlatform')}</span>
            <span class="cs-stats-val" id="cs-stat-platform">--</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('statStatus')}</span>
            <span class="cs-stats-val cs-stats-state">
              <span class="cs-stat-dot cs-stat-dot-off" id="cs-stat-state-dot"></span>
              <span id="cs-stat-state">--</span>
            </span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('statScanned')}</span>
            <span class="cs-stats-val" id="cs-stat-scanned">0</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('statFiltered')}</span>
            <span class="cs-stats-val cs-stats-filtered" id="cs-stat-filtered">0</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('spamBlocked')}</span>
            <span class="cs-stats-val cs-stats-spam" id="cs-stat-spam">0</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('statRules')}</span>
            <span class="cs-stats-val" id="cs-stat-rules">0</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('statLastScan')}</span>
            <span class="cs-stats-val" id="cs-stat-time">--:--:--</span>
          </div>
          <div class="cs-stats-row cs-stats-obs">
            <span class="cs-stats-label">${t('statObserver')}</span>
            <span class="cs-stat-micro-dot cs-stat-dot-off" id="cs-stat-obs-dot"></span>
          </div>
        </div>

        <!-- ── 脚本操作按钮 ─────────────────────────────────────────── -->
        <div class="cs-control-btns">
          <button id="cs-btn-stop" class="cs-btn cs-btn-danger">${t('btnStop')}</button>
          <button id="cs-btn-start" class="cs-btn cs-btn-success" style="display:none">${t('btnStart')}</button>
          <button id="cs-btn-manual-scan" class="cs-btn cs-btn-accent">${t('btnScan')}</button>
        </div>
        <div class="cs-scan-hint">${t('scanHint')}</div>

        <div class="cs-divider"></div>

        <!-- ── 基础控制 ─────────────────────────────────────────────── -->
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
          <button id="cs-evidence-btn" class="cs-btn">${t('evidence')}</button>
          <button id="cs-export-btn" class="cs-btn">${t('export')}</button>
          <button id="cs-diagnose-btn" class="cs-btn cs-btn-sm">${t('diagnose')}</button>
        </div>

        <div class="cs-divider"></div>

        <!-- ── 自定义关键词 ─────────────────────────────────────────── -->
        <div class="cs-section-header">
          <span>${t('customTitle')}</span>
        </div>
        <div class="cs-custom-input-row">
          <input type="text" id="cs-custom-input" class="cs-input" placeholder="${t('customPlaceholder')}">
          <button id="cs-custom-add-btn" class="cs-btn cs-btn-sm">${t('customAdd')}</button>
        </div>
        <div id="cs-custom-list">
          <div class="cs-custom-empty">${t('customEmpty')}</div>
        </div>
        <div class="cs-btn-row">
          <button id="cs-custom-import-btn" class="cs-btn">${t('customImport')}</button>
          <button id="cs-custom-export-btn" class="cs-btn">${t('customExport')}</button>
        </div>

        <div class="cs-divider"></div>

        <!-- ── 迷你 Feed 预览 ─────────────────────────────────────── -->
        <div class="cs-feed-header">
          <span>${t('recentScan')}</span>
          <span id="cs-feed-status" class="cs-feed-status"></span>
        </div>
        <div id="cs-feed-body">
          <div class="cs-feed-empty">${t('feedEmpty')}</div>
        </div>
      </div>

      <!-- ── 第二页面：扫描日志 ──────────────────────────────────────── -->
      <div id="cs-page-2" style="display:none">
        <div class="cs-log-header">
          <span class="cs-log-title">${t('logTitle')}</span>
          <span class="cs-log-count-badge" id="cs-log-count">0</span>
        </div>
        <div class="cs-control-btns">
          <button id="cs-log-manual-scan" class="cs-btn cs-btn-accent cs-btn-sm">${t('btnScan')}</button>
          <button id="cs-block-all-btn" class="cs-btn cs-btn-danger cs-btn-sm">${t('blockAll')}</button>
        </div>
        <div class="cs-scan-hint">${t('scanHint')}</div>
        <div id="cs-log-list">
          <div class="cs-log-empty">${t('logEmpty')}</div>
        </div>
      </div>
    </div>
  `;
}

// ─── CSS ────────────────────────────────────────────────────────────────────

const PANEL_CSS = `
  /* ★ CSS 变量作用域在 #cs-panel 下，避免被 Twitter 等站点的 :root 覆盖 */
  #cs-panel {
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
    --cs-danger: #ef4444;
    --cs-success: #10b981;
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
    #cs-panel {
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
      --cs-danger: #f87171;
      --cs-success: #34d399;
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

  /* ★ 面板根元素：强制覆盖外部站点样式（Twitter 等） */
  #cs-panel, #cs-panel * {
    box-sizing: border-box !important;
    line-height: 1.5 !important;
  }

  /* ★ 重置面板内 input/select 元素，防止外部站点 CSS 覆盖 */
  #cs-panel input, #cs-panel select {
    font-family: inherit !important;
    font-size: inherit !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    outline: none !important;
  }

  #cs-panel {
    position: fixed !important;
    bottom: 20px;
    right: 20px;
    width: 280px;
    min-width: 280px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
    font-size: 13px !important;
    user-select: none;
    background: var(--cs-bg-body) !important;
    color: var(--cs-text) !important;
    border-radius: 12px;
    box-shadow: 0 4px 24px var(--cs-shadow);
    border: 1px solid var(--cs-border);
    overflow: hidden;
  }

  #cs-panel.cs-collapsed { width: 280px; }
  #cs-panel.cs-collapsed #cs-body { display: none; }

  #cs-drag-handle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: grab;
    justify-content: flex-end;
    width: 100%;
  }

  #cs-drag-handle:active { cursor: grabbing; }

  #cs-toggle {
    width: 42px; height: 42px;
    border-radius: 50%;
    border: 2px solid var(--cs-accent);
    background: var(--cs-bg);
    font-size: 18px;
    cursor: pointer;
    box-shadow: 0 2px 12px var(--cs-shadow);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    display: flex; align-items: center; justify-content: center;
    padding: 0;
  }

  #cs-toggle:hover {
    transform: scale(1.12);
    box-shadow: 0 4px 20px var(--cs-shadow);
  }

  .cs-dot {
    width: 8px; height: 8px;
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
    width: 280px;
    box-shadow: 0 6px 30px var(--cs-shadow);
    border: 1px solid var(--cs-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: csFadeIn 0.2s ease;
    max-height: 80vh;
    overflow-y: auto;
  }

  @keyframes csFadeIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .cs-panel-header {
    display: flex; align-items: center; justify-content: space-between;
  }

  .cs-panel-title {
    font-weight: 700; font-size: 14px;
    color: var(--cs-accent); letter-spacing: 0.3px;
  }

  .cs-panel-badge {
    font-size: 10px; color: var(--cs-text-secondary);
    background: var(--cs-bg-body); padding: 1px 6px; border-radius: 8px;
  }

  .cs-lang-btn {
    margin-left: auto;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid var(--cs-border);
    border-radius: 8px;
    background: var(--cs-bg);
    color: var(--cs-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
    line-height: 1.4;
  }
  .cs-lang-btn:hover {
    background: var(--cs-accent);
    color: #fff;
    border-color: var(--cs-accent);
  }

  /* ── 页面切换 Tab ─────────────────────────────────────────────── */

  .cs-tabs {
    display: flex;
    gap: 0;
    border: 1px solid var(--cs-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .cs-tab {
    flex: 1;
    padding: 6px 0;
    border: none;
    background: var(--cs-bg-body);
    color: var(--cs-text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .cs-tab-active {
    background: var(--cs-accent);
    color: #fff;
  }

  .cs-tab:not(.cs-tab-active):hover {
    background: color-mix(in srgb, var(--cs-accent) 15%, var(--cs-bg-body));
    color: var(--cs-accent);
  }

  /* ── 状态面板 ─────────────────────────────────────────────────── */

  .cs-stats-card {
    background: var(--cs-bg-body);
    border: 1px solid var(--cs-border);
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .cs-stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
  }

  .cs-stats-label { color: var(--cs-text-secondary); }

  .cs-stats-val {
    color: var(--cs-text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .cs-stats-filtered { color: var(--cs-toxic-text); }
  .cs-stats-spam { color: #f59e0b; }

  .cs-stats-state {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .cs-stat-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .cs-stat-dot-on {
    background: var(--cs-toggle-on);
    box-shadow: 0 0 5px var(--cs-toggle-on);
  }

  .cs-stat-dot-off { background: var(--cs-text-secondary); }

  .cs-stat-dot-wait {
    background: #f59e0b;
    box-shadow: 0 0 5px #f59e0b;
    animation: csPulse 1.2s ease-in-out infinite;
  }

  @keyframes csPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .cs-stats-obs {
    padding-top: 4px;
    border-top: 1px solid var(--cs-divider);
  }

  .cs-stat-micro-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    display: inline-block;
  }

  /* ── 脚本控制按钮 ─────────────────────────────────────────────── */

  .cs-control-btns {
    display: flex;
    gap: 6px;
  }

  .cs-btn-danger {
    background: var(--cs-danger) !important;
    color: #fff !important;
    border-color: var(--cs-danger) !important;
    flex: 1;
  }

  .cs-btn-danger:hover {
    background: color-mix(in srgb, var(--cs-danger) 85%, #000) !important;
  }

  .cs-btn-success {
    background: var(--cs-success) !important;
    color: #fff !important;
    border-color: var(--cs-success) !important;
    flex: 1;
  }

  .cs-btn-success:hover {
    background: color-mix(in srgb, var(--cs-success) 85%, #000) !important;
  }

  .cs-btn-accent {
    background: var(--cs-accent) !important;
    color: #fff !important;
    border-color: var(--cs-accent) !important;
    flex: 1;
  }

  .cs-btn-accent:hover {
    background: var(--cs-accent-hover) !important;
  }

  .cs-btn-accent:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cs-scan-hint {
    font-size: 10px;
    color: var(--cs-text-secondary);
    line-height: 1.3;
    padding: 2px 0;
  }

  /* ── 基础控件 ─────────────────────────────────────────────────── */

  .cs-label { font-size: 13px; color: var(--cs-text); }
  .cs-label-sm { font-size: 12px; }

  .cs-toggle-row, .cs-select-row {
    display: flex; align-items: center; justify-content: space-between;
  }

  .cs-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
  .cs-switch input { opacity: 0; width: 0; height: 0; }

  .cs-slider {
    position: absolute; cursor: pointer; inset: 0;
    background: var(--cs-toggle-bg); border-radius: 20px;
    transition: background 0.25s;
  }

  .cs-slider::before {
    content: ''; position: absolute;
    left: 2px; top: 2px; width: 16px; height: 16px;
    border-radius: 50%; background: #fff;
    transition: transform 0.25s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }

  .cs-switch input:checked + .cs-slider { background: var(--cs-toggle-on); }
  .cs-switch input:checked + .cs-slider::before { transform: translateX(16px); }

  .cs-select {
    background: var(--cs-input-bg);
    border: 1px solid var(--cs-input-border);
    color: var(--cs-text);
    border-radius: 6px; padding: 3px 8px;
    font-size: 12px; max-width: 100px;
    outline: none; cursor: pointer;
  }

  .cs-select:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
  }

  .cs-api-row { display: flex; flex-direction: column; gap: 4px; }

  .cs-input {
    background: var(--cs-input-bg);
    border: 1px solid var(--cs-input-border);
    color: var(--cs-text);
    border-radius: 6px; padding: 5px 8px;
    font-size: 12px; outline: none;
    width: 100%; box-sizing: border-box;
  }

  .cs-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 2px rgba(37,99,235,0.15);
  }

  .cs-hint { font-size: 10px; color: var(--cs-text-secondary); line-height: 1.3; }

  .cs-divider { height: 1px; background: var(--cs-divider); margin: 2px 0; }

  .cs-btn-row { display: flex; gap: 6px; }

  .cs-btn {
    flex: 1; padding: 6px 8px;
    border: 1px solid var(--cs-border) !important;
    border-radius: 8px;
    background: var(--cs-bg-body) !important;
    color: var(--cs-text) !important;
    cursor: pointer; font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .cs-btn:hover {
    background: var(--cs-accent) !important; color: #fff !important;
    border-color: var(--cs-accent) !important;
  }

  .cs-btn-sm { flex: 0 0 auto; padding: 5px 12px; }

  /* ── 自定义关键词 ─────────────────────────────────────────────── */

  .cs-section-header {
    font-size: 11px; font-weight: 600;
    color: var(--cs-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cs-custom-input-row { display: flex; gap: 6px; }
  .cs-custom-input-row .cs-input { flex: 1; }

  #cs-custom-list {
    max-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cs-custom-empty {
    font-size: 11px; color: var(--cs-text-secondary);
    text-align: center; padding: 8px 0;
  }

  .cs-custom-item {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px;
    background: var(--cs-bg-body);
    border-radius: 6px;
    font-size: 11px;
  }

  .cs-custom-kw { color: var(--cs-text); font-weight: 600; flex-shrink: 0; }

  .cs-custom-aliases {
    color: var(--cs-text-secondary);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1; min-width: 0;
  }

  .cs-custom-del {
    background: none; border: none;
    color: var(--cs-text-secondary);
    cursor: pointer; font-size: 12px;
    padding: 0 2px; line-height: 1;
    flex-shrink: 0; border-radius: 3px;
  }

  .cs-custom-del:hover {
    color: var(--cs-toxic-text);
    background: var(--cs-toxic-bg);
  }

  /* ── 迷你 Feed 预览 ───────────────────────────────────────────── */

  .cs-feed-header {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600;
    color: var(--cs-text-secondary);
  }

  .cs-feed-status {
    flex: 1; font-size: 10px;
    font-weight: 400;
  }

  #cs-feed-body {
    display: flex; flex-direction: column; gap: 3px;
    max-height: 120px; overflow-y: auto;
  }

  .cs-feed-empty {
    font-size: 11px; color: var(--cs-text-secondary);
    text-align: center; padding: 8px 0;
  }

  .cs-feed-item {
    display: flex; align-items: center; gap: 5px;
    padding: 3px 6px;
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

  .cs-feed-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  .cs-feed-user {
    color: var(--cs-accent); font-weight: 600; flex-shrink: 0;
    max-width: 50px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }

  .cs-feed-tag {
    font-size: 9px; font-weight: 600;
    padding: 0 4px; border-radius: 6px; flex-shrink: 0;
  }

  .cs-feed-type-tag {
    font-size: 9px; font-weight: 600;
    padding: 0 4px; border-radius: 6px; flex-shrink: 0;
  }

  .cs-feed-text {
    color: var(--cs-text-secondary); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
    flex: 1; min-width: 0;
  }

  /* ── 第二页面：扫描日志 ─────────────────────────────────────── */

  .cs-log-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cs-log-title {
    font-weight: 700;
    font-size: 14px;
    color: var(--cs-accent);
  }

  .cs-log-count-badge {
    font-size: 10px;
    color: var(--cs-text-secondary);
    background: var(--cs-bg-body);
    padding: 1px 6px;
    border-radius: 8px;
  }

  #cs-log-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: calc(80vh - 120px);
    overflow-y: auto;
  }

  .cs-log-empty {
    font-size: 12px; color: var(--cs-text-secondary);
    text-align: center; padding: 20px 0;
  }

  .cs-log-item {
    border: 1px solid var(--cs-entry-border);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--cs-entry-bg);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cs-log-header-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cs-log-user {
    color: var(--cs-accent);
    font-weight: 600;
    font-size: 11px;
  }

  .cs-log-verdict {
    font-size: 9px; font-weight: 600;
    padding: 1px 6px; border-radius: 6px;
  }

  .cs-log-type {
    font-size: 9px; font-weight: 600;
    padding: 1px 6px; border-radius: 6px;
  }

  .cs-log-time {
    color: var(--cs-text-secondary);
    font-size: 10px;
    margin-left: auto;
  }

  .cs-log-text {
    color: var(--cs-text);
    font-size: 12px;
    line-height: 1.4;
    word-break: break-all;
  }

  .cs-log-reason {
    color: var(--cs-text-secondary);
    font-size: 10px;
  }

  /* ── Modal ─────────────────────────────────────────────────────── */

  #cs-modal {
    position: fixed; inset: 0;
    z-index: 2147483646;
    background: var(--cs-modal-overlay);
    display: flex; align-items: center; justify-content: center;
    animation: csFadeIn 0.2s ease;
  }

  .cs-modal-inner {
    background: var(--cs-bg); border-radius: 14px;
    width: 560px; max-height: 70vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 40px var(--cs-shadow);
    border: 1px solid var(--cs-border);
  }

  .cs-modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--cs-divider);
    color: var(--cs-text); font-weight: 700; font-size: 14px;
  }

  .cs-modal-header button {
    background: none; border: none;
    color: var(--cs-text-secondary); cursor: pointer;
    font-size: 16px; padding: 4px; border-radius: 4px;
  }

  .cs-modal-header button:hover { background: var(--cs-bg-body); }

  .cs-modal-body {
    overflow-y: auto; padding: 12px 18px;
    display: flex; flex-direction: column; gap: 10px;
  }

  .cs-entry {
    border: 1px solid var(--cs-entry-border);
    border-radius: 8px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 4px;
    background: var(--cs-entry-bg);
  }

  .cs-entry-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; }
  .cs-entry-user { color: var(--cs-accent); font-weight: 600; }
  .cs-entry-verdict { padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .cs-entry-type { padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .cs-verdict-toxic { background: var(--cs-toxic-bg); color: var(--cs-toxic-text); }
  .cs-verdict-suspicious { background: var(--cs-suspicious-bg); color: var(--cs-suspicious-text); }
  .cs-entry-time { color: var(--cs-text-secondary); margin-left: auto; font-size: 10px; }
  .cs-entry-text { color: var(--cs-text); font-size: 12px; line-height: 1.4; word-break: break-all; }
  .cs-entry-url a { color: var(--cs-text-secondary); font-size: 10px; text-decoration: none; opacity: 0.6; }
  .cs-entry-url a:hover { opacity: 1; }
  .cs-empty { color: var(--cs-text-secondary); text-align: center; padding: 30px 0; font-size: 13px; }
`;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}