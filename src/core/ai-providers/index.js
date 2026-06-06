/**
 * ai-providers/index.js — Provider 工厂 + 注册中心
 *
 * 根据 config.aiProvider 字段创建对应的 Provider 实例。
 * 支持 'claude' | 'openai' | 'custom'，默认 'claude'。
 */

import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { CustomProvider } from './custom-provider.js';

/** 已注册的 Provider 类 */
const REGISTRY = {
  claude: ClaudeProvider,
  openai: OpenAIProvider,
  custom: CustomProvider,
};

/**
 * 注册自定义 Provider
 * @param {string} name
 * @param {typeof import('./base-provider.js').BaseAIProvider} ProviderClass
 */
export function registerProvider(name, ProviderClass) {
  REGISTRY[name] = ProviderClass;
}

/**
 * 根据配置创建 AI Provider 实例
 * @param {object} config
 * @param {string} [config.aiProvider]  'claude' | 'openai' | 自定义名
 * @param {string} config.apiKey
 * @returns {import('./base-provider.js').BaseAIProvider|null}
 */
export function createProvider(config) {
  if (!config.apiKey) return null;

  const providerName = config.aiProvider || 'claude';
  const ProviderClass = REGISTRY[providerName];

  if (!ProviderClass) {
    console.warn(`[CyberShield] Unknown AI provider "${providerName}", falling back to claude`);
    return new ClaudeProvider(config);
  }

  return new ProviderClass(config);
}

/** 获取所有已注册的 Provider 名称列表 */
export function listProviders() {
  return Object.keys(REGISTRY);
}

export { ClaudeProvider, OpenAIProvider, CustomProvider };
export { BaseAIProvider } from './base-provider.js';
