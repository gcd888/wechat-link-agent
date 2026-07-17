/**
 * LLM 配置应用器
 *
 * 将数据库中存储的 LLM 供应商配置写入到对应 Agent CLI 工具的配置文件中，
 * 使 CLI 工具能够实际使用配置的模型。
 *
 * 核心原理：
 *   - Claude CLI 读取 ~/.claude/settings.json 中的 env 字段
 *   - env 包含 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN、ANTHROPIC_MODEL 等环境变量
 *   - 切换供应商 = 将供应商的 settings_config 写入 settings.json
 *
 * 支持的 CLI 工具:
 *   - Claude Code: 写入 ~/.claude/settings.json
 *   - CodeBuddy:   写入 ~/.codebuddy/config.json
 *   - OpenCode:    写入 ~/.opencode/config.json
 *   - 通用:        写入 ~/.config/<command>/config.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { homedir } from 'node:os'
import { logger } from '../logger.js'
import { getDb, saveDb } from '../database/db.js'

// ── 类型定义 ──────────────────────────────────────────────────────────

/** LLM 供应商信息（从数据库读取） */
interface LlmProviderInfo {
  id: number
  name: string
  baseUris: Array<{ protocol: string; url: string }>
  apiKey: string
  models: Array<{ displayName: string; modelName: string }>
}

/** 模型配置（存储在 agents.model_config 字段） */
export interface ModelConfig {
  model: string                    // 模型名称（如 claude-sonnet-4-20250514）
  temperature?: number             // 温度参数（默认 0.7）
  maxTokens?: number               // 最大 token 数（默认 4096）
}

/** Agent 关联的 LLM 配置（从数据库 JOIN 查询） */
interface AgentLLMConfig {
  agentId: number
  command: string                  // CLI 命令，如 "claude"
  name: string                     // Agent 显示名称
  providerType: string             // Provider 类型: claude | codebuddy | opencode | generic
  llmProviderId: number | null     // 关联的 LLM 供应商 ID
  modelConfig: ModelConfig | null  // 模型配置
  provider: LlmProviderInfo | null // LLM 供应商详情
}

/** 配置应用结果 */
export interface ApplyResult {
  success: boolean
  configPath?: string              // 写入的配置文件路径
  error?: string                   // 失败原因
}

// ── 配置文件路径映射 ──────────────────────────────────────────────────

/**
 * 获取 CLI 工具的配置文件路径
 * 获取 CLI 工具的配置文件路径
 */
function getConfigPath(providerType: string, command: string): string {
  const home = homedir()

  switch (providerType) {
    case 'claude':
      // Claude Code: ~/.claude/settings.json（优先）或 ~/.claude/claude.json（兼容旧版）
      return path.join(home, '.claude', 'settings.json')

    case 'codebuddy':
      // CodeBuddy: ~/.codebuddy/config.json
      return path.join(home, '.codebuddy', 'config.json')

    case 'opencode':
      // OpenCode: ~/.opencode/config.json
      return path.join(home, '.opencode', 'config.json')

    case 'gemini':
      // Gemini CLI: ~/.gemini/settings.json
      return path.join(home, '.gemini', 'settings.json')

    default:
      // 通用: ~/.config/<command>/config.json
      return path.join(home, '.config', command, 'config.json')
  }
}

// ── 配置生成器 ──────────────────────────────────────────────────────────

/**
 * 生成 Claude Code 的 settings.json 配置
 *
 * Claude Code 的 settings.json 配置结构：
 *   settings_config = {
 *     env: {
 *       ANTHROPIC_BASE_URL: "https://api.example.com",
 *       ANTHROPIC_AUTH_TOKEN: "sk-xxx",
 *       ANTHROPIC_MODEL: "claude-sonnet-4-20250514",
 *       ANTHROPIC_DEFAULT_HAIKU_MODEL: "...",
 *       ANTHROPIC_DEFAULT_SONNET_MODEL: "...",
 *       ANTHROPIC_DEFAULT_OPUS_MODEL: "...",
 *     }
 *   }
 */
