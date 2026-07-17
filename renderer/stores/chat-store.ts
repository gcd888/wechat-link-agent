/**
 * 聊天状态管理（Zustand Store）
 *
 * 管理消息列表、发送状态、流式输出、多会话切换等聊天相关的状态。
 * 支持每个 Agent 多个会话，用户可在会话间切换。
 */

import { create } from 'zustand'
import { useAgentStore } from './agent-store.js'

/**
 * 模块级变量：上次成功加载历史的 Agent 名
 * 不放入 store state（避免触发不必要的重渲染），仅用于 App.tsx useEffect 判断是否需要调用 loadHistory
 * - 切换 Tab（Agent 不变）→ useEffect 检测到相同 → 跳过 loadHistory → 保留内存消息
 * - 切换 Agent → useEffect 检测到不同 → 调用 loadHistory → 从数据库加载
 * - handleSendMessage 显式调用 loadHistory → 更新此变量 → useEffect 跳过重复加载
 */
let _lastLoadedAgent: string | null = null

/** 获取上次加载的 Agent 名（供 App.tsx useEffect 使用） */
export function getLastLoadedAgent(): string | null { return _lastLoadedAgent }
/** 重置上次加载的 Agent 名（如清空对话后需要重新加载） */
export function resetLastLoadedAgent(): void { _lastLoadedAgent = null }

interface Message {
  id?: number
  sessionId: number
  agentName: string
  role: 'user' | 'assistant' | 'system'
  content: string
  source: 'desktop' | 'wechat'
  timestamp: number
  /** 是否为流式输出（正在追加中） */
  isStreaming?: boolean
}

interface ChatState {
  /** 消息列表 */
  messages: Message[]
  /** 当前会话 ID */
  currentSessionId: number | null
  /** 当前 Agent 的会话列表（带预览信息） */
  sessions: SessionPreview[]
  /** 是否正在处理中 */
  isProcessing: boolean
  /** 当前正在处理消息的 Agent 名称（用于 per-agent 独立处理状态，切换 Agent 时不会被阻塞） */
  processingAgentName: string | null
  /** 发送错误 */
  sendError: string | null
  /** 正在发送消息时为 true，阻止同 Agent 的 loadHistory 覆盖当前消息列表 */
  isSending: boolean
  /** 最近一次 loadHistory 的目标 Agent 名，用于丢弃过期的异步结果 */
  loadingAgentName: string | null

  // Actions
  send: (text: string, files?: Array<{ path: string; name: string }>) => Promise<void>
  sendClawBot: (text: string) => Promise<void>
  loadHistory: (agentName: string) => Promise<void>
  loadClawBotHistory: () => Promise<void>
  clear: (agentName: string) => Promise<void>
  startStreaming: (agentName: string) => void
  appendStream: (delta: string) => void
  endStreaming: () => void
  addMessage: (msg: Message) => void
  /** 初始化 ClawBot 实时消息监听 */
  initClawBotListeners: () => void
  /** 清理 ClawBot 实时消息监听 */
  cleanupClawBotListeners: () => void

  // ── 多会话管理 Actions ──
  /** 加载指定 Agent 的会话列表 */
  loadSessions: (agentId: number) => Promise<void>
  /** 加载指定会话的消息并切换到该会话 */
  loadSession: (sessionId: number) => Promise<void>
  /** 创建新会话并切换 */
  createNewSession: () => Promise<void>
  /** 删除会话并刷新列表 */
  deleteSession: (sessionId: number) => Promise<void>
  /** 重命名会话 */
  renameSession: (sessionId: number, title: string) => Promise<void>
  /** 切换会话（更新后端 + 加载消息） */
  switchSession: (sessionId: number) => Promise<void>
  /** 重置会话状态（切换 Agent 时调用） */
  resetSessions: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  currentSessionId: null,
  sessions: [],
  isProcessing: false,
  processingAgentName: null,
  sendError: null,
  /** 正在发送消息时为 true，阻止同 Agent 的 loadHistory 覆盖当前消息列表 */
  isSending: false,
  loadingAgentName: null,

