/**
 * topic-filter.js — 话题级偏好过滤系统
 *
 * 用户可以配置「不想看到的话题」，系统根据关键词和模式匹配话题归属。
 * 话题命中后标记该内容涉及用户敏感话题，供后续 AI 路由和检测参考。
 *
 * 内置话题类别（用户可扩展）：
 *   - gender_attack:   性别攻击/男女对立
 *   - race_attack:     种族歧视/地域歧视
 *   - personal_attack: 人身攻击/外貌羞辱
 *   - political_extreme: 极端政治
 *   - spoiler:         剧透
 *   - fan_war:         饭圈争吵
 *   - spam_harass:     骚扰/刷屏
 *   - game_toxic:      游戏圈争吵
 *   - custom:          用户自定义话题
 */

const TOPIC_FILTER_KEY = 'cs_topic_filter';

/** 内置话题定义 */
export const BUILTIN_TOPICS = {
  gender_attack: {
    id: 'gender_attack',
    label: { zh: '性别攻击/男女对立', en: 'Gender attack' },
    keywords: {
      zh: ['女拳', '男拳', '田园女权', '直男癌', '渣男', '渣女', '绿茶', '普信男', '普信女',
           '嫁不出去', '娶不到老婆', '剩女', '凤凰男', '妈宝男', '扶弟魔'],
      en: ['misogynist', 'misandrist', 'feminazi'],
    },
    defaultEnabled: false,
  },
  race_attack: {
    id: 'race_attack',
    label: { zh: '种族/地域歧视', en: 'Race/region discrimination' },
    keywords: {
      zh: ['地域黑', '河南人', '东北人偷', '广东人吃', '上海人排外', '黑人', '阿三', '棒子', '小鬼子'],
      en: ['nazi', 'kkk', 'racial slur'],
    },
    defaultEnabled: false,
  },
  personal_attack: {
    id: 'personal_attack',
    label: { zh: '人身攻击/外貌羞辱', en: 'Personal attack' },
    keywords: {
      zh: ['丑八怪', '肥猪', '死胖子', '矮冬瓜', '秃头', '整容怪', '土鳖', '乡巴佬'],
      en: ['ugly', 'fatso', 'loser'],
    },
    defaultEnabled: true,
  },
  political_extreme: {
    id: 'political_extreme',
    label: { zh: '极端政治', en: 'Extreme politics' },
    keywords: {
      zh: [],
      en: [],
    },
    defaultEnabled: false,
  },
  spoiler: {
    id: 'spoiler',
    label: { zh: '剧透', en: 'Spoiler' },
    keywords: {
      zh: ['剧透', '死了', '结局是', '最后是'],
      en: ['spoiler', 'plot twist', 'ending is'],
    },
    defaultEnabled: false,
  },
  fan_war: {
    id: 'fan_war',
    label: { zh: '饭圈争吵', en: 'Fan war' },
    keywords: {
      zh: ['糊了', '扑街', '洗白', '黑料', '塌房', '翻车', '脱粉'],
      en: [],
    },
    defaultEnabled: false,
  },
  spam_harass: {
    id: 'spam_harass',
    label: { zh: '骚扰/刷屏', en: 'Spam/harassment' },
    keywords: {
      zh: [],
      en: [],
    },
    defaultEnabled: true,
  },
  game_toxic: {
    id: 'game_toxic',
    label: { zh: '游戏圈争吵', en: 'Game toxicity' },
    keywords: {
      zh: ['菜鸡', '坑货', '送人头', '挂机狗'],
      en: ['noob', 'feeder', 'afk'],
    },
    defaultEnabled: false,
  },
};

export class TopicFilter {
  constructor() {
    this.topics = {};
    this.userTopics = [];
    this.removedTopics = [];  // 用户已删除的话题 ID（含内置）
    this._load();
  }

