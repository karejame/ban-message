import fs from 'fs';
import path from 'path';

// 获取当前脚本目录（修复 Windows 路径问题）
let scriptDir = path.dirname(new URL(import.meta.url).pathname);
if (scriptDir.startsWith('/')) {
  scriptDir = scriptDir.slice(1);
}

// 获取项目根目录
const projectRoot = path.join(scriptDir, '..');

// 获取 naughty-words 包路径
const packagePath = path.join(projectRoot, 'node_modules', 'naughty-words');

// 定义支持的语言列表
const languages = [
  'ar', 'cs', 'da', 'de', 'en', 'eo', 'es', 'fa', 'fi', 'fil',
  'fr', 'fr-CA-u-sd-caqc', 'hi', 'hu', 'it', 'ja', 'kab', 'ko',
  'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'th', 'tlh', 'tr', 'zh'
];

// 收集所有词库
const allKeywords = new Set();
const langStats = {};

console.log('========================================');
console.log('开始读取 naughty-words 词库...');
console.log('========================================');

// 遍历所有语言
for (const lang of languages) {
  const jsonPath = path.join(packagePath, `${lang}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.log(`[${lang}] 文件不存在，跳过`);
    continue;
  }
  
  try {
    const content = fs.readFileSync(jsonPath, 'utf8');
    const words = JSON.parse(content);
    
    if (Array.isArray(words)) {
      langStats[lang] = { original: words.length };
      console.log(`[${lang}] 原始: ${words.length} 词`);
      
      // 添加到集合（自动去重）
      for (const word of words) {
        const normalized = word.toLowerCase().trim();
        if (normalized) {
          allKeywords.add(normalized);
        }
      }
    }
  } catch (e) {
    console.log(`[${lang}] 读取失败: ${e.message}`);
  }
}

console.log('========================================');
console.log('统计信息:');
console.log('========================================');
console.log(`源语言数量: ${Object.keys(langStats).length}`);
console.log(`去重后总词数: ${allKeywords.size}`);

// 按语言分类统计
const zhWords = new Set();
const enWords = new Set();
const otherWords = new Set();

for (const word of allKeywords) {
  if (/[\u4e00-\u9fa5]/.test(word)) {
    zhWords.add(word);
  } else if (/^[a-zA-Z]+$/.test(word)) {
    enWords.add(word);
  } else {
    otherWords.add(word);
  }
}

console.log(`中文词数: ${zhWords.size}`);
console.log(`英文词数: ${enWords.size}`);
console.log(`其他语言词数: ${otherWords.size}`);

// 生成输出格式（仅保留关键词，剔除时间戳等元数据保障隐私安全）
const output = Array.from(allKeywords).sort((a, b) => a.localeCompare(b));

// 输出到文件（纯数组格式，不含元数据）
const outputPath = path.join(projectRoot, 'default-blacklist.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('========================================');
console.log(`输出文件: ${outputPath}`);
console.log(`总词数: ${output.length}`);
console.log('注意：仅输出关键词，已剥离时间戳等元数据');
console.log('========================================');
console.log('词库构建完成!');