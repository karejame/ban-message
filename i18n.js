const lang = (navigator.language || '').startsWith('zh') ? 'zh' : 'en';

const strings = {
  zh: {
    panelTitle: 'CyberShield',
    panelSubtitle: '网暴保护盾',
    protection: '保护开关',
    sensitivity: '敏感度',
    low: '低',
    medium: '中',
    high: '高',
    autoBlock: '自动拉黑',
    aiMode: 'AI 增强',
    apiKey: 'API 密钥',
    evidence: '取证记录',
    export: '导出数据',
    version: 'v{ver}',
    blurLabel: '检测到可能有害的内容，已自动隐藏',
    blurBtn: '仍然显示',
    modalTitle: '取证记录',
    emptyLog: '暂未检测到有害内容',
    entryCount: '共 {n} 条',
    eUser: '用户',
    eVerdict: '判定',
    eTime: '时间',
    blocked: '已拉黑',
    aiDesc: '启用 Claude AI 进行深度语义分析',
    apiKeyPlaceholder: '输入 Claude API Key',
    feedTitle: '扫描日志',
    feedEmpty: '等待评论扫描中...',
    feedSafe: '正常',
    feedSuspicious: '可疑',
    feedToxic: '违规',
    feedFound: '找到 {n} 条评论',
    feedNoMatch: '未匹配到评论区',
    diagnose: '诊断',
  },
  en: {
    panelTitle: 'CyberShield',
    panelSubtitle: 'Harassment Protection',
    protection: 'Protection',
    sensitivity: 'Sensitivity',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    autoBlock: 'Auto-block',
    aiMode: 'AI Mode',
    apiKey: 'API Key',
    evidence: 'Evidence',
    export: 'Export',
    version: 'v{ver}',
    blurLabel: 'Potentially harmful content hidden',
    blurBtn: 'Show anyway',
    modalTitle: 'Evidence Vault',
    emptyLog: 'No incidents logged yet.',
    entryCount: '{n} entries',
    eUser: 'User',
    eVerdict: 'Verdict',
    eTime: 'Time',
    blocked: 'Blocked',
    aiDesc: 'Use Claude AI for deep semantic analysis',
    apiKeyPlaceholder: 'Enter Claude API Key',
    feedTitle: 'Live Feed',
    feedEmpty: 'Waiting for comments...',
    feedSafe: 'Safe',
    feedSuspicious: 'Suspicious',
    feedToxic: 'Toxic',
    feedFound: '{n} comments found',
    feedNoMatch: 'No comment elements found',
    diagnose: 'Diagnose',
  },
};

export function t(key, params = {}) {
  const dict = strings[lang] || strings.en;
  let str = dict[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

export function getLang() {
  return lang;
}