/**
 * ai.js — Layer 3: AI 语义检测模块（升级版）
 *
 * 职责：
 *   - 封装多 Provider AI API 调用（Claude / OpenAI / 自定义）
 *   - 三档 AI 模式：off / eco（默认）/ full
 *   - 批处理队列 + 每日调用上限 + 自动降级
 *   - 升级输出契约：intent + learned_rule
 *   - 话题过滤集成（路由条件判断）
 *   - 无 API Key 时优雅降级（A8）
 */

import { createProvider } from './ai-providers/index.js';

// ─── AI 模式定义 ──────────────────────────────────────────────────────────────

export const AIMode = {
  OFF:  'off',   // 不调用 AI
  ECO:  'eco',   // 仅 L1 miss + L2 suspicious 才触发，批量打包
  FULL: 'full',  // L1 miss 全部送 AI
};

// ─── 批处理参数 ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 5000; // 5s
const DEFAULT_DAILY_LIMIT = 30;

export class AIAnalyzer {
  /**
   * @param {object} config
   * @param {string} [config.apiKey]       API 密钥
   * @param {string} [config.aiProvider]   'claude' | 'openai' | 自定义
   * @param {string} [config.aiModel]      模型覆盖
   * @param {string} [config.aiEndpoint]   自定义端点（OpenAI 兼容）
   * @param {string} [config.aiMode]       'off' | 'eco' | 'full'
   * @param {number} [config.aiDailyLimit] 每日调用上限
   * @param {boolean} [config.aiEnabled]   全局 AI 开关
   */
  constructor(config) {
    this.config = config;
    this.dailyCount = 0;
    this.lastResetDate = null;
    this._loadDailyCount();

    // 创建 Provider 实例
    this.provider = null;
    this._initProvider();

    // 批处理队列
    this._queue = [];
    this._queueTimer = null;
    this._queueResolvers = new Map();
    this._queueIdCounter = 0;
  }

  /** 初始化/重建 Provider */
  _initProvider() {
    if (this.config.apiKey) {
      this.provider = createProvider(this.config);
    } else {
      this.provider = null;
    }
  }

  /**
   * 更新配置（面板实时修改时调用）
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    this._initProvider();
  }

  // ─── AI 模式与路由 ──────────────────────────────────────────────────────────

  /** 获取当前 AI 模式 */
  getMode() {
    if (!this.config.aiEnabled) return AIMode.OFF;
    return this.config.aiMode || AIMode.ECO;
  }

  /**
   * 判断是否应该调用 AI（路由条件 A3）
   *
   * 进入 AI 的条件全部满足才触发：
   * 1. AI 模式不是 off
   * 2. Provider 可用（有 API Key）
   * 3. 今日调用未达上限
   * 4. Layer 1 未命中
   * 5. eco 模式下：Layer 2 必须为 suspicious
   *    full 模式下：Layer 1 miss 即可
   * 6. topic-filter 确认涉及用户关心的话题（可选，由调用方传入）
   *
   * @param {object} layerResult  Layer 1/2 的结果
   * @param {boolean} [involvesTopic]  是否涉及用户关心话题
   * @returns {boolean}
   */
  shouldAnalyze(layerResult, involvesTopic = true) {
    const mode = this.getMode();
    if (mode === AIMode.OFF) return false;
    if (!this.provider) return false;
    if (!this._checkDailyLimit()) return false;

    // Layer 1 命中 → 不需要 AI
    if (layerResult.layer === 1 && layerResult.verdict === 'toxic') return false;

    if (mode === AIMode.ECO) {
      // eco: 仅 L2 suspicious 触发
      return layerResult.verdict === 'suspicious';
    }

    if (mode === AIMode.FULL) {
      // full: L1 miss 全部送 AI（但 safe 的 L2 可以跳过）
      return layerResult.verdict !== 'toxic';
    }

    return false;
  }

  // ─── 分析入口 ──────────────────────────────────────────────────────────────

  /**
   * AI 分析入口 — 支持批处理合并
   * @param {string} text
   * @param {object} context  { platform, isReply, mentionsUser, username }
   * @returns {Promise<object|null>}  升级后的 AIResult
   */
  async analyze(text, context = {}) {
    if (!this.provider) return null;
    if (!this._checkDailyLimit()) return null;

    return new Promise((resolve) => {
      const id = ++this._queueIdCounter;
      this._queueResolvers.set(id, resolve);
      this._queue.push({ id, text, context });

      if (this._queue.length >= BATCH_SIZE) {
        this._flushBatch();
      } else if (!this._queueTimer) {
        this._queueTimer = setTimeout(() => this._flushBatch(), BATCH_TIMEOUT);
      }
    });
  }

