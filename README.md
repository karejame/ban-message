# 🛡️ CyberShield

> A userscript that protects you from online harassment — across any platform.

**The problem**: Trolls and coordinated harassment are a global issue. Engaging back escalates things. Platforms do too little.

**The solution**: A Tampermonkey userscript that runs silently in your browser — detecting, blurring, blocking, and archiving toxic content before it reaches you. No platform API dependency. No monthly fees. Just protection.

---

## ✨ Features

| Feature | Description |
|--------|-------------|
| 🫥 Content Filter | Toxic comments are auto-blurred with a "show anyway" option |
| 🚫 Auto-Block | Detected harassers can be muted/blocked automatically |
| 📸 Evidence Vault | One-click screenshot + auto-logging with timestamp and URL |
| 🎛️ Control Panel | Floating UI to tune sensitivity, manage whitelist, view history |

---

## 🌍 Supported Platforms

### English
- Twitter / X (`twitter.com`, `x.com`)
- Reddit (`reddit.com`)
- YouTube (`youtube.com`)

### Chinese (中文)
- 微博 Weibo (`weibo.com`)
- Bilibili B站 (`bilibili.com`)
- 知乎 Zhihu (`zhihu.com`)
- 贴吧 Tieba (`tieba.baidu.com`)

### Fallback
- Generic DOM scanner for any other site

---

## 🏗️ Architecture

```
cyber-shield/
├── src/
│   ├── cyber-shield.user.js   # Main entry (Tampermonkey header + bootstrap)
│   ├── core/
│   │   ├── detector.js        # Three-layer toxicity detection engine
│   │   ├── scanner.js         # MutationObserver DOM watcher
│   │   ├── blocker.js         # Block/mute action executor
│   │   └── evidence.js        # Screenshot + evidence logging
│   ├── platforms/
│   │   ├── index.js           # Platform registry + auto-detect
│   │   ├── twitter.js
│   │   ├── reddit.js
│   │   ├── youtube.js
│   │   ├── weibo.js
│   │   ├── bilibili.js
│   │   ├── zhihu.js
│   │   ├── tieba.js
│   │   └── generic.js
│   ├── rules/
│   │   ├── en-patterns.json   # English toxicity rules
│   │   └── zh-patterns.json   # Chinese toxicity rules (中文规则库)
│   └── ui/
│       └── panel.js           # Floating control panel
└── dist/
    └── cyber-shield.user.js   # Built single-file output
```

### Detection Pipeline

```
Input Text
   │
   ▼
[Layer 1] Keyword Rules (0ms)      ──── TOXIC ──▶ blur + log
   │ miss
   ▼
[Layer 2] Behavioral Patterns      ──── WARN ───▶ flag
   │ miss / ambiguous
   ▼
[Layer 3] Claude AI (async)        ──── TOXIC ──▶ blur + log
```

---

## 🚀 Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Click [Install CyberShield](#) _(link coming soon)_
3. Visit any supported platform — protection starts immediately

---

## ⚙️ Configuration

Open the floating 🛡️ panel on any page:

- **Sensitivity**: Low / Medium / High
- **Whitelist**: Accounts you always want to see
- **AI Mode**: Enable Claude API for deep analysis
- **Evidence**: View your saved harassment log

---

## 🤝 Contributing

Pull requests welcome! Especially:
- New platform adapters (`src/platforms/`)
- Rule improvements (`src/rules/`)
- Non-English rule sets (Japanese, Korean, Spanish, etc.)

---

## 📄 License

MIT — use it, fork it, share it.
