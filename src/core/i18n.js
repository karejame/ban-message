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
    aiDisabled: 'AI 能力暂不可用（需配置 API 密钥）',
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
    view: '查看',
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

    // ── 规则查看 ────────────────────────────────────────────────────────────
    rulesTitle: '屏蔽规则',
    rulesHard: '硬关键词（直接屏蔽）',
    rulesSoft: '软关键词（敏感检测）',
    rulesRegex: '正则表达式',
    rulesCustom: '自定义关键词',
    rulesVariant: '变体映射',
    rulesPinyin: '拼音映射',
    rulesClose: '关闭',
    rulesCount: '共 {n} 条规则',

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

    // ── 隐私声明 ──────────────────────────────────────────────────────
    privacyTitle: '隐私声明',
    privacyText: '所有数据（取证日志、用户规则、配置）仅存储在本地浏览器，不上传任何服务器。',

    // ── 关于 ────────────────────────────────────────────────────────
    aboutTitle: '关于',
    aboutText: 'CyberShield v{ver} - 网暴保护盾',
    aboutDesc: 'CyberShield 是一款浏览器插件，用于自动检测和屏蔽网络暴力、骚扰和恶意评论。',
    aboutPlatforms: 'Twitter/X、B站、Reddit、微博、YouTube、知乎、贴吧',
    aboutFeatures: '功能特性',
    aboutFeatKeywords: '关键词检测（支持 28 种语言）',
    aboutFeatBehavior: '行为信号分析（全大写、感叹号、emoji）',
    aboutFeatBlock: '自动拉黑（支持 API 和 DOM 模拟）',
    aboutFeatEvidence: '取证记录（截图 + 日志）',
    aboutFeatCustom: '自定义关键词管理',
    aboutPrivacy: '隐私声明',
    aboutGithub: 'GitHub',

    // ── 扫描原因（scanner.js） ──────────────────────────────────────────
    harassReason: '骚扰: @{user}发送{count}条回复',
    harassEvidence: '同一用户@{user}发送{count}条回复',
    harassResult: '同一用户{count}条@回复骚扰',
    spamReason: '刷屏: 相同内容重复{count}次',
    spamResult: '刷屏: 重复{count}次',

    // ── 平台通知（platforms/*.js） ──────────────────────────────────────
    biliNoUid: '无法获取用户UID，请手动拉黑 @{user}',
    biliLoginReq: '请先登录B站，再使用拉黑功能',
    biliBlocked: '已拉黑 @{user}',
    biliBlockFail: '拉黑失败({msg})，请手动拉黑 @{user}',
    biliBlockError: '拉黑请求异常，请手动拉黑 @{user}',
    biliBlockFailed: '拉黑请求失败，请手动拉黑 @{user}',
    biliNoUidUnblock: '无法获取用户UID，请手动取消拉黑 @{user}',
    biliLoginReqUnblock: '请先登录B站，再使用取消拉黑功能',
    biliUnblocked: '已取消拉黑 @{user}',
    biliUnblockFail: '取消拉黑失败({msg})，请手动取消拉黑 @{user}',
    biliUnblockError: '取消拉黑请求异常，请手动取消拉黑 @{user}',
    biliUnblockFailed: '取消拉黑请求失败，请手动取消拉黑 @{user}',
    weiboManual: '请手动拉黑用户 @{user}',
    zhihuManual: '请手动屏蔽用户 {user}',
    tiebaManual: '请手动屏蔽用户 {user}（贴吧暂不支持自动拉黑）',
    youtubeManual: '请手动拉黑用户 @{user}',
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
    aiDisabled: 'AI unavailable (API key required)',
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
    view: 'View',
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

    // ── Rules View ────────────────────────────────────────────────────────────
    rulesTitle: 'Block Rules',
    rulesHard: 'Hard Keywords (direct block)',
    rulesSoft: 'Soft Keywords (sensitive detection)',
    rulesRegex: 'Regex Patterns',
    rulesCustom: 'Custom Keywords',
    rulesVariant: 'Variant Mapping',
    rulesPinyin: 'Pinyin Mapping',
    rulesClose: 'Close',
    rulesCount: '{n} rules total',

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

    // ── Privacy ──────────────────────────────────────────────────────
    privacyTitle: 'Privacy',
    privacyText: 'All data (evidence logs, user rules, settings) is stored locally in your browser. No data is uploaded to any server.',

    // ── About ────────────────────────────────────────────────────────
    aboutTitle: 'About',
    aboutText: 'CyberShield v{ver} - Harassment Protection',
    aboutDesc: 'CyberShield is a browser extension that automatically detects and blocks online harassment, abuse, and toxic comments.',
    aboutPlatforms: 'Twitter/X, Bilibili, Reddit, Weibo, YouTube, Zhihu, Tieba',
    aboutFeatures: 'Features',
    aboutFeatKeywords: 'Keyword detection (28 languages)',
    aboutFeatBehavior: 'Behavioral signal analysis (ALL CAPS, punctuation, emoji)',
    aboutFeatBlock: 'Auto-block (API and DOM simulation)',
    aboutFeatEvidence: 'Evidence vault (screenshots + logs)',
    aboutFeatCustom: 'Custom keyword management',
    aboutPrivacy: 'Privacy',
    aboutGithub: 'GitHub',

    // ── Scan reasons (scanner.js) ─────────────────────────────────────────
    harassReason: 'Harassment: @{user} sent {count} replies',
    harassEvidence: 'Same user @{user} sent {count} replies',
    harassResult: '{count} @reply harassment by same user',
    spamReason: 'Spam: same content repeated {count} times',
    spamResult: 'Spam: repeated {count} times',

    // ── Platform notifications (platforms/*.js) ───────────────────────────
    biliNoUid: 'Cannot get user UID, please manually block @{user}',
    biliLoginReq: 'Please log in to Bilibili first',
    biliBlocked: 'Blocked @{user}',
    biliBlockFail: 'Block failed ({msg}), please manually block @{user}',
    biliBlockError: 'Block request error, please manually block @{user}',
    biliBlockFailed: 'Block request failed, please manually block @{user}',
    biliNoUidUnblock: 'Cannot get user UID, please manually unblock @{user}',
    biliLoginReqUnblock: 'Please log in to Bilibili first to unblock',
    biliUnblocked: 'Unblocked @{user}',
    biliUnblockFail: 'Unblock failed ({msg}), please manually unblock @{user}',
    biliUnblockError: 'Unblock request error, please manually unblock @{user}',
    biliUnblockFailed: 'Unblock request failed, please manually unblock @{user}',
    weiboManual: 'Please manually block user @{user}',
    zhihuManual: 'Please manually block user {user}',
    tiebaManual: 'Please manually block user {user} (Tieba auto-block not supported)',
    youtubeManual: 'Please manually block user @{user}',
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