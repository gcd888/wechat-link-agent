/**
 * 双向同步管理器
 *
 * 核心职责:
 *   1. 启动/停止微信消息监听（monitor）
 *   2. 处理微信消息 → 命令路由 或 Agent 调用
 *   3. Agent 流式输出 → 桌面实时显示 + 微信分块推送
 *   4. 限频暂存队列管理（pending-queue）
 *   5. 微信扫码登录流程
 *
 * 消息流:
 *   场景 A（桌面）: 桌面输入 → AgentManager.send() → IPC 推送桌面
 *   场景 B（微信）: 微信消息 → monitor → 命令路由/Agent → 推回微信 + IPC 推送桌面
 */

import { BrowserWindow, app as electronApp } from 'electron'
import { WeChatApi } from './wechat/api.js'
import { startWeixinLoginWithQr, waitForWeixinLogin } from './wechat/login.js'
import { createMonitor, type MonitorCallbacks } from './wechat/monitor.js'
import { createSender } from './wechat/send.js'
import { downloadImage, extractText, extractFirstImageUrl, extractFirstFileItem, downloadFile } from './wechat/media.js'
import { loadLatestAccount, type AccountData } from './wechat/accounts.js'
import { MessageType, type WeixinMessage } from './wechat/types.js'
import { splitMessage } from './utils/split-message.js'
import { filterToolNoise } from './utils/tool-noise-filter.js'
import { loadPendingQueue, savePendingQueue, type PendingItem } from './pending-queue.js'
import { routeCommand, type CommandContext } from './commands/router.js'
import { agentManager } from './agent/manager.js'
import { sessionManager } from './session.js'
import { logger } from './logger.js'
import { t } from './i18n/index.js'

/** 微信连接状态 */
export interface WeChatStatus {
  connected: boolean
  accountId?: string
  userId?: string
}

/** QR 登录信息 */
export interface QrLoginInfo {
  qrcodeUrl: string
  qrcodeId: string
}

class SyncManager {
  private api: WeChatApi | null = null
  private monitor: ReturnType<typeof createMonitor> | null = null
  private account: AccountData | null = null
  private connected = false
  private sender: ReturnType<typeof createSender> | null = null
  private mainWindow: BrowserWindow | null = null
  /** 最近一次微信消息的发送者 ID（桌面端 ClawBot 回复用） */
  private lastFromUserId: string | null = null
  /** 最近一次微信消息的 context_token（桌面端 ClawBot 回复用） */
  private lastContextToken: string | null = null
  /** 待发送的欢迎消息（首次绑定后暂存，等有 context_token 再发） */
  private pendingWelcome: string | null = null
  /**
   * 扫码会话自增 ID。每次 startQrLogin 自增，用于让旧 waitForQrScan 的状态事件失效。
   * 防止用户在扫码中途重新点击绑定按钮后，旧轮询推送的 scaned/regenerated 事件污染新流程。
   */
  private scanSessionId = 0