function generateClaudeConfig(
  provider: LlmProviderInfo,
  modelConfig: ModelConfig
): Record<string, any> {
  // 找到 anthropic 协议的 base URL，如果没有则用第一个
  const anthropicUri = provider.baseUris.find(u => u.protocol === 'anthropic')
  const baseUrl = anthropicUri?.url || provider.baseUris[0]?.url || ''

  // 获取模型名
  const model = modelConfig.model

  // 构建 env 配置（与 Claude CLI 的 settingsConfig.env 结构一致）
  const env: Record<string, string> = {}

  if (baseUrl) {
    env['ANTHROPIC_BASE_URL'] = baseUrl
  }

  if (provider.apiKey) {
    env['ANTHROPIC_AUTH_TOKEN'] = provider.apiKey
  }

  if (model) {
    env['ANTHROPIC_MODEL'] = model
    // 同时设置默认模型映射，让 Claude CLI 内部各档位都使用同一模型
    env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = model
    env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = model
    env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = model
  }

  // 返回标准 settings.json 格式
  return { env }
}

/**
 * 生成 CodeBuddy 的 config.json 配置
 */
function generateCodeBuddyConfig(
  provider: LlmProviderInfo,
  modelConfig: ModelConfig
): Record<string, any> {
  const openaiUri = provider.baseUris.find(u => u.protocol === 'openai')
  const anthropicUri = provider.baseUris.find(u => u.protocol === 'anthropic')
  const baseUrl = openaiUri?.url || anthropicUri?.url || provider.baseUris[0]?.url || ''

  return {
    llm: {
      provider: openaiUri ? 'openai' : 'anthropic',
      apiKey: provider.apiKey,
      baseUrl,
      model: modelConfig.model,
      temperature: modelConfig.temperature ?? 0.7,
      maxTokens: modelConfig.maxTokens ?? 4096,
    },
  }
}

/**
 * 生成 OpenCode 的 config.json 配置
 */
function generateOpenCodeConfig(
  provider: LlmProviderInfo,
  modelConfig: ModelConfig
): Record<string, any> {
  const openaiUri = provider.baseUris.find(u => u.protocol === 'openai')
  const anthropicUri = provider.baseUris.find(u => u.protocol === 'anthropic')
  const baseUrl = openaiUri?.url || anthropicUri?.url || provider.baseUris[0]?.url || ''

  return {
    ai: {
      provider: openaiUri ? 'openai' : 'anthropic',
      apiKey: provider.apiKey,
      apiEndpoint: baseUrl,
      model: modelConfig.model,
      temperature: modelConfig.temperature ?? 0.7,
      maxTokens: modelConfig.maxTokens ?? 4096,
    },
  }
}

/**
 * 生成通用 Agent CLI 的 config.json 配置
 */
function generateGenericConfig(
  provider: LlmProviderInfo,
  modelConfig: ModelConfig
): Record<string, any> {
  const baseUrl = provider.baseUris[0]?.url || ''

  return {
    provider: {
      type: provider.baseUris[0]?.protocol || 'openai',
      apiKey: provider.apiKey,
      apiUrl: baseUrl,
      model: modelConfig.model,
      parameters: {
        temperature: modelConfig.temperature ?? 0.7,
        maxTokens: modelConfig.maxTokens ?? 4096,
      },
    },
  }
}

/**
 * 配置生成器映射表
 */
const CONFIG_GENERATORS: Record<string, (provider: LlmProviderInfo, modelConfig: ModelConfig) => Record<string, any>> = {
  claude: generateClaudeConfig,
  codebuddy: generateCodeBuddyConfig,
  opencode: generateOpenCodeConfig,
  gemini: generateClaudeConfig,     // Gemini 使用类似 Claude 的 env 格式
  generic: generateGenericConfig,
}

// ── 数据库查询 ──────────────────────────────────────────────────────────

/**
 * 获取 Agent 的完整 LLM 配置（JOIN 查询 agents + llm_providers + llm_models）
 */
