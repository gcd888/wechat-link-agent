/**
 * Agent 相关类型定义
 *
 * 包含 Agent 配置、运行时状态、注册表条目、Provider 接口等核心类型。
 * 所有 Agent 操作基于这些类型定义。
 */

/** Agent 运行时状态 */
export type AgentStatus = 'online' | 'offline' | 'processing'

/** Agent Provider 类型，决定了流式输出解析方式 */
export type ProviderType = 'claude' | 'opencode' | 'codebuddy' | 'codex' | 'gemini' | 'mimo' | 'trae' | 'generic'

/** Agent 配置（对应数据库 agents 表） */
export interface AgentConfig {
  id?: number
  name: string
  command: string
  cliPath: string
  icon: string            // SVG 图标文件名或 URL
  args: string
  cwd: string
  model: string
  enabled: boolean
  isDefault: boolean
  providerType: ProviderType
  vendorEn: string        // 所属厂商（英文），如 "Anthropic"、"Google"
  vendorZh: string        // 所属厂商（中文简体），如 "Anthropic"、"谷歌"
  vendorTw: string        // 所属厂商（中文繁体），如 "Anthropic"、"谷歌"
  llmProviderId?: number | null  // 关联的 LLM 供应商 ID（llm_providers.id），null 表示未绑定
  modelConfig?: ModelConfig | null  // 模型配置（含 model/temperature/maxTokens）
  createdAt?: string
  updatedAt?: string
}

/** 模型配置（存储在 agents.model_config 字段） */
export interface ModelConfig {
  model: string                    // 模型名称（如 claude-sonnet-4-20250514）
  temperature?: number             // 温度参数（默认 0.7）
  maxTokens?: number               // 最大 token 数（默认 4096）
}

/** Agent 运行时状态信息 */
export interface AgentInfo extends AgentConfig {
  status: AgentStatus
  lastUsed?: number
  error?: string
}

/** Agent 注册表条目 */
export interface AgentRegistryEntry {
  id?: number                 // 对应 agent_registry 表的自增 ID（稳定标识符，用于 agents.id）
  command: string
  name: string
  providerType: ProviderType
  icon?: string           // 默认图标文件名
  installCommands: AgentInstallCommand[]  // 按平台的安装命令
  defaultArgs?: string
  defaultModel?: string
  vendorEn?: string       // 所属厂商（英文）
  vendorZh?: string       // 所属厂商（中文简体）
  vendorTw?: string       // 所属厂商（中文繁体）
  flag?: string           // 标签，逗号分隔，如 "企业用户,个人不可用"
  status: number          // 启用状态: 0=关闭 1=开启
  platforms: string[]
}

/** Agent 安装命令（按平台） */
export interface AgentInstallCommand {
  platform: string       // win32 | darwin | linux
  installHint: string
  installCommand: string
  uninstallCommand?: string  // 卸载命令（为空表示不支持一键卸载）
}

/** 查询输入参数 */
export interface QueryInput {
  prompt: string
  cwd: string
  sessionId?: string
  model?: string
  images?: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>
  files?: Array<{ path: string; name: string }>
  signal?: AbortSignal
}

/** Agent 输出（流式事件） */
export type AgentOutput =
  | { type: 'text'; delta: string }
  | { type: 'turn_end'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'done'; fullText: string; sessionId?: string }

/** Agent 消息 */
export interface AgentMessage {
  id?: number
  sessionId: number
  agentName: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source: 'desktop' | 'wechat'
  timestamp: number
}