  /**
   * 单条即时分析（不走批处理队列）
   * @param {string} text
   * @param {object} context
   * @returns {Promise<object|null>}
   */
  async analyzeImmediate(text, context = {}) {
    if (!this.provider) return null;
    if (!this._checkDailyLimit()) return null;

    try {
      const result = await this.provider.analyzeSingle(text, context);
      if (result) {
        this.dailyCount++;
        this._saveDailyCount();
        result.layer = 3;
      }
      return result;
    } catch (err) {
      console.warn('[CyberShield] AI single analysis failed:', err);
      return null;
    }
  }

  // ─── 每日限额 ──────────────────────────────────────────────────────────────

  /** 获取今日已用次数 */
  getTodayUsage() {
    return this.dailyCount;
  }

  /** 获取每日上限 */
  getDailyLimit() {
    return this.config.aiDailyLimit || DEFAULT_DAILY_LIMIT;
  }

  /** 是否已达到每日上限 */
  isLimitReached() {
    this._checkDailyLimit(); // 刷新日期
    return this.dailyCount >= this.getDailyLimit();
  }

  /** 检查是否达到每日上限，未达则返回 true */
  _checkDailyLimit() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyCount = 0;
      this.lastResetDate = today;
      this._saveDailyCount();
    }
    return this.dailyCount < this.getDailyLimit();
  }

  _loadDailyCount() {
    try {
      this.dailyCount = parseInt(GM_getValue('cs_ai_daily_count', '0'), 10);
      this.lastResetDate = GM_getValue('cs_ai_last_reset', '');
    } catch (e) {
      this.dailyCount = 0;
      this.lastResetDate = '';
    }
  }

  _saveDailyCount() {
    try {
      GM_setValue('cs_ai_daily_count', String(this.dailyCount));
      GM_setValue('cs_ai_last_reset', new Date().toDateString());
    } catch (e) { /* silent */ }
  }

  // ─── 批处理引擎 ────────────────────────────────────────────────────────────

  /** 刷新批处理队列 */
  _flushBatch() {
    if (this._queueTimer) {
      clearTimeout(this._queueTimer);
      this._queueTimer = null;
    }

    const batch = this._queue.splice(0, BATCH_SIZE);
    if (batch.length === 0) return;

    // eco 模式使用批量调用
    this._callBatch(batch).then(results => {
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const resolve = this._queueResolvers.get(item.id);
        if (resolve) {
          resolve(results[i] || null);
          this._queueResolvers.delete(item.id);
        }
      }
    }).catch(err => {
      console.warn('[CyberShield] Batch AI failed, falling back to single:', err);
      // 批量失败 → 逐条回退
      for (const item of batch) {
        const resolve = this._queueResolvers.get(item.id);
        if (resolve) {
          this._singleFallback(item, resolve);
        }
      }
    });
  }

  /** 批量调用 Provider */
  async _callBatch(batch) {
    const items = batch.map(b => ({ text: b.text, context: b.context }));
    const results = await this.provider.analyzeBatch(items);

    return results.map(r => {
      if (!r) return null;
      this.dailyCount++;
      this._saveDailyCount();
      r.layer = 3;
      return r;
    });
  }

  /** 单条回退 */
  async _singleFallback(item, resolve) {
    try {
      const result = await this.provider.analyzeSingle(item.text, item.context);
      if (result) {
        this.dailyCount++;
        this._saveDailyCount();
        result.layer = 3;
      }
      resolve(result);
    } catch (err) {
      resolve(null);
    }
  }

  // ─── 状态信息（供面板展示）──────────────────────────────────────────────────

  /** 获取完整状态 */
  getStatus() {
    return {
      mode: this.getMode(),
      provider: this.provider?.name || 'none',
      model: this.provider?.model || 'none',
      dailyUsed: this.dailyCount,
      dailyLimit: this.getDailyLimit(),
      isLimitReached: this.isLimitReached(),
      hasApiKey: !!this.config.apiKey,
      queueSize: this._queue.length,
    };
  }

  /** 验证当前 API Key 是否有效 */
  async validateKey() {
    if (!this.provider) return false;
    try {
      return await this.provider.validateKey();
    } catch (e) {
      return false;
    }
  }
}