export async function getAgentLLMConfig(agentId: number): Promise<AgentLLMConfig | null> {
  try {
    const db = await getDb()

    // 查询 Agent 基本信息（JOIN agent_registry 读取 name/provider_type）
    const agentResult = db.exec(`
      SELECT a.id, a.command, r.name, r.provider_type, a.llm_provider_id, a.model_config
      FROM agents a
      INNER JOIN agent_registry r ON r.command = a.command
      WHERE a.id = ${agentId}
    `)
    if (!agentResult[0] || !agentResult[0].values[0]) return null

    const row = agentResult[0].values[0]
    const agent: AgentLLMConfig = {
      agentId: row[0] as number,
      command: row[1] as string,
      name: row[2] as string,
      providerType: row[3] as string,
      llmProviderId: row[4] as number | null,
      modelConfig: row[5] ? JSON.parse(row[5] as string) : null,
      provider: null,
    }

    // 如果有关联的 LLM 供应商，查询供应商详情
    if (agent.llmProviderId) {
      const providerResult = db.exec(`SELECT id, name, base_uris, api_key_encrypted, api_key_iv, api_key_tag FROM llm_providers WHERE id = ${agent.llmProviderId}`)
      if (providerResult[0] && providerResult[0].values[0]) {
        const pRow = providerResult[0].values[0]
        const baseUris = JSON.parse(pRow[2] as string || '[]')

        // 查询模型列表
        const modelsResult = db.exec(`SELECT display_name, model_name FROM llm_models WHERE provider_id = ${agent.llmProviderId} ORDER BY id`)
        const models = modelsResult[0] ? modelsResult[0].values.map((m: any[]) => ({
          displayName: m[0] as string,
          modelName: m[1] as string,
        })) : []

        agent.provider = {
          id: pRow[0] as number,
          name: pRow[1] as string,
          baseUris,
          apiKey: '', // API Key 需要解密，在 applyLLMConfig 时处理
          models,
        }
      }
    }

    return agent
  } catch (err) {
    logger.error('Failed to get agent LLM config', { agentId, error: String(err) })
    return null
  }
}

// ── 核心应用逻辑 ──────────────────────────────────────────────────────────

/**
 * 将 LLM 配置应用到 Agent CLI 工具的配置文件
 *
 * 流程：
 *   1. 从数据库读取 Agent 关联的 LLM 供应商和模型配置
 *   2. 根据 Provider 类型生成对应格式的配置内容
 *   3. 写入到 CLI 工具的配置文件（原子写入）
 *
 * @param agentId Agent ID
 * @param decryptedApiKey 解密后的 API Key（由调用方从加密模块获取）
 */