  /**
   * 初始化：合并内置话题和用户自定义话题，跳过已删除的
   */
  _load() {
    try {
      const saved = JSON.parse(GM_getValue(TOPIC_FILTER_KEY, '{}'));
      this.userTopics = saved.userTopics || [];
      this.removedTopics = saved.removedTopics || [];

      // 合并内置话题（跳过已删除的）
      for (const [id, topic] of Object.entries(BUILTIN_TOPICS)) {
        if (this.removedTopics.includes(id)) continue;
        this.topics[id] = {
          ...topic,
          enabled: saved.enabled?.[id] ?? topic.defaultEnabled,
        };
      }

      // 加载用户自定义话题（跳过已删除的）
      for (const ut of this.userTopics) {
        if (this.removedTopics.includes(ut.id)) continue;
        this.topics[ut.id] = {
          ...ut,
          enabled: true,
          source: 'user',
        };
      }
    } catch (e) {
      // 初始化默认值
      for (const [id, topic] of Object.entries(BUILTIN_TOPICS)) {
        this.topics[id] = { ...topic, enabled: topic.defaultEnabled };
      }
    }
  }

  _save() {
    try {
      const enabled = {};
      for (const [id, topic] of Object.entries(this.topics)) {
        if (topic.source !== 'user') {
          enabled[id] = topic.enabled;
        }
      }
      GM_setValue(TOPIC_FILTER_KEY, JSON.stringify({
        enabled,
        userTopics: this.userTopics,
        removedTopics: this.removedTopics,
      }));
    } catch (e) { /* silent */ }
  }

  /**
   * 检测文本涉及哪些已启用的话题
   * @param {string} text  归一化后的文本
   * @returns {string[]} 命中的话题 id 列表
   */
  detectTopics(text) {
    const lower = text.toLowerCase();
    const hits = [];

    for (const [id, topic] of Object.entries(this.topics)) {
      if (!topic.enabled) continue;

      const keywords = [
        ...(topic.keywords?.zh || []),
        ...(topic.keywords?.en || []),
      ];

      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          hits.push(id);
          break;
        }
      }
    }

    return hits;
  }

  /**
   * 检查文本是否涉及用户关心的话题（用于 AI 路由条件判断）
   * @param {string} text
   * @returns {boolean}
   */
  involvesUserTopic(text) {
    return this.detectTopics(text).length > 0;
  }

  /** 切换话题启用状态 */
  toggleTopic(topicId, enabled) {
    if (this.topics[topicId]) {
      this.topics[topicId].enabled = enabled;
      this._save();
    }
  }

  /** 添加用户自定义话题 */
  addUserTopic(topic) {
    const id = `custom_${Date.now()}`;
    const newTopic = {
      id,
      label: { zh: topic.label, en: topic.label },
      keywords: { zh: topic.keywords || [], en: [] },
      enabled: true,
      source: 'user',
      createdAt: Date.now(),
    };
    this.userTopics.push(newTopic);
    this.topics[id] = newTopic;
    this._save();
    return id;
  }

  /** 删除用户自定义话题 */
  removeUserTopic(topicId) {
    this.removeTopic(topicId);
  }

  /**
   * 删除任意话题（内置或自定义），从列表移除并记录到 removedTopics
   * @param {string} topicId
   */
  removeTopic(topicId) {
    const isUser = this.topics[topicId]?.source === 'user';
    if (isUser) {
      this.userTopics = this.userTopics.filter(t => t.id !== topicId);
    }
    delete this.topics[topicId];
    if (!this.removedTopics.includes(topicId)) {
      this.removedTopics.push(topicId);
    }
    this._save();
  }

  /** 获取所有话题（含启用状态），供面板展示 */
  getAllTopics() {
    return Object.values(this.topics).map(t => ({
      id: t.id,
      label: t.label,
      enabled: t.enabled,
      source: t.source || 'builtin',
      keywordCount: (t.keywords?.zh || []).length + (t.keywords?.en || []).length,
    }));
  }
}
