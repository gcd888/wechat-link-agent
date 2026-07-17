/**
 * Agent Provider 抽象接口
 *
 * 所有 Agent CLI 工具通过此接口统一调用，支持流式输出。
 * 每种 Provider 类型有各自的输出格式解析器。
 *
 * 已知实现:
 *   - ClaudeProvider:   解析 NDJSON stream-json 输出
 *   - OpenCodeProvider: 解析 OpenCode CLI 输出
 *   - CodeBuddyProvider: 解析 CodeBuddy CLI 输出
 *   - GenericProvider:  stdin/stdout 兜底方案
 */

import type { AgentConfig, QueryInput, AgentOutput } from './types.js'

/**
 * Agent Provider 抽象接口
 * 每种 AI CLI 工具需要实现此接口
 */
export interface AgentProvider {
  /**
   * 发送查询到 Agent CLI，返回流式输出
   * 通过 AsyncIterable 逐块返回输出，支持流式渲染
   *
   * @param input - 查询输入参数（prompt、cwd、sessionId 等）
   * @returns AsyncIterable<AgentOutput> - 流式输出事件
   */
  query(input: QueryInput): AsyncIterable<AgentOutput>

  /**
   * 终止当前正在执行的查询
   * 通过 AbortController 实现
   */
  abort(): void

  /**
   * 获取 Provider 的版本信息和支持的模型列表
   */
  getInfo(): Promise<{ version?: string; models: string[] }>
}

/**
 * Provider 工厂函数类型
 * 根据 AgentConfig 创建对应的 Provider 实例
 */
export type ProviderFactory = (config: AgentConfig) => AgentProvider

/**
 * Provider 工厂注册表
 * 按 providerType 注册对应的工厂函数
 */
const providerFactories = new Map<string, ProviderFactory>()

/**
 * 注册 Provider 工厂
 * @param type - Provider 类型名称
 * @param factory - 工厂函数
 */
export function registerProvider(type: string, factory: ProviderFactory): void {
  providerFactories.set(type, factory)
}

/**
 * 根据 Agent 配置创建 Provider 实例
 * @param config - Agent 配置
 * @returns AgentProvider 实例
 * @throws 如果未找到对应的 Provider 工厂
 */
export function createProvider(config: AgentConfig): AgentProvider {
  const factory = providerFactories.get(config.providerType)
  if (!factory) {
    throw new Error(`Unknown provider type: ${config.providerType}`)
  }
  return factory(config)
}
