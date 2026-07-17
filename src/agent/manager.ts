/**
 * Agent 管理器
 *
 * 负责 Agent 的增删改查、切换、状态管理、消息发送。
 * 运行在 Electron 主进程，通过 IPC 与渲染进程通信。
 *
 * 核心职责:
 *   - 管理 Agent 配置（CRUD）
 *   - 管理 Agent 运行时状态（online/offline/processing）
 *   - 提供 Agent 消息发送接口（统一调用 AgentProvider）
 *   - 管理当前 Agent 切换
 *   - 扫描 PATH 自动发现 CLI 工具
 */

import { getDb, saveDb, getConfig } from '../database/db.js'
import { logger } from '../logger.js'
import { sessionManager } from '../session.js'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { registerProvider, createProvider } from './provider.js'
import { ClaudeProvider } from './providers/claude.js'
import { OpenCodeProvider } from './providers/opencode.js'
import { CodeBuddyProvider } from './providers/codebuddy.js'
import { GenericProvider } from './providers/generic.js'
import { CodexProvider } from './providers/codex.js'
import { MimoProvider } from './providers/mimo.js'
import { TraeProvider } from './providers/trae.js'
import { scanAll, getRegistry, entryToConfig, clearScanCache, type ScanResult } from './scanner.js'
import { scanCommands } from './command-scanner.js'
import type {
  AgentConfig,
  AgentInfo,
  AgentRegistryEntry,
  AgentStatus,
  AgentOutput,
  QueryInput,
} from './types.js'

// ── 注册内置 Provider ──────────────────────────────────────
registerProvider('claude', (config) => new ClaudeProvider(config))
registerProvider('opencode', (config) => new OpenCodeProvider(config))
registerProvider('codebuddy', (config) => new CodeBuddyProvider(config))
registerProvider('generic', (config) => new GenericProvider(config))
registerProvider('codex', (config) => new CodexProvider(config))
registerProvider('mimo', (config) => new MimoProvider(config))
registerProvider('trae', (config) => new TraeProvider(config))

/** 状态变更回调函数类型 */
type StatusChangeCallback = (agentId: number, agentName: string, status: AgentStatus) => void

class AgentManager {
  /** Agent 运行时状态缓存 */
  private agentStates: Map<number, AgentInfo> = new Map()
  /** 当前 Agent 的 ID */
  private currentAgentId: number | null = null
  /** 当前会话的 ID（用于多会话支持，null 表示尚未选择会话） */
  private currentSessionId: number | null = null
  /** 当前正在使用的 Provider 实例（用于 abort） */
  private currentProvider: ReturnType<typeof createProvider> | null = null
  /** 状态变更回调列表（主进程注册，用于推送 IPC 事件到渲染进程） */
  private statusChangeCallbacks: StatusChangeCallback[] = []

  /**
   * 初始化 Agent 管理器
   * 从数据库加载所有 Agent 配置，更新运行时状态
   */
  async init(): Promise<void> {
    await this.loadFromDb()
    logger.info('AgentManager initialized', { agentCount: this.agentStates.size })
    // 打印所有已加载的 Agent 名称
    for (const [id, agent] of this.agentStates) {
      logger.debug('Agent loaded from DB', { id, name: agent.name })
    }
  }

  /**
   * 从数据库加载 Agent 列表
   * 通过 JOIN agent_registry 读取 name/icon/provider_type/vendor_* 等元信息
   * agents 表只存储运行时字段（cli_path/args/cwd/model/enabled/is_default/llm_provider_id/model_config）
   */
  private async loadFromDb(): Promise<void> {
    this.agentStates.clear()
    this.currentAgentId = null
    const db = await getDb()
    // JOIN 查询：agents 运行时数据 + agent_registry 元信息
    const results = db.exec(`
      SELECT a.id, a.command, a.cli_path, a.args, a.cwd, a.model,
             a.enabled, a.is_default, a.llm_provider_id, a.model_config,
             a.created_at, a.updated_at,
             r.name, r.icon, r.provider_type, r.default_args, r.default_model,
             r.vendor_en, r.vendor_zh, r.vendor_tw
      FROM agents a
      INNER JOIN agent_registry r ON r.command = a.command
      WHERE a.enabled = 1
      ORDER BY a.is_default DESC, r.name ASC
    `)

    for (const row of results[0]?.values || []) {
      const agent = this.rowToAgentInfo(row, results[0].columns)
      this.agentStates.set(agent.id!, agent)
    }

    // 设置默认 Agent
    const defaultAgent = Array.from(this.agentStates.values()).find((a) => a.isDefault)
    if (defaultAgent) {
      this.currentAgentId = defaultAgent.id!
    } else if (this.agentStates.size > 0) {
      this.currentAgentId = this.agentStates.values().next().value!.id!
    }
  }

