/**
 * Agent 状态管理（Zustand Store）
 *
 * 管理 Agent 列表、当前 Agent、Agent 扫描结果等状态。
 * 所有数据通过 IPC 与主进程通信获取。
 */

import { create } from 'zustand'
import { useChatStore } from './chat-store.js'

interface AgentState {
  /** Agent 列表 */
  agents: AgentInfo[]
  /** 当前 Agent */
  currentAgent: AgentInfo | null
  /** 是否加载中 */
  loading: boolean
  /** 错误信息 */
  error: string | null
  /** 扫描结果 */
  scanResult: { found: Array<{ entry: AgentRegistryEntry; path: string; version: string | null }>; notFound: AgentRegistryEntry[] } | null
  /** 注册表 */
  registry: AgentRegistryEntry[]
  /** 是否处于 ClawBot（微信对话）模式 */
  isClawBotMode: boolean

  // Actions
  load: () => Promise<void>
  add: (config: AgentConfig) => Promise<void>
  remove: (id: number) => Promise<void>
  update: (id: number, updates: Partial<AgentConfig>) => Promise<void>
  switchTo: (name: string) => Promise<void>
  switchToClawBot: () => void
  scan: () => Promise<void>
  /** 初始化 Agent 状态变更监听（应用启动时调用一次） */
  initStatusListener: () => void
  /** 清理状态变更监听器 */
  cleanupStatusListener: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  currentAgent: null,
  loading: false,
  error: null,
  scanResult: null,
  registry: [],
  isClawBotMode: false,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const agents = await window.electronAPI.agent.list()
      const currentAgent = await window.electronAPI.agent.getCurrent()
      set({ agents, currentAgent, loading: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg, loading: false })
    }
  },

  add: async (config) => {
    try {
      const agent = await window.electronAPI.agent.add(config)
      set((state) => ({
        // 如果新 Agent 被设为默认，清除其他 Agent 的默认标记（与后端保持一致）
        agents: [
          ...(agent.isDefault ? state.agents.map((a) => ({ ...a, isDefault: false })) : state.agents),
          agent,
        ],
        currentAgent: state.currentAgent || (agent.isDefault ? agent : null),
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
    }
  },

  remove: async (id) => {
    try {
      await window.electronAPI.agent.remove(id)
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
        currentAgent: state.currentAgent?.id === id ? null : state.currentAgent,
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
    }
  },

  update: async (id, updates) => {
    try {
      await window.electronAPI.agent.update(id, updates)
      set((state) => ({
        agents: state.agents.map((a) => {
          if (a.id === id) return { ...a, ...updates }
          // 如果正在设置某个 Agent 为默认，同步清除其他 Agent 的默认标记
          if (updates.isDefault) return { ...a, isDefault: false }
          return a
        }),
        currentAgent:
          state.currentAgent?.id === id
            ? { ...state.currentAgent, ...updates }
            : state.currentAgent,
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
    }
  },

  switchTo: async (name) => {
    try {
      await window.electronAPI.agent.switch(name)
      const agents = await window.electronAPI.agent.list()
      const currentAgent = await window.electronAPI.agent.getCurrent()
      set({ agents, currentAgent, isClawBotMode: false })

      // 切换 Agent 后加载该 Agent 的会话列表，并自动选中最新会话
      const chatStore = useChatStore.getState()
      if (currentAgent?.id) {
        chatStore.resetSessions()
        await chatStore.loadSessions(currentAgent.id)
        // 如果有会话，自动切换到最新的会话（列表已按 updated_at DESC 排序）
        const sessions = useChatStore.getState().sessions
        if (sessions.length > 0) {
          await chatStore.switchSession(sessions[0].id)
        } else {
          // 没有会话时自动创建新会话，确保 currentSessionId 有值
          await chatStore.createNewSession()
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg })
    }
  },

  switchToClawBot: () => {
    set({ isClawBotMode: true })
  },

  scan: async () => {
    try {
      set({ loading: true })
      const result = await window.electronAPI.agent.scan()
      const registry = await window.electronAPI.agent.getRegistry()
      set({
        scanResult: result,
        registry,
        loading: false,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ error: msg, loading: false })
    }
  },

  initStatusListener: () => {
    // 监听主进程推送的 Agent 状态变更事件
    // 当 Agent 开始处理消息时 status → processing，处理完成后 → online
    window.electronAPI.agent.onStatusChange((data) => {
      const { agentId, status } = data
      set((state) => ({
        // 更新 agents 列表中对应 Agent 的状态
        agents: state.agents.map((a) =>
          a.id === agentId ? { ...a, status: status as AgentStatus } : a
        ),
        // 如果当前 Agent 状态变更，同步更新 currentAgent
        currentAgent:
          state.currentAgent?.id === agentId
            ? { ...state.currentAgent, status: status as AgentStatus }
            : state.currentAgent,
      }))
    })
  },

  cleanupStatusListener: () => {
    window.electronAPI.agent.removeStatusChangeListener()
  },
}))
