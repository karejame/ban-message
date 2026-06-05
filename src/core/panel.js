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
    // ★ _blockedSet 现由 Blocker 统一管理，Panel 通过 getter 访问
    this._inject();
    this._bind();
    this._listen();
  },

  /** 访问 blocker 的已拉黑集合 */
  get _blockedSet() {
    return this._scannerRef?.blocker?._blockedSet || new Set();
  },

  _persistBlocked() {
    if (this._scannerRef?.blocker) {
      this._scannerRef.blocker._persistBlocked();
    }
  },

  // ── 页面切换 ─────────────────────────────────────────────────────────────

  _switchPage(pageNum) {
    this._currentPage = pageNum;
    const page1 = this._el.querySelector('#cs-page-1');
    const page2 = this._el.querySelector('#cs-page-2');
    const page3 = this._el.querySelector('#cs-page-3');
    const tab1 = this._el.querySelector('#cs-tab-1');
    const tab2 = this._el.querySelector('#cs-tab-2');
    const tab3 = this._el.querySelector('#cs-tab-3');

    // Hide all pages first
    if (page1) page1.style.display = 'none';
    if (page2) page2.style.display = 'none';
    if (page3) page3.style.display = 'none';

    // Remove active from all tabs
    if (tab1) tab1.classList.remove('cs-tab-active');
    if (tab2) tab2.classList.remove('cs-tab-active');
    if (tab3) tab3.classList.remove('cs-tab-active');

    // Show selected page and activate tab
    if (pageNum === 1) {
      if (page1) page1.style.display = '';
      if (tab1) tab1.classList.add('cs-tab-active');
    } else if (pageNum === 2) {
      if (page2) page2.style.display = '';
      if (tab2) tab2.classList.add('cs-tab-active');
      // 切到日志页时渲染最新日志
      this._renderScanLog();
    } else if (pageNum === 3) {
      if (page3) page3.style.display = '';
      if (tab3) tab3.classList.add('cs-tab-active');
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

    // ★ 恢复上次保存的位置，若无则默认右下角
    const restored = this._restorePosition();
    if (!restored) {
      // 默认位置：右下角，用 left/top 定位
      el.style.left = `${window.innerWidth - 62}px`;
      el.style.top = `${window.innerHeight - 62}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }

    this._setCollapsed(true);
    this._switchPage(1);
  },

  _bind() {
    const el = this._el;

    // ── 页面切换 Tab ──────────────────────────────────────────────────────
    // ★ 多重事件绑定确保 tab 切换万无一失
    const tab1 = el.querySelector('#cs-tab-1');
    const tab2 = el.querySelector('#cs-tab-2');
    const tab3 = el.querySelector('#cs-tab-3');
    if (tab1) {
      tab1.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._switchPage(1);
      });
      // 备用 onclick：即使 addEventListener 被干扰，onclick 也能触发
      tab1.onclick = (e) => {
        e.preventDefault();
        this._switchPage(1);
      };
    }
    if (tab2) {
      tab2.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._switchPage(2);
      });
      tab2.onclick = (e) => {
        e.preventDefault();
        this._switchPage(2);
      };
    }
    if (tab3) {
      tab3.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._switchPage(3);
      });
      tab3.onclick = (e) => {
        e.preventDefault();
        this._switchPage(3);
      };
    }

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

    el.querySelector('#cs-rules-view-btn').addEventListener('click', () => {
      this._showRulesModal();
    });

    el.querySelector('#cs-export-btn').addEventListener('click', () => {
      this._evidence.exportJSON();
    });

    el.querySelector('#cs-diagnose-btn').addEventListener('click', () => {
      this._runDiagnose();
    });

    // ── 系统状态刷新 ──────────────────────────────────────────────────
    el.querySelector('#cs-sys-refresh')?.addEventListener('click', () => {
      this._refreshSystemStatus();
    });

    // ── 自定义关键词管理 ──────────────────────────────────────────────────
    el.querySelector('#cs-custom-add-btn')?.addEventListener('click', () => {
      this._addCustomKeyword();
    });

    el.querySelector('#cs-custom-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this._addCustomKeyword(); }
    });
    el.querySelector('#cs-custom-clear-btn')?.addEventListener('click', () => {
      this._clearAllCustomKeywords();
    });
    el.querySelector('#cs-custom-import-btn')?.addEventListener('click', () => {
      this._importCustomKeywords();
    });

    el.querySelector('#cs-custom-export-btn')?.addEventListener('click', () => {
      this._exportCustomKeywords();
    });

    // ── 日志页手动扫描按钮 ──────────────────────────────────────────────
    el.querySelector('#cs-log-manual-scan')?.addEventListener('click', () => this._manualScan());

    // ── 拉黑选中 / 取消拉黑 ──────────────────────────────────────────
    el.querySelector('#cs-block-selected-btn')?.addEventListener('click', () => this._blockSelected());
    el.querySelector('#cs-unblock-selected-btn')?.addEventListener('click', () => this._unblockSelected());

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
   * 拉黑选中的用户。
   * 遍历日志列表中勾选的checkbox，逐个调用 blocker.block()。
   * ★ 去重：同一用户只拉黑一次，避免多次请求。
   */
  _blockSelected() {
    if (!this._scannerRef) {
      console.warn('[CyberShield] No scanner reference for block-selected');
      return;
    }

    const checks = this._el.querySelectorAll('.cs-log-check:checked');
    if (checks.length === 0) {
      GM_notification({
        title: '🛡️ CyberShield',
        text: t('noUserSelected'),
      });
      return;
    }

    // ★ 去重：同一用户只处理一次
    const toBlock = new Map(); // username → uid
    for (const cb of checks) {
      const username = cb.dataset.username;
      const uid = cb.dataset.uid;
      if (!toBlock.has(username)) {
        toBlock.set(username, uid);
      }
    }

    let blocked = 0;
    for (const [username, uid] of toBlock) {
      // ★ 跳过已拉黑的用户
      if (this._blockedSet.has(username)) {
        console.log(`[CyberShield] Skip already-blocked: @${username}`);
        continue;
      }

      // 构造合成元素，包含 UID 信息
      let sourceEl;
      if (uid) {
        sourceEl = document.createElement('div');
        const fakeLink = document.createElement('a');
        fakeLink.href = `https://space.bilibili.com/${uid}`;
        sourceEl.appendChild(fakeLink);
        sourceEl.dataset.mid = uid;
      } else {
        sourceEl = document.body;
      }

      this._scannerRef.blocker.block(username, sourceEl);
      this._blockedSet.add(username);
      blocked++;
      console.log(`[CyberShield] Block-selected: @${username} (UID:${uid || 'unknown'})`);
    }

    this._persistBlocked();

    GM_notification({
      title: '🛡️ CyberShield',
      text: t('blockSelectedDone', { n: blocked }),
    });

    // 重新渲染日志列表以更新状态
    this._renderScanLog();
  },

  /**
   * 取消拉黑选中的用户。
   * 遍历日志列表中勾选的已拉黑用户的checkbox，逐个调用 blocker.unblock()。
   */
  _unblockSelected() {
    if (!this._scannerRef) {
      console.warn('[CyberShield] No scanner reference for unblock-selected');
      return;
    }

    // 只处理已拉黑用户的勾选
    const checks = this._el.querySelectorAll('.cs-log-check-blocked:checked');
    if (checks.length === 0) {
      GM_notification({
        title: '🛡️ CyberShield',
        text: t('noUserSelected'),
      });
      return;
    }

    let unblocked = 0;
    for (const cb of checks) {
      const username = cb.dataset.username;
      const uid = cb.dataset.uid;

      this._scannerRef.blocker.unblock(username, uid);
      this._blockedSet.delete(username);
      unblocked++;
      console.log(`[CyberShield] Unblock-selected: @${username} (UID:${uid || 'unknown'})`);
    }

    this._persistBlocked();

    GM_notification({
      title: '🛡️ CyberShield',
      text: t('unblockSelectedDone', { n: unblocked }),
    });

    // 重新渲染日志列表以更新状态
    this._renderScanLog();
  },

  /**
   * 全选/取消全选所有toxic用户checkbox
   */
  _toggleSelectAll(e) {
    const selectAllChecked = e.target.checked;
    const toxicChecks = this._el.querySelectorAll('.cs-log-check');
    for (const cb of toxicChecks) {
      cb.checked = selectAllChecked;
    }
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
    // ★ 展开/折叠时保持按钮左边缘位置不变
    this._anchorOnToggle(collapsed);
  },

  /** 展开/折叠时以按钮左边缘为锚点，面板向右展开 */
  _anchorOnToggle(collapsed) {
    const el = this._el;
    const rect = el.getBoundingClientRect();

    if (collapsed) {
      // 折叠时：记录当前左边缘位置
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else {
      // 展开时：以按钮左边缘为锚点，面板向右展开
      const toggleEl = el.querySelector('#cs-toggle');
      const toggleRect = toggleEl.getBoundingClientRect();
      el.style.left = `${toggleRect.left}px`;
      el.style.top = `${toggleRect.top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }

    // ★ 持久化位置
    this._savePosition();
  },

  /** 保存面板位置到 GM 存储 */
  _savePosition() {
    const rect = this._el.getBoundingClientRect();
    GM_setValue('cs_panel_pos', JSON.stringify({ left: rect.left, top: rect.top }));
  },

  /** 从 GM 存储恢复面板位置，返回是否成功 */
  _restorePosition() {
    try {
      const saved = GM_getValue('cs_panel_pos', null);
      if (saved) {
        const { left, top } = JSON.parse(saved);
        // 确保位置在可视区域内
        const clampedLeft = Math.max(0, Math.min(left, window.innerWidth - 50));
        const clampedTop = Math.max(0, Math.min(top, window.innerHeight - 50));
        this._el.style.left = `${clampedLeft}px`;
        this._el.style.top = `${clampedTop}px`;
        this._el.style.right = 'auto';
        this._el.style.bottom = 'auto';
        return true;
      }
    } catch (e) {
      console.warn('[CyberShield] Failed to restore panel position:', e);
    }
    return false;
  },

  /** 刷新系统状态（远程词库、AI 用量、上下文规则） */
  _refreshSystemStatus() {
    const btn = this._el.querySelector('#cs-sys-refresh');
    if (btn) {
      btn.textContent = t('refreshing');
      btn.disabled = true;
    }

    // 收集并渲染状态
    this._renderSystemStatus();

    // 按钮恢复
    setTimeout(() => {
      if (btn) {
        btn.textContent = t('refresh');
        btn.disabled = false;
      }
    }, 2000);
  },

  /** 渲染系统状态信息 */
  _renderSystemStatus() {
    const scanner = this._scannerRef;
    if (!scanner) return;

    // 1. 远程词库状态
    const remoteEl = this._el.querySelector('#cs-sys-remote');
    if (remoteEl && scanner.ruleManager) {
      const status = scanner.ruleManager.getStatus();
      remoteEl.textContent = status.lastUpdate !== 'never'
        ? t('remoteUpdated', { time: status.lastUpdate })
        : t('remoteNever');
    }

    // 2. AI 用量
    const aiEl = this._el.querySelector('#cs-sys-ai');
    if (aiEl && scanner.aiAnalyzer) {
      const used = scanner.aiAnalyzer.getTodayUsage();
      const limit = scanner.aiAnalyzer.getDailyLimit();
      aiEl.textContent = `${t('aiUsed', { n: used })} / ${t('aiDailyLimit', { n: limit })}`;
      aiEl.style.color = used >= limit ? 'var(--cs-danger)' : '';
    }

    // 3. 上下文规则
    const ctxEl = this._el.querySelector('#cs-sys-context');
    if (ctxEl && scanner.detector) {
      const rules = scanner.detector.contextRuleEngine?.getAllRules() || [];
      ctxEl.textContent = t('contextRulesCount', { n: rules.length });
    }
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

    // 更新系统状态
    this._renderSystemStatus();
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

    const colors = { safe: '#22c55e', suspicious: '#f59e0b', toxic: '#ef4444' };
    const labels = { safe: t('feedSafe'), suspicious: t('feedSuspicious'), toxic: t('feedToxic') };
    const typeColors = { comment: '#2563eb', reply: '#8b5cf6', message: '#f59e0b' };
    const typeLabels = { comment: t('typeComment'), reply: t('typeReply'), message: t('typeMessage') };

    const hasToxic = this._scanLog.some(e => e.verdict === 'toxic');

    container.innerHTML = [
      // "全选" 行 — 仅在有toxic条目时显示
      hasToxic
        ? `<div class="cs-log-select-all">
            <input type="checkbox" id="cs-select-all-check" class="cs-log-check">
            <label for="cs-select-all-check">${t('selectAll')}</label>
          </div>`
        : '',
      ...this._scanLog.map(entry => {
        const color = colors[entry.verdict] || '#888';
        const label = labels[entry.verdict] || entry.verdict;
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const typeColor = typeColors[entry.contentType] || '#888';
        const typeLabel = typeLabels[entry.contentType] || entry.contentType;
        const isBlocked = this._blockedSet.has(entry.username);

        // 是否为 toxic（可被选中拉黑）
        const isToxic = entry.verdict === 'toxic';

        // 构建复选框 / 已拉黑标记
        let checkHtml = '';
        if (isToxic) {
          if (isBlocked) {
            checkHtml = `<input type="checkbox" class="cs-log-check-blocked" data-uid="${entry.uid || ''}" data-username="${escapeHtml(entry.username)}" checked>
              <span class="cs-blocked-badge">&#x2713; ${t('blockedBadge')}</span>`;
          } else {
            checkHtml = `<input type="checkbox" class="cs-log-check" data-uid="${entry.uid || ''}" data-username="${escapeHtml(entry.username)}">`;
          }
        }

        return `
        <div class="cs-log-item">
          <div class="cs-log-header">
            ${checkHtml}
            <span class="cs-log-user">@${escapeHtml(entry.username)}</span>
            <span class="cs-log-type" style="background:${typeColor}15;color:${typeColor}">${typeLabel}</span>
            <span class="cs-log-verdict" style="background:${color}15;color:${color}">${label}</span>
            <span class="cs-log-time">${time}</span>
          </div>
          <div class="cs-log-text">${escapeHtml(entry.text)}</div>
          ${entry.reason ? `<div class="cs-log-reason">${escapeHtml(entry.reason)}</div>` : ''}
        </div>
      `;
      }),
    ].join('');

    // 绑定"全选"事件
    const selectAllCheck = container.querySelector('#cs-select-all-check');
    if (selectAllCheck) {
      selectAllCheck.addEventListener('change', (e) => this._toggleSelectAll(e));
    }
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
    const entry = this._config.customKeywords[index];
    if (!entry) return;

    // 确认对话框
    if (!confirm(t('customDelConfirm', { keyword: entry.keyword }))) return;

    this._config.customKeywords.splice(index, 1);
    this._save();
    this._renderCustomKeywords();
    emit('config:updated', { type: 'customKeywords' });
  },

  _clearAllCustomKeywords() {
    const count = this._config.customKeywords?.length || 0;
    if (count === 0) return;

    if (!confirm(t('customClearAllConfirm', { n: count }))) return;

    this._config.customKeywords = [];
    this._save();
    this._renderCustomKeywords();
    emit('config:updated', { type: 'customKeywords' });
    console.log(`[CyberShield] ${t('customCleared')}`);
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

  _showRulesModal() {
    const existing = document.getElementById('cs-modal');
    if (existing) { existing.remove(); return; }

    const rules = this._scannerRef?.detector?.getAllRules() || {};
    const modal = document.createElement('div');
    modal.id = 'cs-modal';
    modal.innerHTML = `
      <div class="cs-modal-inner" style="max-width:800px;height:80vh">
        <div class="cs-modal-header">
          <span>${t('rulesTitle')}</span>
          <button id="cs-modal-close">x</button>
        </div>
        <div class="cs-modal-body" style="display:flex;flex-direction:column;height:100%">
          <div class="cs-rules-tabs">
            <button class="cs-rules-tab cs-rules-tab-active" data-tab="hard">${t('rulesHard')} (${rules.hardKeywords?.length || 0})</button>
            <button class="cs-rules-tab" data-tab="soft">${t('rulesSoft')} (${rules.softKeywords?.length || 0})</button>
            <button class="cs-rules-tab" data-tab="regex">${t('rulesRegex')} (${rules.regexPatterns?.length || 0})</button>
            <button class="cs-rules-tab" data-tab="custom">${t('rulesCustom')} (${rules.customKeywords?.length || 0})</button>
          </div>
          <div class="cs-rules-content">
            <div class="cs-rules-panel cs-rules-panel-active" id="cs-rules-hard">
              ${this._renderKeywordList(rules.hardKeywords || [])}
            </div>
            <div class="cs-rules-panel" id="cs-rules-soft">
              ${this._renderKeywordList(rules.softKeywords || [])}
            </div>
            <div class="cs-rules-panel" id="cs-rules-regex">
              ${this._renderRegexList(rules.regexPatterns || [])}
            </div>
            <div class="cs-rules-panel" id="cs-rules-custom">
              ${this._renderCustomList(rules.customKeywords || [])}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close handlers
    document.getElementById('cs-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Tab switching
    modal.querySelectorAll('.cs-rules-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.cs-rules-tab').forEach(t => t.classList.remove('cs-rules-tab-active'));
        modal.querySelectorAll('.cs-rules-panel').forEach(p => p.classList.remove('cs-rules-panel-active'));
        tab.classList.add('cs-rules-tab-active');
        modal.querySelector(`#cs-rules-${tab.dataset.tab}`).classList.add('cs-rules-panel-active');
      });
    });
  },

  _showEvidenceModal() {
    const existing = document.getElementById('cs-modal');
    if (existing) { existing.remove(); return; }

    const entries = this._evidence.getAll();
    const typeLbl = { comment: t('typeComment'), reply: t('typeReply'), message: t('typeMessage') };
    const modal = document.createElement('div');
    modal.id = 'cs-modal';
    modal.innerHTML = `
      <div class="cs-modal-inner">
        <div class="cs-modal-header">
          <span>${t('modalTitle')}</span>
          <span style="font-size:12px;color:var(--cs-text-secondary);font-weight:400">${t('entryCount', { n: entries.length })}</span>
          <button id="cs-modal-close">x</button>
        </div>
        <div class="cs-modal-body">
          ${entries.length === 0
            ? `<p class="cs-empty">${t('emptyLog')}</p>`
            : entries.slice(0, 100).map(e => `
              <div class="cs-entry">
                <div class="cs-entry-meta">
                  <span class="cs-entry-user">${escapeHtml(e.username)}</span>
                  <span class="cs-entry-verdict cs-verdict-${e.verdict || 'unknown'}">${e.verdict || '--'}</span>
                  ${e.contentType ? `<span class="cs-entry-type">${typeLbl[e.contentType] || e.contentType}</span>` : ''}
                  <span class="cs-entry-time">${new Date(e.timestamp).toLocaleString()}</span>
                </div>
                <div class="cs-entry-text">${escapeHtml(e.text || '')}</div>
                ${e.url ? `<div class="cs-entry-url"><a href="${escapeHtml(e.url)}" target="_blank">${escapeHtml(e.url)}</a></div>` : ''}
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

  _renderKeywordList(keywords) {
    if (!keywords || keywords.length === 0) return `<p class="cs-empty">${t('emptyLog')}</p>`;
    const sorted = [...keywords].sort();
    return `<div class="cs-keyword-list">${sorted.map(k => `<span class="cs-keyword-tag">${escapeHtml(k)}</span>`).join('')}</div>`;
  },

  _renderRegexList(patterns) {
    if (!patterns || patterns.length === 0) return `<p class="cs-empty">${t('emptyLog')}</p>`;
    return `<div class="cs-regex-list">${patterns.map(p => `<code class="cs-regex-item">${escapeHtml(p)}</code>`).join('')}</div>`;
  },

  _renderCustomList(customs) {
    if (!customs || customs.length === 0) return `<p class="cs-empty">${t('customEmpty')}</p>`;
    return customs.map(entry => `
      <div class="cs-custom-item">
        <span class="cs-custom-kw">${escapeHtml(entry.keyword)}</span>
        ${entry.aliases && entry.aliases.length > 0
          ? `<span class="cs-custom-aliases">${entry.aliases.map(a => escapeHtml(a)).join(', ')}</span>`
          : ''}
      </div>
    `).join('');
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

    document.addEventListener('mouseup', () => {
      if (dragging && didDrag) {
        // ★ 拖拽结束后保存位置
        this._savePosition();
      }
      dragging = false;
    });

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
        <span class="cs-panel-badge">v0.6</span>
        <button id="cs-lang-btn" class="cs-lang-btn" title="${t('langSwitchHint')}">${t('langSwitch')}</button>
      </div>

      <!-- ── 页面切换 Tab（固定在滚动区域外，始终可见） ────────────── -->
      <div class="cs-tabs">
        <button id="cs-tab-1" class="cs-tab cs-tab-active">${t('tabControl')}</button>
        <button id="cs-tab-2" class="cs-tab">${t('tabLog')}</button>
        <button id="cs-tab-3" class="cs-tab">${t('aboutTitle')}</button>
      </div>

      <!-- ── 可滚动内容区 ──────────────────────────────────────────── -->
      <div id="cs-content">

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
            <input type="checkbox" id="cs-ai-toggle" ${config.aiEnabled ? 'checked' : ''} disabled>
            <span class="cs-slider"></span>
          </label>
        </div>
        <div class="cs-hint cs-ai-disabled-hint">${t('aiDisabled')}</div>

        <div class="cs-api-row" id="cs-api-key-row" style="display:none">
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

        <!-- ── 系统状态 ─────────────────────────────────────────── -->
        <div class="cs-section-header" style="display:flex;justify-content:space-between;align-items:center">
          <span>${t('sysTitle')}</span>
          <button id="cs-sys-refresh" class="cs-btn cs-btn-xs cs-btn-ghost">${t('refresh')}</button>
        </div>
        <div id="cs-sys-status" class="cs-sys-status">
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('remoteRules')}</span>
            <span class="cs-stats-val" id="cs-sys-remote">--</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('aiUsage')}</span>
            <span class="cs-stats-val" id="cs-sys-ai">--</span>
          </div>
          <div class="cs-stats-row">
            <span class="cs-stats-label">${t('contextRules')}</span>
            <span class="cs-stats-val" id="cs-sys-context">--</span>
          </div>
        </div>

        <div class="cs-divider"></div>

        <!-- ── 屏蔽规则 ─────────────────────────────────────────── -->
        <div class="cs-section-header" style="display:flex;justify-content:space-between;align-items:center">
          <span>${t('rulesTitle')}</span>
          <button id="cs-rules-view-btn" class="cs-btn cs-btn-xs cs-btn-ghost">${t('view')}</button>
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
          <button id="cs-custom-clear-btn" class="cs-btn">${t('customClearAll')}</button>
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
          <button id="cs-block-selected-btn" class="cs-btn cs-btn-danger cs-btn-sm">${t('blockSelected')}</button>
          <button id="cs-unblock-selected-btn" class="cs-btn cs-btn-sm">${t('unblockSelected')}</button>
        </div>
        <div class="cs-scan-hint">${t('scanHint')}</div>
        <div id="cs-log-list">
          <div class="cs-log-empty">${t('logEmpty')}</div>
        </div>
      </div>

      <!-- ── 第三页面：关于 ──────────────────────────────────────────── -->
      <div id="cs-page-3" style="display:none">
        <div class="cs-about-section">
          <h3 class="cs-about-title">${t('aboutText', { ver: '0.6' })}</h3>
          <p class="cs-about-text">CyberShield 是一款浏览器插件，用于自动检测和屏蔽网络暴力、骚扰和恶意评论。</p>
        </div>

        <div class="cs-about-section">
          <h4 class="cs-about-subtitle">${t('privacyTitle')}</h4>
          <p class="cs-about-text">${t('privacyText')}</p>
        </div>

        <div class="cs-about-section">
          <h4 class="cs-about-subtitle">支持平台</h4>
          <p class="cs-about-text">Twitter/X、B站、Reddit、微博、YouTube、知乎、贴吧</p>
        </div>

        <div class="cs-about-section">
          <h4 class="cs-about-subtitle">功能特性</h4>
          <ul class="cs-about-list">
            <li>关键词检测（支持 28 种语言）</li>
            <li>行为信号分析（全大写、感叹号、emoji）</li>
            <li>自动拉黑（支持 API 和 DOM 模拟）</li>
            <li>取证记录（截图 + 日志）</li>
            <li>自定义关键词管理</li>
          </ul>
        </div>

        <div class="cs-about-section">
          <h4 class="cs-about-subtitle">${t('aboutGithub')}</h4>
          <a href="https://github.com/andykair55-byte/CivilityFilter.git" target="_blank" class="cs-about-link">https://github.com/andykair55-byte/CivilityFilter.git</a>
        </div>
      </div>
      </div><!-- /cs-content -->
    </div>
  `;
}

// ─── CSS ────────────────────────────────────────────────────────────────────

const PANEL_CSS = `
  /* ★ CSS 变量作用域在 #cs-panel 和 #cs-modal 下，避免被 Twitter 等站点的 :root 覆盖 */
  #cs-panel, #cs-modal {
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
    #cs-panel, #cs-modal {
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
  /* ★ 但排除 checkbox，保留原生复选框样式 */
  #cs-panel input:not([type="checkbox"]), #cs-panel select {
    font-family: inherit !important;
    font-size: inherit !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    outline: none !important;
  }

  /* ★ Checkbox 专用样式：确保可见且可交互 */
  #cs-panel input[type="checkbox"] {
    appearance: auto !important;
    -webkit-appearance: auto !important;
    width: 15px !important;
    height: 15px !important;
    margin: 0 !important;
    padding: 0 !important;
    cursor: pointer !important;
    accent-color: var(--cs-accent) !important;
    flex-shrink: 0 !important;
  }

  #cs-panel {
    position: fixed !important;
    left: auto;
    top: auto;
    right: auto;
    bottom: auto;
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
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 40px);
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                background 0.3s ease,
                border 0.3s ease,
                box-shadow 0.3s ease,
                border-radius 0.3s ease;
  }

  #cs-panel.cs-collapsed {
    width: auto;
    min-width: unset;
    background: transparent !important;
    border: none;
    box-shadow: none;
    border-radius: 50%;
    overflow: visible;
  }
  #cs-panel.cs-collapsed #cs-body { display: none; }
  #cs-panel.cs-collapsed .cs-tabs { display: none; }
  #cs-panel.cs-collapsed #cs-drag-handle { width: auto; }
  #cs-panel.cs-collapsed #cs-status-dot { display: none; }

  #cs-drag-handle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: grab;
    justify-content: flex-start;
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
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.25s ease,
                background 0.25s ease;
    display: flex; align-items: center; justify-content: center;
    padding: 0;
  }

  #cs-toggle:hover {
    transform: scale(1.12);
    box-shadow: 0 4px 20px var(--cs-shadow);
  }

  #cs-toggle:active {
    transform: scale(0.95);
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
    animation: csFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* ★ 可滚动内容区：只有页面内容滚动，tabs 始终可见 */
  #cs-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  @keyframes csFadeIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
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
    flex-shrink: 0;
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
    text-align: center;
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
  .cs-switch input:disabled + .cs-slider { opacity: 0.5; cursor: not-allowed; }
  .cs-switch input:disabled ~ .cs-slider::before { opacity: 0.6; }

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
  .cs-ai-disabled-hint { margin-top: -4px; font-style: italic; opacity: 0.7; }

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
  .cs-btn-xs { flex: 0 0 auto; padding: 2px 8px; font-size: 11px; }
  .cs-btn-ghost { background: none; border: none; color: var(--cs-accent); cursor: pointer; }
  .cs-btn-ghost:hover { text-decoration: underline; }

  /* ── 系统状态 ──────────────────────────────────────────────── */
  .cs-sys-status {
    padding: 4px 0;
  }

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

  /* ── 关于页面 ──────────────────────────────────────────────────── */

  .cs-about-section {
    margin-bottom: 20px;
  }

  .cs-about-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--cs-text);
    margin-bottom: 8px;
  }

  .cs-about-subtitle {
    font-size: 14px;
    font-weight: 600;
    color: var(--cs-text);
    margin-bottom: 6px;
  }

  .cs-about-text {
    font-size: 13px;
    color: var(--cs-text-secondary);
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .cs-about-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .cs-about-list li {
    font-size: 13px;
    color: var(--cs-text-secondary);
    line-height: 1.6;
    padding-left: 16px;
    position: relative;
  }

  .cs-about-list li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: var(--cs-accent);
  }

  .cs-about-link {
    color: var(--cs-accent);
    text-decoration: none;
    font-size: 13px;
  }

  .cs-about-link:hover {
    text-decoration: underline;
  }

  /* ── 日志页：复选框 / 已拉黑标记 / 全选行 ─────────────────────── */

  .cs-log-check, .cs-log-check-blocked {
    width: 16px; height: 16px;
    accent-color: var(--cs-accent);
    flex-shrink: 0;
    cursor: pointer;
  }

  .cs-blocked-badge {
    font-size: 9px; font-weight: 600;
    background: var(--cs-success);
    color: #fff;
    padding: 1px 6px;
    border-radius: 8px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .cs-log-select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--cs-bg-body);
    border: 1px solid var(--cs-border);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--cs-text-secondary);
    cursor: pointer;
  }

  .cs-log-select-all label {
    cursor: pointer;
    user-select: none;
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

  /* ── Rules Modal ───────────────────────────────────────────────── */
  .cs-rules-tabs {
    display: flex; gap: 8px; padding: 12px 18px;
    border-bottom: 1px solid var(--cs-divider);
  }

  .cs-rules-tab {
    background: none; border: none;
    padding: 6px 12px; border-radius: 6px;
    color: var(--cs-text-secondary); font-size: 12px;
    cursor: pointer; transition: all 0.2s;
  }

  .cs-rules-tab:hover { background: var(--cs-bg-body); color: var(--cs-text); }
  .cs-rules-tab-active {
    background: var(--cs-accent); color: #fff;
    font-weight: 600;
  }

  .cs-rules-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .cs-rules-panel {
    display: none; overflow-y: auto; padding: 16px 18px;
    flex: 1;
  }
  .cs-rules-panel-active { display: block; }

  .cs-keyword-list {
    display: flex; flex-wrap: wrap; gap: 6px;
  }

  .cs-keyword-tag {
    background: var(--cs-bg-body); border: 1px solid var(--cs-border);
    padding: 4px 10px; border-radius: 12px; font-size: 12px;
    color: var(--cs-text);
  }

  .cs-regex-list {
    display: flex; flex-direction: column; gap: 8px;
  }

  .cs-regex-item {
    background: var(--cs-bg-body); border: 1px solid var(--cs-border);
    padding: 8px 12px; border-radius: 6px; font-family: monospace;
    font-size: 11px; color: var(--cs-text); word-break: break-all;
  }
`;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}