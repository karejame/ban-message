let lang = (navigator.language || '').startsWith('zh') ? 'zh' : 'en';

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
    recentScan: '最近扫描',

    // ── 运行状态面板 ──────────────────────────────────────────────────────
    statPlatform: '当前平台',
    statStatus: '运行状态',
    statScanned: '已扫描',
    statFiltered: '已过滤',
    statRules: '启用规则',
    statLastScan: '最近扫描',
    statObserver: '页面监听',
    statActive: '运行中',
    statIdle: '空闲',
    statWaiting: '等待加载',
    statDisabled: '已关闭',
    statStopped: '已暂停',
    statUnknown: '未知',

    // ── 自定义关键词 ──────────────────────────────────────────────────────
    customTitle: '自定义过滤词',
    customPlaceholder: '输入关键词...',
    customAdd: '添加',
    customDelete: '删除',
    customEmpty: '暂无自定义关键词',
    customImport: '导入',
    customExport: '导出',
    customDelConfirm: '确定要删除 "{keyword}" 吗？',
    customClearAll: '清空全部',
    customClearAllConfirm: '确定要删除全部 {n} 个自定义过滤词吗？此操作不可撤销。',
    customCleared: '自定义过滤词已清空',
    customDeleted: '已删除 "{keyword}"',

    // ── 刷屏/骚扰检测 ──────────────────────────────────────────────────
    spamLabel: '检测到刷屏内容，已自动隐藏',
    spamBlocked: '刷屏屏蔽',
    harassLabel: '检测到骚扰内容，已自动隐藏',
    reblockBtn: '再次屏蔽',
    reblockHint: '点击可重新屏蔽该违规内容',

    // ── 内容类型标签 ────────────────────────────────────────────────────
    typeComment: '评论',
    typeReply: '回复',
    typeMessage: '私信',

    // ── 页面切换 & 脚本控制 ──────────────────────────────────────────────
    tabControl: '控制',
    tabLog: '日志',
    btnStop: '暂停脚本',
    btnStart: '启动脚本',
    btnScan: '手动扫描',
    scanHint: '提示: 非必要请勿频繁手动扫描，脚本已自动监控页面变化',
    logTitle: '扫描日志',
    logEmpty: '暂无扫描记录',

    // ── 语言切换 ──────────────────────────────────────────────────────
    langSwitch: 'EN',
    langSwitchHint: '中/EN',

    // ── 批量拉黑 ──────────────────────────────────────────────────────
    blockAll: '拉黑全部',
    blockAllHint: '拉黑扫描日志中所有违规用户',
    blockAllDone: '已拉黑 {n} 个用户',
    blockAllEmpty: '日志中无违规用户',

    blockSelected: '拉黑选中',
    unblockSelected: '取消拉黑',
    blockedBadge: '已拉黑',
    selectAll: '全选',
    blockSelectedDone: '已拉黑 {n} 个用户',
    unblockSelectedDone: '已取消 {n} 个用户的拉黑',
    noUserSelected: '未选中任何用户',

    // ── 系统状态 ──────────────────────────────────────────────────────────
    sysTitle: '系统状态',
    remoteRules: '远程词库',
    remoteUpdated: '更新于 {time}',
    remoteNever: '从未更新',
    aiUsage: 'AI 用量',
    aiUsed: '今日已用 {n} 次',
    aiDailyLimit: '每日上限 {n} 次',
    contextRules: '上下文规则',
    contextRulesCount: '{n} 条激活',
    refresh: '刷新',
    refreshing: '刷新中...',
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
    recentScan: 'Recent',

    // ── Status panel ──────────────────────────────────────────────────────
    statPlatform: 'Platform',
    statStatus: 'Status',
    statScanned: 'Scanned',
    statFiltered: 'Filtered',
    statRules: 'Active Rules',
    statLastScan: 'Last Scan',
    statObserver: 'Observer',
    statActive: 'Active',
    statIdle: 'Idle',
    statWaiting: 'Waiting...',
    statDisabled: 'Disabled',
    statStopped: 'Stopped',
    statUnknown: 'Unknown',

    // ── Custom keywords ───────────────────────────────────────────────────
    customTitle: 'Custom Filters',
    customPlaceholder: 'Enter keyword...',
    customAdd: 'Add',
    customDelete: 'Delete',
    customEmpty: 'No custom keywords',
    customImport: 'Import',
    customExport: 'Export',
    customDelConfirm: 'Delete "{keyword}"?',
    customClearAll: 'Clear All',
    customClearAllConfirm: 'Delete all {n} custom keywords? This cannot be undone.',
    customCleared: 'Custom keywords cleared',
    customDeleted: 'Deleted "{keyword}"',

    // ── Spam/harassment detection ───────────────────────────────────
    spamLabel: 'Spam content detected and hidden',
    spamBlocked: 'Spam Blocked',
    harassLabel: 'Harassment content detected and hidden',
    reblockBtn: 'Re-block',
    reblockHint: 'Click to re-block the violating content',

    // ── Content type labels ────────────────────────────────────────────
    typeComment: 'Comment',
    typeReply: 'Reply',
    typeMessage: 'DM',

    // ── Tabs & Controls ──────────────────────────────────────────────
    tabControl: 'Control',
    tabLog: 'Log',
    btnStop: 'Stop',
    btnStart: 'Start',
    btnScan: 'Manual Scan',
    scanHint: 'Tip: Avoid frequent manual scans. The script monitors page changes automatically.',
    logTitle: 'Scan Log',
    logEmpty: 'No scan records yet',

    // ── Language switch ──────────────────────────────────────────────────
    langSwitch: '中文',
    langSwitchHint: '中/EN',

    // ── Batch block ──────────────────────────────────────────────────────
    blockAll: 'Block All',
    blockAllHint: 'Block all violating users from scan log',
    blockAllDone: 'Blocked {n} users',
    blockAllEmpty: 'No violating users in log',

    blockSelected: 'Block Selected',
    unblockSelected: 'Unblock',
    blockedBadge: 'Blocked',
    selectAll: 'Select All',
    blockSelectedDone: 'Blocked {n} users',
    unblockSelectedDone: 'Unblocked {n} users',
    noUserSelected: 'No users selected',

    // ── System Status ────────────────────────────────────────────────────
    sysTitle: 'System',
    remoteRules: 'Remote Rules',
    remoteUpdated: 'Updated {time}',
    remoteNever: 'Never',
    aiUsage: 'AI Usage',
    aiUsed: '{n} used today',
    aiDailyLimit: '{n} daily limit',
    contextRules: 'Context Rules',
    contextRulesCount: '{n} active',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
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

/**
 * 切换语言（'zh' 或 'en'），返回当前语言。
 * 调用后需重新渲染面板以更新文本。
 */
export function setLang(newLang) {
  if (newLang === 'zh' || newLang === 'en') {
    lang = newLang;
  }
  return lang;
}

/**
 * 切换语言（zh ↔ en），返回新语言。
 */
export function toggleLang() {
  lang = lang === 'zh' ? 'en' : 'zh';
  return lang;
}