  /**
   * 将 JOIN 查询结果行转换为 AgentInfo
   * 列来自 agents 表 + agent_registry 表（通过 JOIN）
   * args/model 有回退逻辑：agents 表为空时使用 registry 的 default_args/default_model
   */
  private rowToAgentInfo(row: unknown[], columns: string[]): AgentInfo {
    const col = (name: string) => {
      const idx = columns.indexOf(name)
      return idx >= 0 ? row[idx] : null
    }

    // args 回退：agents.args 为空时使用 agent_registry.default_args
    const agentArgs = String(col('args') || '')
    const registryArgs = String(col('default_args') || '')
    // model 回退：agents.model 为空时使用 agent_registry.default_model
    const agentModel = String(col('model') || '')
    const registryModel = String(col('default_model') || '')

    return {
      id: Number(col('id')),
      name: String(col('name') || ''),          // 来自 agent_registry
      command: String(col('command') || ''),
      cliPath: String(col('cli_path') || ''),
      icon: String(col('icon') || ''),          // 来自 agent_registry
      args: agentArgs || registryArgs,           // 用户配置优先，回退到 registry
      cwd: String(col('cwd') || ''),
      model: agentModel || registryModel,        // 用户配置优先，回退到 registry
      enabled: Boolean(col('enabled')),
      isDefault: Boolean(col('is_default')),
      providerType: (String(col('provider_type') || 'generic')) as any,  // 来自 agent_registry
      vendorEn: String(col('vendor_en') || ''),  // 来自 agent_registry
      vendorZh: String(col('vendor_zh') || ''),  // 来自 agent_registry
      vendorTw: String(col('vendor_tw') || ''),  // 来自 agent_registry
      llmProviderId: col('llm_provider_id') !== null ? Number(col('llm_provider_id')) : null,
      modelConfig: (() => {
        const raw = col('model_config')
        if (!raw) return null
        try { return JSON.parse(String(raw)) } catch { return null }
      })(),
      createdAt: String(col('created_at') || ''),
      updatedAt: String(col('updated_at') || ''),
      status: 'online',
    }
  }

  /**
   * 注册状态变更回调
   * 当 Agent 状态从 online → processing 或 processing → online 时触发
   */
  onStatusChange(callback: StatusChangeCallback): void {
    this.statusChangeCallbacks.push(callback)
  }

  /**
   * 通知所有状态变更回调
   */
  private notifyStatusChange(agent: AgentInfo): void {
    for (const cb of this.statusChangeCallbacks) {
      try {
        cb(agent.id!, agent.name, agent.status)
      } catch (err) {
        logger.error('Status change callback error', err)
      }
    }
  }

  /**
   * 获取所有 Agent 列表
   */
  list(): AgentInfo[] {
    return Array.from(this.agentStates.values())
  }

  /**
   * 获取当前 Agent
   */
  getCurrent(): AgentInfo | null {
    if (!this.currentAgentId) return null
    return this.agentStates.get(this.currentAgentId) || null
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): number | null {
    return this.currentSessionId
  }

  /**
   * 设置当前会话 ID（切换会话时调用）
   */
  setCurrentSessionId(sessionId: number | null): void {
    this.currentSessionId = sessionId
    logger.info('Current session set', { sessionId })
  }

  /**
   * 获取运行时状态汇总
   * 返回当前 Agent 和所有 Agent 的状态信息
   */
  getStatus(): { current: AgentInfo | null; all: AgentInfo[] } {
    return {
      current: this.getCurrent(),
      all: this.list(),
    }
  }

  /**
   * 获取指定 Agent
   */
  get(id: number): AgentInfo | undefined {
    return this.agentStates.get(id)
  }

  /**
   * 按名称获取 Agent
   */
  getByName(name: string): AgentInfo | undefined {
    return Array.from(this.agentStates.values()).find(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    )
  }

  /**
   * 按启动命令获取 Agent（如 'claude'、'opencode'）
   */
  getByCommand(command: string): AgentInfo | undefined {
    return Array.from(this.agentStates.values()).find(
      (a) => a.command.toLowerCase() === command.toLowerCase()
    )
  }