  send: async (text, files) => {
    // 获取当前 Agent 名称，用于阻止同 Agent 的 loadHistory 覆盖
    const currentAgentName = useAgentStore.getState().currentAgent?.name || ''
    set({ isProcessing: true, processingAgentName: currentAgentName, sendError: null, isSending: true, loadingAgentName: currentAgentName })

    // 添加用户消息到列表
    const userMsg: Message = {
      sessionId: get().currentSessionId || 0,
      agentName: '',
      role: 'user',
      content: text,
      source: 'desktop',
      timestamp: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, userMsg] }))

    try {
      const result = await window.electronAPI.message.send(text, get().currentSessionId || undefined, files)

      // 发送成功后，如果返回了 sessionId，更新当前会话 ID
      if (result.success && (result as any).sessionId) {
        const sessionId = (result as any).sessionId as number
        if (get().currentSessionId !== sessionId) {
          set({ currentSessionId: sessionId })
        }
      }

      // 添加 Agent 回复
      if (result.success && result.content) {
        const agentMsg: Message = {
          sessionId: get().currentSessionId || 0,
          agentName: currentAgentName,
          role: 'assistant',
          content: result.content,
          source: 'desktop',
          timestamp: Date.now(),
        }
        set((state) => ({ messages: [...state.messages, agentMsg] }))
      } else if (result.error) {
        // 检测是否为未登录/认证相关的错误，如果是则返回友好的登录引导
        const errLower = result.error.toLowerCase()
        const isAuthError = errLower.includes('not logged in') ||
          errLower.includes('unauthorized') ||
          errLower.includes('please login') ||
          errLower.includes('authentication') ||
          errLower.includes('not authenticated') ||
          errLower.includes('api key') ||
          errLower.includes('no credentials') ||
          errLower.includes('login required') ||
          errLower.includes('invalid api key') ||
          errLower.includes('401')
        if (isAuthError) {
          // 获取当前 Agent 的命令名
          const agentCommand = useAgentStore.getState().currentAgent?.command || ''
          const agentName = useAgentStore.getState().currentAgent?.name || agentCommand
          const friendlyError = `${agentName} 尚未登录或未配置 API，无法对话。\n\n请按以下步骤操作：\n1. 打开终端（命令行）\n2. 执行：${agentCommand} login\n3. 按提示完成登录认证\n4. 登录后返回此处重新发送消息`
          set({ sendError: friendlyError })
        } else {
          set({ sendError: result.error })
        }
      } else if (result.success && !result.content) {
        // CLI 返回成功但内容为空（如首次初始化超时）
        set({ sendError: 'Agent 未返回任何内容，请重试' })
      }

      // 发送完成后异步刷新会话列表预览（更新最后消息摘要、消息数、时间）
      const currentAgent = useAgentStore.getState().currentAgent
      if (currentAgent?.id) {
        get().loadSessions(currentAgent.id)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ sendError: msg })
    } finally {
      set({ isProcessing: false, processingAgentName: null, isSending: false })
    }
  },

  loadHistory: async (agentName) => {
    // 如果正在给同一个 Agent 发送消息，跳过历史加载（避免覆盖正在追加的消息）
    if (get().isSending && get().loadingAgentName === agentName) return
    // 标记当前正在加载的 Agent，用于丢弃过期的异步结果
    set({ loadingAgentName: agentName })
    try {
      // 优先使用当前会话 ID 加载
      const sessionId = get().currentSessionId
      const history = await window.electronAPI.message.getHistory(agentName, 50, sessionId || undefined)
      // 异步等待期间如果用户已开始发送消息，不要覆盖
      if (get().isSending) return
      // 如果在异步等待期间又切换了 Agent，丢弃本次结果
      if (get().loadingAgentName !== agentName) return
      set({ messages: history, sendError: null })
      _lastLoadedAgent = agentName
    } catch {
      if (get().loadingAgentName !== agentName) return
      set({ messages: [] })
      _lastLoadedAgent = agentName
    }
  },

  clear: async (agentName) => {
    try {
      const sessionId = get().currentSessionId
      await window.electronAPI.message.clear(agentName, sessionId || undefined)
      set({ messages: [] })
      _lastLoadedAgent = null  // 清空后允许重新加载
      // 刷新会话列表预览
      const currentAgent = useAgentStore.getState().currentAgent
      if (currentAgent?.id) {
        get().loadSessions(currentAgent.id)
      }
    } catch {
      // ignore
    }
  },

  startStreaming: (agentName) => {
    set((state) => {
      const streamMsg: Message = {
        sessionId: state.currentSessionId || 0,
        agentName,
        role: 'assistant',
        content: '',
        source: 'desktop',
        timestamp: Date.now(),
        isStreaming: true,
      }
      return { messages: [...state.messages, streamMsg] }
    })
  },

  appendStream: (delta) => {
    set((state) => {
      const msgs = [...state.messages]
      const lastIdx = msgs.length - 1
      if (lastIdx >= 0 && msgs[lastIdx].isStreaming) {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          content: msgs[lastIdx].content + delta,
        }
      }
      return { messages: msgs }
    })
  },

  endStreaming: () => {
    set((state) => {
      const msgs = [...state.messages]
      const lastIdx = msgs.length - 1
      if (lastIdx >= 0 && msgs[lastIdx].isStreaming) {
        msgs[lastIdx] = { ...msgs[lastIdx], isStreaming: false }
      }
      return { messages: msgs, isProcessing: false, processingAgentName: null }
    })
  },

  addMessage: (msg) => {
    set((state) => ({ messages: [...state.messages, msg] }))
  },

  sendClawBot: async (text) => {
    set({ isProcessing: true, sendError: null })

    // 添加用户消息到列表
    const userMsg: Message = {
      sessionId: 0,
      agentName: '',
      role: 'user',
      content: text,
      source: 'desktop',
      timestamp: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, userMsg] }))

    try {
      // 后端会通过 message:agentOutput IPC 推送流式 delta 和 done 事件，
      // 由 initClawBotListeners 中的监听器实时处理 Agent 回复，
      // 因此这里不需要再手动添加回复消息。
      const result = await window.electronAPI.message.sendClawBot(text)

      // 仅处理错误情况（成功时回复已由流式监听器处理）
      if (!result.success && result.error) {
        set({ sendError: result.error })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ sendError: msg })
    } finally {
      set({ isProcessing: false })
    }
  },

  loadClawBotHistory: async () => {
    _lastLoadedAgent = '__clawbot__'  // 标记 ClawBot 模式，切回 Agent 时会检测到不同并重新加载
    try {
      const history = await window.electronAPI.message.getClawBotHistory()
      set({ messages: history, sendError: null })
    } catch {
      set({ messages: [] })
    }
  },

  initClawBotListeners: () => {
    // 监听微信新消息（用户发送给 Bot 的）
    window.electronAPI.wechat.onNewMessage((data: any) => {
      const msg: Message = {
        sessionId: 0,
        agentName: data.agentName || '',
        role: data.role || 'user',
        content: data.content,
        source: 'wechat',
        timestamp: data.timestamp || Date.now(),
      }
      set((state) => ({ messages: [...state.messages, msg] }))
    })

    // 监听微信消息推送失败事件
    window.electronAPI.wechat.onSendError((data: { error: string }) => {
      set({ sendError: data.error })
      // 3 秒后自动清除错误提示
      setTimeout(() => set({ sendError: null }), 5000)
    })

    // 监听 Agent 流式输出（微信触发的 Agent 回复）
    window.electronAPI.message.onAgentOutput((data: { content: string; type: string; sessionId: number; agentName?: string }) => {
      const state = get()
      const msgs = state.messages
      const lastIdx = msgs.length - 1

      if (data.type === 'done') {
        // 流式输出结束：用过滤后的最终内容替换流式消息
        if (lastIdx >= 0 && msgs[lastIdx].isStreaming) {
          msgs[lastIdx] = {
            ...msgs[lastIdx],
            content: data.content || msgs[lastIdx].content,
            isStreaming: false,
            // 同步更新 agentName（后端 done 事件携带真实名称）
            agentName: data.agentName || msgs[lastIdx].agentName || '',
          }
          set({ messages: [...msgs] })
        }
        return
      }

      if (data.type === 'delta') {
        // 如果最后一条是流式消息，追加；否则创建新的
        if (lastIdx >= 0 && msgs[lastIdx].isStreaming) {
          msgs[lastIdx] = {
            ...msgs[lastIdx],
            content: msgs[lastIdx].content + data.content,
          }
          set({ messages: [...msgs] })
        } else {
          const streamMsg: Message = {
            sessionId: data.sessionId || 0,
            agentName: data.agentName || '',
            role: 'assistant',
            content: data.content,
            source: 'wechat',
            timestamp: Date.now(),
            isStreaming: true,
          }
          set((state) => ({ messages: [...state.messages, streamMsg] }))
        }
      }
    })
  },

  cleanupClawBotListeners: () => {
    window.electronAPI.message.removeAgentOutputListener()
    window.electronAPI.wechat.removeNewMessageListener()
    window.electronAPI.wechat.removeSendErrorListener()
  },

  // ── 多会话管理 Actions ──

  /** 加载指定 Agent 的会话列表（带预览信息） */
  loadSessions: async (agentId) => {
    try {
      const sessions = await window.electronAPI.session.list(agentId)
      set({ sessions })
    } catch {
      set({ sessions: [] })
    }
  },

  /** 加载指定会话的消息并切换到该会话 */
  loadSession: async (sessionId) => {
    try {
      // 通知后端切换会话
      await window.electronAPI.session.switch(sessionId)
      // 加载该会话的消息
      const messages = await window.electronAPI.session.getMessages(sessionId, 50)
      // 确保 messages 始终是数组
      const safeMessages = Array.isArray(messages) ? messages : []
      set({ currentSessionId: sessionId, messages: safeMessages, sendError: null })
      // 更新 _lastLoadedAgent 标记，防止 App.tsx useEffect 重复加载
      const currentAgent = useAgentStore.getState().currentAgent
      if (currentAgent) {
        _lastLoadedAgent = currentAgent.name
      }
    } catch {
      set({ currentSessionId: sessionId, messages: [] })
    }
  },

  /** 创建新会话并切换到该会话 */
  createNewSession: async () => {
    const currentAgent = useAgentStore.getState().currentAgent
    if (!currentAgent?.id) return
    try {
      const session = await window.electronAPI.session.create(currentAgent.id)
      // 切换到新会话（消息为空）
      set({ currentSessionId: session.id, messages: [], sendError: null })
      _lastLoadedAgent = currentAgent.name
      // 刷新会话列表
      get().loadSessions(currentAgent.id)
    } catch {
      // ignore
    }
  },

  /** 删除会话并刷新列表 */
  deleteSession: async (sessionId) => {
    const currentAgent = useAgentStore.getState().currentAgent
    if (!currentAgent?.id) return
    try {
      await window.electronAPI.session.delete(sessionId)
      // 如果删除的是当前会话，切换到最新会话或清空
      if (get().currentSessionId === sessionId) {
        const sessions = await window.electronAPI.session.list(currentAgent.id)
        set({ sessions })
        if (sessions.length > 0) {
          // 切换到最新的会话
          await get().loadSession(sessions[0].id)
        } else {
          // 没有会话了，清空消息
          set({ currentSessionId: null, messages: [] })
          _lastLoadedAgent = null
        }
      } else {
        // 仅刷新列表
        get().loadSessions(currentAgent.id)
      }
    } catch {
      // ignore
    }
  },

  /** 重命名会话 */
  renameSession: async (sessionId, title) => {
    const currentAgent = useAgentStore.getState().currentAgent
    try {
      await window.electronAPI.session.rename(sessionId, title)
      // 更新本地会话列表中的标题
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, title } : s
        ),
      }))
    } catch {
      // ignore
    }
  },

  /** 切换会话（更新后端 + 加载消息） */
  switchSession: async (sessionId) => {
    await get().loadSession(sessionId)
  },

  /** 重置会话状态（切换 Agent 时调用） */
  resetSessions: () => {
    set({ sessions: [], currentSessionId: null })
  },
}))