  /** 设置主窗口引用（用于 IPC 推送） */
  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win
  }

  /** 获取连接状态 */
  getStatus(): WeChatStatus {
    if (!this.connected || !this.account) {
      return { connected: false }
    }
    return {
      connected: true,
      accountId: this.account.accountId,
      userId: this.account.userId,
    }
  }

  /**
   * 从已保存的账号恢复连接
   * 应用启动时调用
   */
  async restoreFromSavedAccount(): Promise<boolean> {
    const account = await loadLatestAccount()
    if (!account) {
      logger.info('No saved WeChat account found')
      return false
    }
    return this.connect(account)
  }

  /**
   * 连接微信（使用已有账号凭证）
   */
  async connect(account: AccountData): Promise<boolean> {
    try {
      this.account = account
      this.api = new WeChatApi(account.botToken, account.baseUrl)
      this.sender = createSender(this.api, account.accountId)
      this.connected = true

      // 启动消息监听
      this.startMonitor()

      logger.info('WeChat connected', { accountId: account.accountId })
      return true
    } catch (err) {
      logger.error('WeChat connect failed', { error: err instanceof Error ? err.message : String(err) })
      this.connected = false
      return false
    }
  }

  /**
   * 第一阶段：请求二维码
   * API 返回的 qrcode_img_content 是一个 URL，前端用 qrcode 库生成二维码图片
   *
   * 同时自增 scanSessionId，让任何进行中的旧 waitForQrScan 状态事件失效。
   */
  async startQrLogin(): Promise<QrLoginInfo> {
    this.scanSessionId++
    return startWeixinLoginWithQr()
  }

  /**
   * 第二阶段：等待扫码确认
   *
   * 启用 autoRegenerate：二维码过期时自动重新生成，无需用户重新点击按钮。
   * 通过 onStatusChange 回调把中间状态推送到渲染进程的 wechat:scanStatus 事件，
   * 让 UI 可以显示"已扫码请确认"以及刷新二维码。
   *
   * 通过捕获 scanSessionId 过滤旧会话事件：用户重新点击绑定按钮后，
   * 旧轮询推送的 scaned/regenerated 事件不会污染新流程。
   *
   * confirmed 事件会裁剪 account 字段，避免 botToken 等敏感数据经 IPC 传到渲染进程。
   *
   * 成功后自动连接，并发送欢迎消息。
   */
  async waitForQrScan(qrcodeId: string): Promise<boolean> {
    const sessionId = this.scanSessionId
    try {
      const account = await waitForWeixinLogin(qrcodeId, {
        autoRegenerate: true,
        maxRegenerate: 3,
        onStatusChange: (event) => {
          // 用户在此轮询期间重新发起了 startQrLogin，丢弃旧会话的事件
          if (this.scanSessionId !== sessionId) return
          // confirmed 事件裁剪敏感字段（botToken/baseUrl 不应送到渲染进程）
          if (event.status === 'confirmed') {
            this.pushToDesktop('wechat:scanStatus', {
              status: 'confirmed',
              account: { accountId: event.account.accountId, userId: event.account.userId },
            })
            return
          }
          this.pushToDesktop('wechat:scanStatus', event)
        },
      })
      // 扫码期间用户重新发起了绑定，丢弃本次结果（新流程会自行处理）
      if (this.scanSessionId !== sessionId) {
        logger.info('QR scan result discarded, superseded by new login session')
        return false
      }
      const ok = await this.connect(account)
      if (ok) {
        // 首次扫码绑定成功，延迟发送欢迎消息（等 monitor 启动完毕）
        setTimeout(() => this.sendWelcomeMessage(account.userId), 2000)
      }
      return ok
    } catch (err) {
      logger.error('QR scan failed', { error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  /**
   * 发送欢迎消息到微信端
   * 首次绑定微信后调用，语言由 t() 自动从 config 读取
   *
   * 注意：引导提示（guide）已移至设置页前端直接显示，此处仅暂存欢迎消息，
   * 等用户在微信端发送第一条消息（带 context_token）后再推送欢迎文本。
   */
  async sendWelcomeMessage(userId: string): Promise<void> {
    const version = electronApp.getVersion()
    const welcomeText = t('bot.welcome.text', '🎉 欢迎使用微连 (WeChat Link Agent) v{{version}}！', { version })

    // 暂存欢迎消息，等第一条用户消息到达（有了 context_token）再发送
    this.pendingWelcome = welcomeText

    logger.info('Welcome message pending, waiting for first WeChat message', { userId })
  }

  /**
   * 断开微信连接
   */
  async disconnect(): Promise<void> {
    this.stopMonitor()
    this.connected = false
    this.api = null
    this.sender = null
    this.account = null
    logger.info('WeChat disconnected')
  }

  /**
   * 启动消息监听
   */
  private startMonitor(): void {
    if (!this.api || !this.account) return

    const callbacks: MonitorCallbacks = {
      onMessage: async (msg: WeixinMessage) => {
        await this.handleWeChatMessage(msg)
      },
      onSessionExpired: () => {
        logger.warn('WeChat session expired, need re-login')
        this.connected = false
        this.mainWindow?.webContents.send('wechat:sessionExpired', {})
      },
    }

    this.monitor = createMonitor(this.api, callbacks)
    // 异步启动轮询，不阻塞
    this.monitor.run().catch((err) => {
      logger.error('Monitor run failed', { error: err instanceof Error ? err.message : String(err) })
    })

    logger.info('WeChat monitor started')
  }

  /**
   * 停止消息监听
   */
  private stopMonitor(): void {
    if (this.monitor) {
      this.monitor.stop()
      this.monitor = null
    }
  }

  /**
   * 检查消息是否为欢迎触发词
   * 匹配规则：消息中同时包含"你好"和"微连"（或繁体"微連"）
   * 英文：同时包含 "hello" 和 "wechat link agent"
   */
  private isWelcomeTrigger(text: string): boolean {
    const lower = text.toLowerCase()
    // 简体/繁体：包含"你好" + "微连"或"微連"
    if (text.includes('你好') && (text.includes('微连') || text.includes('微連'))) {
      return true
    }
    // 英文：包含 "hello" + "wechat link agent"
    if (lower.includes('hello') && lower.includes('wechat link agent')) {
      return true
    }
    return false
  }

  /**
   * 格式化 Agent 回复给微信的消息
   * 添加 Agent 名称头部和任务完成尾部
   */
  private formatAgentReply(agentName: string, content: string): string {
    return `🤖${agentName}🤖\n${content}\n------Done------`
  }

  /**
   * 处理来自微信的消息
   * 1. 提取文本/图片/文件
   * 2. 尝试命令路由
   * 3. 非命令则发送给当前 Agent
   * 4. Agent 回复推回微信 + IPC 推送桌面
   */
  private async handleWeChatMessage(msg: WeixinMessage): Promise<void> {
    const fromUserId = msg.from_user_id
    const contextToken = msg.context_token || ''

    if (!fromUserId) {
      logger.warn('Message missing from_user_id', { msg })
      return
    }

    // 只处理用户消息（忽略自己发的 BOT 消息）
    if (msg.message_type !== MessageType.USER) {
      return
    }

    // 提取消息内容
    const items = msg.item_list || []
    const text = items.map(extractText).join('').trim()

    if (!text) {
      logger.debug('Empty message from WeChat, skipping')
      return
    }

    logger.info('WeChat message received', { fromUserId, textLength: text.length, textPreview: text.slice(0, 50) })

    // 记录最近的微信用户信息，供桌面端 ClawBot 回复使用
    this.lastFromUserId = fromUserId
    this.lastContextToken = contextToken

    // 先刷新暂存队列（新的 context_token 意味着发送限额已刷新）
    await this.flushPendingQueue(fromUserId, contextToken)

    // 推送到桌面 IPC（附带当前 Agent 名称，供桌面端显示真实名称）
    const currentAgentForPush = agentManager.getCurrent()
    this.pushToDesktop('message:newMessage', {
      role: 'user',
      content: text,
      source: 'wechat',
      timestamp: Date.now(),
      agentName: currentAgentForPush?.name || '',
    })

    // 待发送欢迎消息（首次绑定后暂存，现在有了 context_token 才发送）
    if (this.pendingWelcome) {
      const welcomeText = this.pendingWelcome
      this.pendingWelcome = null
      try {
        await this.sendToWeChat(fromUserId, contextToken, welcomeText)
        logger.info('Pending welcome message sent', { fromUserId })
      } catch (err) {
        logger.error('Failed to send pending welcome message', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    // 欢迎触发词检测：消息同时包含"你好"和"微连"时，直接回复欢迎消息，不调用 Agent
    if (this.isWelcomeTrigger(text)) {
      const version = electronApp.getVersion()
      const welcomeText = t('bot.welcome.text', '🎉 欢迎使用微连 (WeChat Link Agent) v{{version}}！', { version })
      // 推送到桌面显示
      this.pushToDesktop('message:newMessage', {
        role: 'assistant',
        content: welcomeText,
        source: 'bot',
        timestamp: Date.now(),
        agentName: '微连',
      })
      // 回复微信
      await this.sendToWeChat(fromUserId, contextToken, welcomeText)
      logger.info('Welcome trigger detected, welcome message sent', { fromUserId })
      return
    }

    // 构建命令上下文
    const currentAgent = agentManager.getCurrent()
    const agentList = agentManager.list()
    const agentNames = agentList.map((a) => a.name)
    const agentCommands = agentList.map((a) => a.command.toLowerCase())

    const cmdCtx: CommandContext = {
      text,
      currentAgentName: currentAgent?.name || '',
      agentNames,
      agentCommands,
      switchAgent: async (name: string) => agentManager.switchTo(name),
      reply: async (replyText: string) => {
        await this.sendToWeChat(fromUserId, contextToken, replyText)
      },
      sendToAgent: async (prompt: string) => {
        await this.processAgentQuery(prompt, fromUserId, contextToken, items)
      },
      clearSession: async () => {
        if (currentAgent) {
          const sessions = await sessionManager.getSessions(currentAgent.id!)
          if (sessions.length > 0) {
            await sessionManager.clearMessages(sessions[0].id)
          }
        }
      },
      getHistory: async (limit?: number) => {
        if (!currentAgent?.id) return []
        const sessions = await sessionManager.getSessions(currentAgent.id)
        if (sessions.length === 0) return []
        return sessionManager.getMessages(sessions[0].id, limit)
      },
      loadAgents: async () => {
        await agentManager.init()
      },
      getVersion: () => electronApp.getVersion(),
      switchModel: async (modelName: string) => {
        if (!currentAgent?.id) return false
        await agentManager.update(currentAgent.id, { model: modelName })
        return true
      },
      switchCwd: async (dir: string) => {
        try {
          const { existsSync } = await import('node:fs')
          const resolved = dir.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
          if (!existsSync(resolved)) return false
          if (!currentAgent?.id) return false
          await agentManager.update(currentAgent.id, { cwd: resolved })
          return true
        } catch {
          return false
        }
      },
      getCurrentModel: () => currentAgent?.model || '未设置',
      getCurrentCwd: () => agentManager.getEffectiveCwd(currentAgent?.cwd),
      // 终止当前 Agent 正在执行的任务
      abortAgent: () => {
        const hasProcessing = agentManager.list().some((a) => a.status === 'processing')
        agentManager.abort()
        return hasProcessing
      },
      // 向所有 Agent 并行发送 prompt，返回汇总结果
      sendToAllAgents: async (prompt: string) => {
        return await this.processAllAgentsQuery(prompt, fromUserId, contextToken, items)
      },
      // 多 Agent 调度：按 command 指定不同 Agent 和不同 prompt
      sendToMultiAgents: async (
        tasks: Array<{ command: string; prompt: string; order?: number }>,
        mode: 'merge' | 'split' = 'merge',
      ) => {
        return await this.processMultiAgentQuery(tasks, fromUserId, contextToken, items, mode)
      },
    }

    // 尝试命令路由
    const result = await routeCommand(cmdCtx)

    if (result.handled) {
      // 命令已处理，发送回复（如果有）
      if (result.reply) {
        await this.sendToWeChat(fromUserId, contextToken, result.reply)
      }
      return
    }

    // 非命令消息，发送给当前 Agent
    if (!currentAgent) {
      await this.sendToWeChat(fromUserId, contextToken, '⚠️ 当前没有可用的 Agent，请在桌面端添加 Agent。')
      return
    }
    await this.processAgentQuery(text, fromUserId, contextToken, items)
  }

  /**
   * 处理 Agent 查询
   * 发送给当前 Agent，流式输出推回微信 + 桌面
   */
  private async processAgentQuery(
    prompt: string,
    fromUserId: string,
    contextToken: string,
    items: WeixinMessage['item_list'],
  ): Promise<void> {
    const current = agentManager.getCurrent()
    if (!current || !current.id) {
      await this.sendToWeChat(fromUserId, contextToken, '⚠️ 未选择 Agent')
      return
    }

    // 提取图片（如果有）
    const imageItem = extractFirstImageUrl(items)
    let imageDataUri: string | null = null
    if (imageItem) {
      imageDataUri = await downloadImage(imageItem)
    }

    // 提取文件（如果有）
    const fileItem = extractFirstFileItem(items)
    let filePath: string | null = null
    if (fileItem) {
      filePath = await downloadFile(fileItem)
      if (filePath) {
        // 将文件路径附加到 prompt
        prompt += `\n\n[用户发送了文件: ${filePath}]`
      }
    }

    // 获取/创建会话
    const session = await sessionManager.getOrCreateSession(current.id, current.name)

    // 保存用户消息
    await sessionManager.addMessage(session.id, current.name, 'user', prompt, 'wechat')

    // 启动打字指示器
    const stopTyping = this.sender?.startTyping(fromUserId, contextToken) || (() => {})

    try {
      let fullReply = ''
      let lastSentTime = Date.now()
      const INTERIM_PUSH_INTERVAL = 3000 // 每 3 秒推送一次中间结果

      // 调用 Agent，流式处理输出
      for await (const output of agentManager.send({
        prompt,
        cwd: agentManager.getEffectiveCwd(current.cwd),
        sessionId: session.sdkSessionId,
        model: current.model,
        images: imageDataUri ? [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageDataUri.split(';')[0].split(':')[1],
            data: imageDataUri.split(',')[1],
          },
        }] : undefined,
      })) {
        if (output.type === 'text') {
          fullReply += output.delta

          // IPC 推送桌面（实时）
          this.pushToDesktop('message:agentOutput', {
            content: output.delta,
            type: 'delta',
            sessionId: session.id,
            agentName: current.name,
          })

          // 微信中间推送（限频）
          const now = Date.now()
          if (now - lastSentTime > INTERIM_PUSH_INTERVAL) {
            // 中间推送时暂不发，等结束统一发
            lastSentTime = now
          }
        } else if (output.type === 'done') {
          fullReply = output.fullText || fullReply
          if (output.sessionId) {
            await sessionManager.updateSdkSessionId(session.id, output.sessionId)
          }
        } else if (output.type === 'error') {
          logger.error('Agent query error', { error: output.message })
          await this.sendToWeChat(fromUserId, contextToken, `❌ Agent 处理出错: ${output.message}`)
        }
      }

      // 过滤工具噪音
      const filteredReply = filterToolNoise(fullReply.trim())

      // 通知桌面端流式输出结束
      this.pushToDesktop('message:agentOutput', {
        content: filteredReply,
        type: 'done',
        sessionId: session.id,
        agentName: current.name,
      })

      // 保存 Agent 回复
      if (filteredReply) {
        await sessionManager.addMessage(session.id, current.name, 'assistant', filteredReply, 'wechat')
      }

      // 推回微信（分块发送），添加 Agent 名称头部和任务完成尾部
      if (filteredReply) {
        await this.sendToWeChat(fromUserId, contextToken, this.formatAgentReply(current.name, filteredReply))
      } else {
        await this.sendToWeChat(fromUserId, contextToken, this.formatAgentReply(current.name, '（Agent 无返回内容）'))
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error('Agent query failed', { error: errMsg })
      // 通知桌面端流式输出结束（错误情况）
      this.pushToDesktop('message:agentOutput', {
        content: `❌ 处理请求时出错: ${errMsg}`,
        type: 'done',
        sessionId: session.id,
        agentName: current.name,
      })
      await this.sendToWeChat(fromUserId, contextToken, `❌ 处理请求时出错: ${errMsg}`)
    } finally {
      stopTyping()
    }
  }

  /**
   * 并行查询所有已安装 Agent，汇总结果
   * 用于 /all 命令：同时向所有 online 状态的 Agent 发送 prompt，各自独立查询
   * 返回格式化的汇总文本（各 Agent 结果用 🤖名称🤖 分隔，末尾加任务完成提示）
   */
  private async processAllAgentsQuery(
    prompt: string,
    fromUserId: string,
    contextToken: string,
    items: WeixinMessage['item_list'],
  ): Promise<string> {
    const agents = agentManager.list().filter((a) => a.status === 'online')
    if (agents.length === 0) {
      return '⚠️ 没有可用的 Agent'
    }

    logger.info('Parallel query started', { agentCount: agents.length, promptPreview: prompt.slice(0, 50) })

    // 提取图片（如果有）
    const imageItem = extractFirstImageUrl(items)
    let imageDataUri: string | null = null
    if (imageItem) {
      imageDataUri = await downloadImage(imageItem)
    }

    // 提取文件（如果有）
    const fileItem = extractFirstFileItem(items)
    if (fileItem) {
      const filePath = await downloadFile(fileItem)
      if (filePath) {
        prompt += `\n\n[用户发送了文件: ${filePath}]`
      }
    }

    // 启动打字指示器
    const stopTyping = this.sender?.startTyping(fromUserId, contextToken) || (() => {})

    try {
      // 并行查询所有 Agent
      const results = await Promise.allSettled(
        agents.map(async (agent) => {
          // 为每个 Agent 创建/获取会话并保存用户消息
          const session = await sessionManager.getOrCreateSession(agent.id!, agent.name)
          await sessionManager.addMessage(session.id, agent.name, 'user', prompt, 'wechat')

          // 调用 AgentManager.queryAgent（独立 Provider，不影响 currentAgent）
          const result = await agentManager.queryAgent(agent.id!, {
            prompt,
            cwd: agentManager.getEffectiveCwd(agent.cwd),
            sessionId: session.sdkSessionId,
            model: agent.model,
            images: imageDataUri ? [{
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageDataUri.split(';')[0].split(':')[1],
                data: imageDataUri.split(',')[1],
              },
            }] : undefined,
          })

          if (result.success && result.content) {
            const filtered = filterToolNoise(result.content.trim())
            // 保存 Agent 回复
            if (filtered) {
              await sessionManager.addMessage(session.id, agent.name, 'assistant', filtered, 'wechat')
            }
            return { agentName: agent.name, content: filtered || '（无返回内容）' }
          } else {
            return { agentName: agent.name, content: `❌ ${result.error || '查询失败'}` }
          }
        }),
      )

      // 格式化汇总结果
      const sections: string[] = []
      for (let i = 0; i < agents.length; i++) {
        const agent = agents[i]
        const result = results[i]
        let content: string
        if (result.status === 'fulfilled') {
          content = result.value.content
        } else {
          const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason)
          content = `❌ 查询失败: ${errMsg}`
        }
        sections.push(`🤖${agent.name}🤖\n${content}`)
      }

      const combined = sections.join('\n\n')

      // 推送到桌面
      this.pushToDesktop('message:newMessage', {
        role: 'assistant',
        content: combined,
        source: 'wechat',
        timestamp: Date.now(),
        agentName: '多 Agent',
      })

      // 末尾加任务完成提示
      return combined + '\n------Done------'
    } finally {
      stopTyping()
    }
  }

  /**
   * 多 Agent 调度：按 command 指定不同 Agent 和不同 prompt，支持并行/串行 + 分批/汇总
   *
   * 执行方式（由 tasks 中是否有 order 决定）:
   *   - 无 order → 并行执行（Promise.allSettled）
   *   - 有 order → 按序号升序串行执行
   *
   * 返回方式（由 mode 参数决定）:
   *   - merge → 全部完成后汇总为一条消息返回（默认）
   *   - split → 每个结果准备好立即推送到微信（分批返回）
   */
  private async processMultiAgentQuery(
    tasks: Array<{ command: string; prompt: string; order?: number }>,
    fromUserId: string,
    contextToken: string,
    items: WeixinMessage['item_list'],
    mode: 'merge' | 'split' = 'merge',
  ): Promise<string> {
    logger.info('Multi-agent query started', { taskCount: tasks.length, mode, hasOrder: tasks.some(t => t.order !== undefined) })

    // ── 共享预处理：提取图片/文件 ──
    const imageItem = extractFirstImageUrl(items)
    let imageDataUri: string | null = null
    if (imageItem) {
      imageDataUri = await downloadImage(imageItem)
    }

    const fileItem = extractFirstFileItem(items)
    let fileSuffix = ''
    if (fileItem) {
      const filePath = await downloadFile(fileItem)
      if (filePath) {
        fileSuffix = `\n\n[用户发送了文件: ${filePath}]`
      }
    }

    // 启动打字指示器
    const stopTyping = this.sender?.startTyping(fromUserId, contextToken) || (() => {})

    try {
      // ── 执行单个任务的辅助函数 ──
      const executeTask = async (task: { command: string; prompt: string }): Promise<{ agentName: string; content: string; success: boolean }> => {
        const agent = task.command
          ? agentManager.getByCommand(task.command)
          : agentManager.getCurrent()

        if (!agent || !agent.id) {
          return { agentName: task.command || '当前 Agent', content: `❌ 未找到该 Agent`, success: false }
        }

        const prompt = task.prompt + fileSuffix
        const session = await sessionManager.getOrCreateSession(agent.id, agent.name)
        await sessionManager.addMessage(session.id, agent.name, 'user', prompt, 'wechat')

        const result = await agentManager.queryAgent(agent.id!, {
          prompt,
          cwd: agentManager.getEffectiveCwd(agent.cwd),
          sessionId: session.sdkSessionId,
          model: agent.model,
          images: imageDataUri ? [{
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageDataUri.split(';')[0].split(':')[1],
              data: imageDataUri.split(',')[1],
            },
          }] : undefined,
        })

        if (result.success && result.content) {
          const filtered = filterToolNoise(result.content.trim())
          if (filtered) {
            await sessionManager.addMessage(session.id, agent.name, 'assistant', filtered, 'wechat')
          }
          return { agentName: agent.name, content: filtered || '（无返回内容）', success: true }
        } else {
          return { agentName: agent.name, content: `❌ ${result.error || '查询失败'}`, success: false }
        }
      }

      // ── 将单条结果推送桌面 + 可选推送到微信 ──
      const handleSingleResult = async (result: { agentName: string; content: string; success: boolean }, index: number) => {
        const formatted = `🤖${result.agentName}🤖\n${result.content}`
        // 推送桌面
        this.pushToDesktop('message:newMessage', {
          role: 'assistant',
          content: formatted,
          source: 'wechat',
          timestamp: Date.now(),
          agentName: result.agentName,
        })
        // split 模式：立即推送到微信
        if (mode === 'split') {
          await this.sendToWeChat(fromUserId, contextToken, formatted)
        }
      }

      // ── 判断执行策略：串行 vs 并行 ──
      const hasOrder = tasks.some(t => t.order !== undefined)

      if (hasOrder) {
        // ── 串行执行：按 order 升序排列，逐个 await ──
        const sorted = [...tasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        logger.info('Serial execution', { sorted: sorted.map(t => `${t.command}:${t.order}`) })

        const results: Array<{ agentName: string; content: string; success: boolean }> = []
        for (let i = 0; i < sorted.length; i++) {
          const task = sorted[i]
          const result = await executeTask(task)
          results.push(result)
          if (mode === 'split') {
            await handleSingleResult(result, i)
          }
        }

        if (mode === 'merge') {
          // 汇总后一次性推送桌面 + 返回
          const sections = results.map(r => `🤖${r.agentName}🤖\n${r.content}`)
          const combined = sections.join('\n\n') + '\n------Done------'
          this.pushToDesktop('message:newMessage', {
            role: 'assistant',
            content: combined,
            source: 'wechat',
            timestamp: Date.now(),
            agentName: '多 Agent',
          })
          return combined
        } else {
          // 已分批发送
          return ''
        }
      } else {
        // ── 并行执行 ──
        if (mode === 'split') {
          // 分批模式：每个 resolve 立即发送
          const promises = tasks.map((task, i) =>
            executeTask(task).then(async (result) => {
              await handleSingleResult(result, i)
            })
          )
          await Promise.allSettled(promises)
          return ''
        } else {
          // 汇总模式（当前默认行为）：全部完成后一次性合并并推送
          const settled = await Promise.allSettled(
            tasks.map(async (task) => executeTask(task))
          )

          // 按原始任务顺序格式化
          const sections: string[] = []
          for (let i = 0; i < tasks.length; i++) {
            const result = settled[i]
            let agentName: string
            let content: string
            if (result.status === 'fulfilled' && result.value.success) {
              agentName = result.value.agentName
              content = result.value.content
            } else {
              agentName = tasks[i].command || '未知 Agent'
              content = result.status === 'fulfilled'
                ? result.value.content
                : `❌ 查询失败: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
            }
            sections.push(`🤖${agentName}🤖\n${content}`)
          }

          const combined = sections.join('\n\n') + '\n------Done------'
          // 一次性推送桌面
          this.pushToDesktop('message:newMessage', {
            role: 'assistant',
            content: combined,
            source: 'wechat',
            timestamp: Date.now(),
            agentName: '多 Agent',
          })
          return combined
        }
      }
    } finally {
      stopTyping()
    }
  }

  /**
   * 发送文本到微信（分块 + 限频重试 + 暂存队列）
   */
  async sendToWeChat(toUserId: string, contextToken: string, text: string): Promise<void> {
    if (!this.sender || !this.account) {
      logger.warn('Cannot send to WeChat: not connected')
      // 通知桌面端发送失败
      this.pushToDesktop('message:sendError', {
        error: '微信未连接，消息未能推送',
        text,
      })
      return
    }

    logger.info('sendToWeChat start', { toUserId, textLength: text.length, contextTokenLength: contextToken.length })

    const chunks = splitMessage(text)

    for (let i = 0; i < chunks.length; i++) {
      try {
        logger.info('Sending chunk to WeChat', { chunk: i + 1, total: chunks.length, length: chunks[i].length })
        await this.sender.sendText(toUserId, contextToken, chunks[i])
        logger.info('Chunk sent to WeChat successfully', { chunk: i + 1, total: chunks.length })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)

        // 限频或会话过期：将剩余内容暂存到队列
        if (errMsg.includes('rate-limited') || errMsg.includes('circuit breaker') || errMsg.includes('stale session')) {
          logger.warn('WeChat send rate-limited, queuing remaining chunks', {
            chunk: i,
            total: chunks.length,
            remaining: chunks.length - i,
          })

          const queue = loadPendingQueue(this.account.accountId)
          queue.push({
            text: chunks.slice(i).join('\n\n'),
            role: 'final',
            queuedAt: Date.now(),
          })
          savePendingQueue(this.account.accountId, queue)
          // 通知桌面端
          this.pushToDesktop('message:sendError', {
            error: `微信限频，消息已暂存（剩余 ${chunks.length - i} 块），对方再发消息时自动补发`,
          })
          return
        }

        // 其他错误：记录详细日志并通知桌面端
        logger.error('WeChat send failed', { error: errMsg, chunk: i, toUserId, contextToken: contextToken ? '(has token)' : '(empty token)' })
        // 通知桌面端发送失败
        this.pushToDesktop('message:sendError', {
          error: `微信消息推送失败: ${errMsg}`,
        })

        // 其他错误也暂存
        const queue = loadPendingQueue(this.account.accountId)
        queue.push({
          text: chunks.slice(i).join('\n\n'),
          role: 'final',
          queuedAt: Date.now(),
        })
        savePendingQueue(this.account.accountId, queue)
        return
      }
    }
  }

  /**
   * 刷新暂存队列
   * 新的 context_token 意味着发送限额已刷新，尝试补发暂存的消息
   */
  private async flushPendingQueue(userId: string, contextToken: string): Promise<void> {
    if (!this.account) return

    const queue = loadPendingQueue(this.account.accountId)
    if (queue.length === 0) return

    logger.info('Flushing pending queue', { count: queue.length, accountId: this.account.accountId })

    const stillPending: PendingItem[] = []

    for (const item of queue) {
      try {
        const chunks = splitMessage(item.text)
        for (const chunk of chunks) {
          await this.sender!.sendText(userId, contextToken, chunk)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logger.warn('Flush stopped at rate-limit, keeping remaining items queued', {
          flushed: queue.length - stillPending.length - 1,
          remaining: stillPending.length + 1,
          error: errMsg,
        })
        stillPending.push(item)
      }
    }

    savePendingQueue(this.account.accountId, stillPending)

    if (stillPending.length > 0 && stillPending.length === queue.length) {
      // 一条都没发出去，提醒用户
      await this.sender!.sendText(userId, contextToken, `⏳ 还有 ${stillPending.length} 条暂存消息未能推送，再发任意消息我会继续补发。`).catch(() => {})
    }
  }

  /**
   * 推送事件到桌面窗口
   */
  private pushToDesktop(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * 从桌面端 ClawBot 发送消息
   * 始终通过当前 Agent 处理查询，流式推送到桌面；
   * 如果微信有活跃对话，则额外将回复推送到微信。
   */
  async sendFromDesktop(prompt: string): Promise<{ success: boolean; content?: string; error?: string }> {
    const current = agentManager.getCurrent()
    if (!current || !current.id) {
      return { success: false, error: '未选择 Agent' }
    }

    // 微信活跃对话信息（可能为空，为空时只处理 Agent 不推送微信）
    const hasWeChatContext = !!(this.lastFromUserId && this.lastContextToken)
    const fromUserId = this.lastFromUserId
    const contextToken = this.lastContextToken

    // 获取/创建会话
    const session = await sessionManager.getOrCreateSession(current.id, current.name)

    // 保存用户消息（来源标记为 desktop）
    await sessionManager.addMessage(session.id, current.name, 'user', prompt, 'desktop')

    try {
      let fullReply = ''

      // 调用 Agent，流式处理输出，实时推送到桌面
      for await (const output of agentManager.send({
        prompt,
        cwd: agentManager.getEffectiveCwd(current.cwd),
        sessionId: session.sdkSessionId,
        model: current.model,
      })) {
        if (output.type === 'text') {
          fullReply += output.delta
          // IPC 推送桌面（实时流式）
          this.pushToDesktop('message:agentOutput', {
            content: output.delta,
            type: 'delta',
            sessionId: session.id,
            agentName: current.name,
          })
        } else if (output.type === 'done') {
          fullReply = output.fullText || fullReply
          if (output.sessionId) {
            await sessionManager.updateSdkSessionId(session.id, output.sessionId)
          }
        } else if (output.type === 'error') {
          logger.error('ClawBot agent query error', { error: output.message })
          // 通知桌面端流式结束（错误）
          this.pushToDesktop('message:agentOutput', {
            content: `❌ ${output.message}`,
            type: 'done',
            sessionId: session.id,
            agentName: current.name,
          })
          return { success: false, error: output.message }
        }
      }

      // 过滤工具噪音
      const filteredReply = filterToolNoise(fullReply.trim())

      // 通知桌面端流式输出结束
      this.pushToDesktop('message:agentOutput', {
        content: filteredReply,
        type: 'done',
        sessionId: session.id,
        agentName: current.name,
      })

      // 保存 Agent 回复
      if (filteredReply) {
        await sessionManager.addMessage(session.id, current.name, 'assistant', filteredReply, 'desktop')
      }

      // 如果微信有活跃对话，额外推送到微信（添加 Agent 名称头部和任务完成尾部）
      if (filteredReply && hasWeChatContext && fromUserId && contextToken) {
        await this.sendToWeChat(fromUserId, contextToken, this.formatAgentReply(current.name, filteredReply))
      }

      return { success: true, content: filteredReply || '（Agent 无返回内容）' }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error('ClawBot sendFromDesktop failed', { error: errMsg })
      // 通知桌面端流式输出结束（错误）
      this.pushToDesktop('message:agentOutput', {
        content: `❌ 处理请求时出错: ${errMsg}`,
        type: 'done',
        sessionId: session.id,
        agentName: current.name,
      })
      return { success: false, error: errMsg }
    }
  }
}

/** 单例 */
export const syncManager = new SyncManager()