  /**
   * 添加新 Agent
   * 只写入 agents 表字段（name/icon/provider_type/vendor_* 从 agent_registry JOIN 读取）
   */
  async add(config: AgentConfig): Promise<AgentInfo> {
    const db = await getDb()

    // 如果新 Agent 被设为默认，先清除其他 Agent 的默认标记，确保唯一默认
    if (config.isDefault) {
      db.run('UPDATE agents SET is_default = 0')
      for (const agent of this.agentStates.values()) {
        agent.isDefault = false
      }
    }

    // id 来自 agent_registry（稳定标识符）
    const useRegistryId = config.id !== undefined && config.id !== null
    if (useRegistryId) {
      db.run(
        `INSERT INTO agents (id, command, cli_path, args, cwd, model, enabled, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.id,
          config.command,
          config.cliPath || '',
          config.args || '',
          config.cwd || '',
          config.model || '',
          config.enabled ? 1 : 0,
          config.isDefault ? 1 : 0,
        ],
      )
    } else {
      db.run(
        `INSERT INTO agents (command, cli_path, args, cwd, model, enabled, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          config.command,
          config.cliPath || '',
          config.args || '',
          config.cwd || '',
          config.model || '',
          config.enabled ? 1 : 0,
          config.isDefault ? 1 : 0,
        ],
      )
    }
    saveDb()

    // 获取新插入的 ID
    const id = useRegistryId ? config.id! : (() => {
      const idResult = db.exec('SELECT MAX(id) FROM agents')
      return Number(idResult[0]?.values[0]?.[0]) || Date.now()
    })()
    const info: AgentInfo = {
      ...config,
      id,
      status: 'online',
    }
    this.agentStates.set(id, info)

    logger.info('Agent added', { name: config.name, id, fromRegistry: useRegistryId })
    return info
  }

  /**
   * 删除 Agent
   */
  async remove(id: number): Promise<boolean> {
    if (!this.agentStates.has(id)) return false

    const db = await getDb()
    db.run('DELETE FROM agents WHERE id = ?', [id])
    saveDb()

    this.agentStates.delete(id)

    // 如果删除的是当前 Agent，切换到第一个
    if (this.currentAgentId === id) {
      this.currentAgentId = this.agentStates.size > 0
        ? this.agentStates.values().next().value!.id!
        : null
    }

    logger.info('Agent removed', { id })
    return true
  }