export async function applyLLMConfigToAgent(
  agentId: number,
  decryptedApiKey?: string
): Promise<ApplyResult> {
  try {
    const config = await getAgentLLMConfig(agentId)
    if (!config) {
      return { success: false, error: `Agent ${agentId} not found` }
    }

    if (!config.llmProviderId || !config.modelConfig) {
      return { success: false, error: 'Agent has no LLM configuration' }
    }

    if (!config.provider) {
      return { success: false, error: 'LLM provider not found' }
    }

    // 注入解密后的 API Key
    if (decryptedApiKey) {
      config.provider.apiKey = decryptedApiKey
    }

    const { providerType, command, provider, modelConfig } = config

    // 获取配置生成器
    const generator = CONFIG_GENERATORS[providerType] || CONFIG_GENERATORS.generic
    if (!generator) {
      return { success: false, error: `Unknown provider type: ${providerType}` }
    }

    // 生成配置内容
    const configContent = generator(provider, modelConfig)

    // 获取配置文件路径
    const configPath = getConfigPath(providerType, command)

    // 确保配置目录存在
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    // 如果配置文件已存在，尝试合并（保留用户已有的其他配置字段）
    let finalConfig = configContent
    if (fs.existsSync(configPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        // 深度合并：以新生成的配置为基础，叠加已有配置中不冲突的字段
        finalConfig = deepMerge(existing, configContent)
      } catch {
        // 解析失败则直接覆盖
        logger.warn('Failed to parse existing config, will overwrite', { configPath })
      }
    }

    // 原子写入：先写临时文件，再 rename
    const tmpPath = configPath + '.tmp.' + Date.now()
    fs.writeFileSync(tmpPath, JSON.stringify(finalConfig, null, 2), 'utf-8')
    fs.renameSync(tmpPath, configPath)

    logger.info('LLM config applied', {
      agentId,
      agentName: config.name,
      providerType,
      configPath,
      provider: provider.name,
      model: modelConfig.model,
    })

    return { success: true, configPath }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to apply LLM config', { agentId, error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

/**
 * 更新 Agent 的 LLM 配置并立即应用到 CLI 工具
 *
 * @param agentId Agent ID
 * @param llmProviderId LLM 供应商 ID（null 表示解除绑定）
 * @param modelConfig 模型配置
 * @param decryptedApiKey 解密后的 API Key（由调用方提供）
 * @param applyImmediately 是否立即写入配置文件
 */
export async function updateAgentLLMConfig(
  agentId: number,
  llmProviderId: number | null,
  modelConfig: ModelConfig | null,
  decryptedApiKey?: string,
  applyImmediately: boolean = true
): Promise<{ success: boolean; applyResult?: ApplyResult; error?: string }> {
  try {
    const db = await getDb()

    // 更新数据库中的关联关系（只更新 agents 表字段）
    const modelConfigStr = modelConfig ? JSON.stringify(modelConfig) : ''
    db.run(`UPDATE agents SET llm_provider_id = ${llmProviderId === null ? 'NULL' : llmProviderId}, model_config = '${modelConfigStr.replace(/'/g, "''")}', updated_at = datetime('now','localtime') WHERE id = ${agentId}`)
    saveDb()

    logger.info('Agent LLM config updated in DB', { agentId, llmProviderId, modelConfig })

    // 如果需要立即应用且有关联的供应商
    if (applyImmediately && llmProviderId && modelConfig) {
      const applyResult = await applyLLMConfigToAgent(agentId, decryptedApiKey)
      return { success: applyResult.success, applyResult, error: applyResult.error }
    }

    return { success: true }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to update agent LLM config', { agentId, error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

/**
 * 获取所有已绑定 LLM 配置的 Agent 列表
 */
export async function getAgentsWithLLMConfig(): Promise<Array<{ agentId: number; agentName: string; command: string; providerType: string }>> {
  try {
    const db = await getDb()
    // JOIN agent_registry 读取 name/provider_type（agents 表不再存储这些冗余字段）
    const result = db.exec(`
      SELECT a.id, r.name, a.command, r.provider_type
      FROM agents a
      INNER JOIN agent_registry r ON r.command = a.command
      WHERE a.llm_provider_id IS NOT NULL AND a.enabled = 1
    `)

    if (!result[0]) return []

    return result[0].values.map((row: any[]) => ({
      agentId: row[0] as number,
      agentName: row[1] as string,
      command: row[2] as string,
      providerType: row[3] as string,
    }))
  } catch {
    return []
  }
}

/**
 * 批量应用所有已绑定 LLM 配置的 Agent
 * 应用启动时调用，确保配置一致性
 *
 * @param getDecryptedApiKey 回调函数，用于获取解密后的 API Key
 */
export async function applyAllLLMConfigs(
  getDecryptedApiKey?: (providerId: number) => string | undefined
): Promise<{ total: number; success: number; failed: number }> {
  const agents = await getAgentsWithLLMConfig()
  let success = 0
  let failed = 0

  for (const agent of agents) {
    let apiKey: string | undefined
    if (getDecryptedApiKey && agent.agentId) {
      // 获取 Agent 关联的供应商 ID
      const config = await getAgentLLMConfig(agent.agentId)
      if (config?.llmProviderId) {
        apiKey = getDecryptedApiKey(config.llmProviderId)
      }
    }

    const result = await applyLLMConfigToAgent(agent.agentId, apiKey)
    if (result.success) {
      success++
    } else {
      failed++
      logger.warn('Failed to apply LLM config on startup', {
        agentId: agent.agentId,
        agentName: agent.agentName,
        error: result.error,
      })
    }
  }

  logger.info('Batch LLM config apply completed', { total: agents.length, success, failed })
  return { total: agents.length, success, failed }
}

// ── 工具函数 ──────────────────────────────────────────────────────────

/**
 * 深度合并两个对象
 * source 的值优先，但不会删除 target 中 source 没有的键
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

/**
 * 验证配置文件是否有效
 */
export function validateConfigFile(configPath: string): { valid: boolean; error?: string } {
  try {
    if (!fs.existsSync(configPath)) {
      return { valid: false, error: '配置文件不存在' }
    }

    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)

    // 检查必要字段
    const env = config.env || config.llm || config.ai || config.provider
    if (!env) {
      return { valid: false, error: '配置缺少必要的 LLM 配置字段' }
    }

    return { valid: true }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) }
  }
}
