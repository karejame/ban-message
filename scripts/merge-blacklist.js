import fs from 'fs';
import path from 'path';

// 获取当前脚本目录
let scriptDir = path.dirname(new URL(import.meta.url).pathname);
if (scriptDir.startsWith('/')) {
  scriptDir = scriptDir.slice(1);
}
const projectRoot = path.join(scriptDir, '..');

// 语言列表（从 naughty-words 获取）
const languages = [
  { code: 'ar', name: 'Arabic' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'de', name: 'German' },
  { code: 'en', name: 'English' },
  { code: 'eo', name: 'Esperanto' },
  { code: 'es', name: 'Spanish' },
  { code: 'fa', name: 'Persian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fr', name: 'French' },
  { code: 'fr-CA-u-sd-caqc', name: 'Canadian French' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'kab', name: 'Kabyle' },
  { code: 'ko', name: 'Korean' },
  { code: 'nl', name: 'Dutch' },
  { code: 'no', name: 'Norwegian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tlh', name: 'Klingon' },
  { code: 'tr', name: 'Turkish' },
  { code: 'zh', name: 'Chinese' },
];

const naughtyWordsPath = path.join(projectRoot, 'node_modules', 'naughty-words');
const outputDir = path.join(projectRoot, 'src', 'data');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('========================================');
console.log('开始合并词库...');
console.log('========================================');

let totalKeywords = 0;
const allKeywords = new Set();

// 遍历每种语言
for (const lang of languages) {
  const jsonPath = path.join(naughtyWordsPath, `${lang.code}.json`);
  
  if (!fs.existsSync(jsonPath)) {
    console.log(`[${lang.code}] 文件不存在，跳过`);
    continue;
  }
  
  try {
    const content = fs.readFileSync(jsonPath, 'utf8');
    const words = JSON.parse(content);
    
    if (Array.isArray(words)) {
      // 去重并转小写
      const uniqueWords = [...new Set(words.map(w => w.toLowerCase().trim()))].filter(w => w);
      totalKeywords += uniqueWords.length;
      
      // 添加到全局集合
      uniqueWords.forEach(w => allKeywords.add(w));
      
      // 生成输出格式（30% 硬关键词，70% 软关键词）
      const hardCount = Math.floor(uniqueWords.length * 0.3);
      const output = {
        _comment: `CyberShield ${lang.name} Toxicity Rules (${uniqueWords.length} keywords)`,
        hard_keywords: uniqueWords.slice(0, hardCount),
        soft_keywords: uniqueWords.slice(hardCount),
        regex_patterns: [],
      };
      
      // 写入文件
      const outputPath = path.join(outputDir, `${lang.code}-patterns.json`);
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      console.log(`[${lang.code}] ${lang.name}: ${uniqueWords.length} 词 -> ${outputPath}`);
    }
  } catch (e) {
    console.log(`[${lang.code}] 读取失败: ${e.message}`);
  }
}

console.log('========================================');
console.log(`总关键词数（去重后）: ${allKeywords.size}`);
console.log(`总原始关键词数: ${totalKeywords}`);
console.log(`生成文件数: ${languages.length}`);
console.log('========================================');
console.log('合并完成!');