  /**
   * 更新 Agent 配置
   * 只更新 agents 表字段（name/icon/provider_type/vendor_* 不在此表中，由 agent_registry 管理）
   */
  async update(id: number, updates: Partial<AgentConfig>): Promise<boolean> {
    const existing = this.agentStates.get(id)
    // 缓存不存在时不阻塞数据库更新（syncFromScan 可能在 init 前调用）

    const db = await getDb()
    const fields: string[] = []
    const values: unknown[] = []

    // 只更新 agents 表中存在的字段
    if (updates.command !== undefined) { fields.push('command = ?'); values.push(updates.command) }
    if (updates.cliPath !== undefined) { fields.push('cli_path = ?'); values.push(updates.cliPath) }
    if (updates.args !== undefined) { fields.push('args = ?'); values.push(updates.args) }
    if (updates.cwd !== undefined) { fields.push('cwd = ?'); values.push(updates.cwd) }
    if (updates.model !== undefined) { fields.push('model = ?'); values.push(updates.model) }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0) }
    if (updates.isDefault !== undefined) { fields.push('is_default = ?'); values.push(updates.isDefault ? 1 : 0) }
    if (updates.llmProviderId !== undefined) { fields.push('llm_provider_id = ?'); values.push(updates.llmProviderId) }
    if (updates.modelConfig !== undefined) { fields.push('model_config = ?'); values.push(updates.modelConfig ? JSON.stringify(updates.modelConfig) : '') }

    if (fields.length === 0) return false

    // 如果设为默认，先清除其他所有 Agent 的默认标记，确保唯一默认
    if (updates.isDefault) {
      db.run('UPDATE agents SET is_default = 0 WHERE id != ?', [id])
      for (const [agentId, agent] of this.agentStates) {
        if (agentId !== id) agent.isDefault = false
      }
    }

    fields.push("updated_at = datetime('now','localtime')")
    values.push(id)

    db.run(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, values as any[])
    saveDb()

    // 更新缓存（如果存在）
    if (existing) {
      Object.assign(existing, updates)
      if (updates.isDefault && this.currentAgentId !== id) {
        this.currentAgentId = id
      }
    }

    logger.info('Agent updated', { id, fields: fields.length })
    return true
  }

  /**
   * 切换到指定 Agent
   * 支持按 name 或 command 匹配（先按 name 查，找不到再按 command 查）
   */
  async switchTo(nameOrCommand: string): Promise<boolean> {
    let agent = this.getByName(nameOrCommand)
    if (!agent || !agent.id) {
      agent = this.getByCommand(nameOrCommand)
    }
    if (!agent || !agent.id) return false

    // 中止当前正在执行的任务
    this.abort()

    this.currentAgentId = agent.id
    // 切换 Agent 时重置当前会话（由前端决定加载哪个会话）
    this.currentSessionId = null
    logger.info('Switched agent', { name: agent.name })
    return true
  }

  /**
   * 发送消息给当前 Agent
   * 通过 AsyncIterable 返回流式输出
   */
  async *send(input: Omit<QueryInput, 'signal'>): AsyncIterable<AgentOutput> {
    const current = this.getCurrent()
    if (!current) {
      yield { type: 'error', message: 'No agent selected' }
      yield { type: 'done', fullText: '' }
      return
    }

    // 设置状态为 processing，并通知回调
    current.status = 'processing'
    this.notifyStatusChange(current)

    const agentConfig: AgentConfig = {
      name: current.name,
      command: current.command,
      cliPath: current.cliPath,
      icon: current.icon || '',
      args: current.args,
      cwd: current.cwd,
      model: current.model,
      enabled: current.enabled,
      isDefault: current.isDefault,
      providerType: current.providerType,
      vendorEn: current.vendorEn,
      vendorZh: current.vendorZh,
      vendorTw: current.vendorTw,
    }

    const provider = createProvider(agentConfig)
    this.currentProvider = provider

    try {
      const abortController = new AbortController()
      for await (const output of provider.query({
        ...input,
        signal: abortController.signal,
      })) {
        yield output
      }
    } finally {
      current.status = 'online'
      this.currentProvider = null
      this.notifyStatusChange(current)
    }
  }

  /**
   * 查询指定 Agent（不影响 currentAgentId / currentProvider，支持并行调用）
   * 用于 /all 命令：同时对多个 Agent 发起查询，各自独立。
   * 返回完整回复文本，超时则返回错误。
   *
   * @param agentId  目标 Agent ID
   * @param input    查询输入（prompt / cwd / model / images 等）
   * @param timeoutMs 超时毫秒数，默认 120 秒
   */
  async queryAgent(
    agentId: number,
    input: Omit<QueryInput, 'signal'>,
    timeoutMs: number = 120000,
  ): Promise<{ success: boolean; content: string; error?: string }> {
    const agent = this.agentStates.get(agentId)
    if (!agent) {
      return { success: false, content: '', error: 'Agent 不存在' }
    }

    const agentConfig: AgentConfig = {
      name: agent.name,
      command: agent.command,
      cliPath: agent.cliPath,
      icon: agent.icon || '',
      args: agent.args,
      cwd: agent.cwd,
      model: agent.model,
      enabled: agent.enabled,
      isDefault: agent.isDefault,
      providerType: agent.providerType,
      vendorEn: agent.vendorEn,
      vendorZh: agent.vendorZh,
      vendorTw: agent.vendorTw,
    }

    // 为此查询创建独立的 Provider 实例（不影响 currentProvider）
    const provider = createProvider(agentConfig)

    // 设置状态为 processing
    agent.status = 'processing'
    this.notifyStatusChange(agent)

    try {
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)

      let fullText = ''
      for await (const output of provider.query({
        ...input,
        signal: abortController.signal,
      })) {
        if (output.type === 'text') {
          fullText += output.delta
        } else if (output.type === 'done') {
          fullText = output.fullText || fullText
          if (output.sessionId) {
            // 更新 SDK session ID
            const sessions = await sessionManager.getSessions(agentId)
            if (sessions.length > 0) {
              await sessionManager.updateSdkSessionId(sessions[0].id, output.sessionId)
            }
          }
        } else if (output.type === 'error') {
          clearTimeout(timeoutId)
          return { success: false, content: '', error: output.message || '未知错误' }
        }
      }

      clearTimeout(timeoutId)
      return { success: true, content: fullText }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 超时
      if (msg.includes('aborted') || msg.includes('AbortError')) {
        return { success: false, content: '', error: `⏱ 超时（${timeoutMs / 1000}秒内未响应）` }
      }
      return { success: false, content: '', error: msg }
    } finally {
      agent.status = 'online'
      this.notifyStatusChange(agent)
    }
  }

  /**
   * 中止当前正在执行的任务
   */
  abort(): void {
    if (this.currentProvider) {
      this.currentProvider.abort()
      this.currentProvider = null
    }

    // 重置 processing 状态的 Agent，并通知回调
    for (const agent of this.agentStates.values()) {
      if (agent.status === 'processing') {
        agent.status = 'online'
        this.notifyStatusChange(agent)
      }
    }
  }

  /**
   * 扫描 PATH 中的 CLI 工具
   */
  scanAll(): Promise<ScanResult> {
    return scanAll()
  }

  /**
   * 获取 Agent 的有效工作目录
   * 优先级：Agent 自身 cwd > 系统配置 workingDirectory > 默认目录
   * 默认目录：Windows/macOS → ~/Documents，Linux → ~
   */
  getEffectiveCwd(agentCwd?: string): string {
    // 1. Agent 自身配置的 cwd
    if (agentCwd) return agentCwd
    // 2. 系统配置的默认工作空间
    const configWd = getConfig('workingDirectory')
    if (configWd) return configWd
    // 3. 平台默认目录
    return process.platform === 'linux'
      ? homedir()
      : join(homedir(), 'Documents')
  }

  /**
   * 获取有聊天记录的 Agent 列表
   * JOIN agent_registry 读取完整信息
   */
  async listWithChats(): Promise<AgentInfo[]> {
    const db = await getDb()
    const results = db.exec(`
      SELECT DISTINCT
        a.id, a.command, a.cli_path, a.args, a.cwd, a.model,
        a.enabled, a.is_default, a.llm_provider_id, a.model_config,
        a.created_at, a.updated_at,
        r.name, r.icon, r.provider_type, r.default_args, r.default_model,
        r.vendor_en, r.vendor_zh, r.vendor_tw
      FROM agents a
      INNER JOIN agent_registry r ON r.command = a.command
      INNER JOIN sessions s ON s.agent_id = a.id
      INNER JOIN messages m ON m.session_id = s.id
      WHERE a.enabled = 1
      ORDER BY s.updated_at DESC
    `)
    const agents: AgentInfo[] = []
    const seen = new Set<number>()
    for (const row of results[0]?.values || []) {
      const agent = this.rowToAgentInfo(row, results[0].columns)
      if (!seen.has(agent.id!)) {
        seen.add(agent.id!)
        agents.push(agent)
      }
    }
    return agents
  }

  /**
   * 获取注册表
   */
  async getRegistry(): Promise<AgentRegistryEntry[]> {
    return getRegistry()
  }

  /**
   * 从注册表条目创建 Agent 配置
   */
  entryToConfig(entry: AgentRegistryEntry, path: string): AgentConfig {
    return entryToConfig(entry, path)
  }

  /**
   * 同步已安装 Agent 列表，重新扫描 PATH 并更新
   * 每次启动和手动刷新时调用
   *
   * 重要：不删除 agents 表，而是按 command 匹配更新已有记录。
   * 这确保了 agent_id 不变，避免 session 因外键关联的 agent_id 漂移变成孤儿数据。
   */
  async syncFromScan(): Promise<void> {
    const db = await getDb()

    // 清除扫描缓存，确保检测到刚安装的 CLI
    clearScanCache()
    const scanResult = await scanAll()

    // 过滤掉 status=0（已关闭）的 Agent，不加入已安装列表
    const activeFound = scanResult.found.filter((f) => f.entry.status !== 0)
    // 对于已关闭的 Agent，如果之前已在 agents 表中，需要移除
    const closedCommands = scanResult.found.filter((f) => f.entry.status === 0).map((f) => f.entry.command.toLowerCase())

    // 查询现有 Agent，按 command 建立映射（command 是 UNIQUE）
    const existingByCommand = new Map<string, { id: number; name: string }>()
    const existingRows = db.exec('SELECT id, command FROM agents')
    if (existingRows[0]) {
      for (const row of existingRows[0].values) {
        const cmd = String(row[1] || '').toLowerCase()
        if (cmd) existingByCommand.set(cmd, { id: Number(row[0]), name: String(row[1]) })
      }
    }

    // 移除已关闭的 Agent（之前可能在 agents 表中）
    if (closedCommands.length > 0) {
      for (const cmd of closedCommands) {
        const existing = existingByCommand.get(cmd)
        if (existing) {
          await this.remove(existing.id)
          logger.info('Removed disabled Agent from agents table', { command: cmd, id: existing.id })
        }
      }
    }

    let first = true
    for (const found of activeFound) {
      const cmd = found.entry.command.toLowerCase()
      const config = entryToConfig(found.entry, found.path)
      const existing = existingByCommand.get(cmd)

      if (existing) {
        // 已存在相同 command 的 Agent → UPDATE，保持 ID 不变
        // 只更新 agents 表字段（cli_path 可能变了），name/icon/provider_type 等由 agent_registry 管理
        const updates: Partial<AgentConfig> & { isDefault: boolean } = {
          cliPath: config.cliPath,
          enabled: true,
          isDefault: first,
        }
        await this.update(existing.id, updates)
        // 更新 agentStates 缓存中的 name 等字段（update 已做了 Object.assign）
        if (first) this.currentAgentId = existing.id
      } else {
        // 新 Agent → INSERT
        config.isDefault = first
        await this.add(config)
      }
      first = false
    }

    // 清理已卸载的 Agent：注册表中存在但扫描器未找到的 CLI（status != 0 的活跃条目）
    // 这会移除用户已手动卸载的 CLI 对应的 Agent 记录
    // 注意：只清理注册表中已知的命令，不影响用户手动添加的自定义 Agent
    const uninstalledCommands = scanResult.notFound
      .filter((e) => e.status !== 0) // 只处理活跃的注册表条目（跳过已关闭的）
      .map((e) => e.command.toLowerCase())

    let removedCount = 0
    for (const cmd of uninstalledCommands) {
      const existing = existingByCommand.get(cmd)
      if (existing) {
        await this.remove(existing.id)
        removedCount++
        logger.info('Removed uninstalled Agent from agents table', { command: cmd, id: existing.id })
      }
    }

    logger.info('Agent sync from scan completed', {
      total: activeFound.length,
      existing: existingByCommand.size,
      disabled: closedCommands.length,
      uninstalled: removedCount,
    })

    // 安全检查：确保数据库中只有一个默认 Agent（防止历史数据残留导致多默认）
    // 如果扫描结果为空，清除所有默认标记
    if (activeFound.length === 0) {
      db.run('UPDATE agents SET is_default = 0')
      saveDb()
      for (const agent of this.agentStates.values()) {
        agent.isDefault = false
      }
    } else {
      // 查询 DB 中 is_default=1 的记录数，如果超过 1 个则只保留第一个
      const defaultRows = db.exec('SELECT id FROM agents WHERE is_default = 1 ORDER BY id ASC')
      if (defaultRows[0] && defaultRows[0].values.length > 1) {
        const keepId = Number(defaultRows[0].values[0][0])
        db.run('UPDATE agents SET is_default = 0 WHERE id != ?', [keepId])
        saveDb()
        // 同步更新内存缓存
        for (const [agentId, agent] of this.agentStates) {
          if (agentId !== keepId) agent.isDefault = false
          else agent.isDefault = true
        }
        logger.warn('Multiple default agents detected, kept only one', { keepId })
      }
    }

    // 同步第三方斜杠命令（技能/插件）
    await this.syncCommands()
  }

  /**
   * 同步第三方斜杠命令
   * 先删除所有非 builtin 的命令记录，再扫描 ~/.claude/skills 和 ~/.claude/plugins
   * 将发现的技能/插件命令插入 agent_commands 表
   */
  async syncCommands(): Promise<void> {
    const db = await getDb()

    // 删除非内置命令（skill / plugin），保留 builtin
    db.run("DELETE FROM agent_commands WHERE source != 'builtin'")

    // 扫描第三方命令
    const scanned = scanCommands()
    let order = 100 // 第三方命令从 100 开始排序，排在内置命令之后
    for (const cmd of scanned) {
      db.run(
        `INSERT OR IGNORE INTO agent_commands (agent_command, slash, description_en, description_zh, description_tw, source, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['claude', cmd.slash, cmd.descriptionEn, cmd.descriptionZh, cmd.descriptionTw, cmd.source, order++],
      )
    }

    saveDb()
    logger.info('Third-party commands synced', { count: scanned.length })
  }
}

export const agentManager = new AgentManager()
