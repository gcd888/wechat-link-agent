/**
 * UI 状态管理（Zustand Store）
 *
 * 管理主题、导航、语言等 UI 相关的全局状态。
 */

import { create } from 'zustand'

/** 应用主题到 DOM 并同步到主进程（控制系统标题栏颜色） */
async function applyTheme(theme: string): Promise<void> {
  if (theme === 'system') {
    // 先通知主进程重置 nativeTheme 为 system，使其反映真实系统偏好
    // 主进程会返回实际解析后的主题（nativeTheme.shouldUseDarkColors）
    const result = await window.electronAPI?.theme?.set('system')?.catch(() => null)
    const resolved = result?.resolvedTheme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', resolved)
  } else {
    document.documentElement.setAttribute('data-theme', theme)
    // 同步到主进程，使系统标题栏/滚动条跟随应用主题
    window.electronAPI?.theme?.set(theme).catch(() => {})
  }
}

/** 系统主题变化监听器清理 */
let themeChangeCleanup: (() => void) | null = null

type NavItem = 'chat' | 'agent' | 'toolbox' | 'store' | 'settings'

interface UIState {
  /** 当前导航 */
  navActive: NavItem
  /** 第二栏选中的项 */
  selectedItem: string | null
  /** 主题 */
  theme: 'dark' | 'light' | 'system'
  /** 语言 */
  language: string
  /** 微信连接状态 */
  wechatConnected: boolean
  /** 第二栏面板宽度（可拖拽） */
  panelWidth: number
  /** 用户是否主动发起了聊天（从 Agent 管理点击"发消息"时设为 true） */
  chatInitiated: boolean
  /** 工具箱供应商编辑模式：false=查看模式（只读），true=编辑模式（可修改） */
  toolboxEditMode: boolean
  /** 记录哪些 Agent 的历史会话列表是展开的（key 为 agentId） */
  expandedSessionAgents: Set<number>

  // Actions
  setNavActive: (nav: NavItem, selected?: string | null) => void
  setSelectedItem: (item: string | null) => void
  /** 设置工具箱编辑模式（查看/编辑切换） */
  setToolboxEditMode: (mode: boolean) => void
  setTheme: (theme: 'dark' | 'light' | 'system') => void
  setLanguage: (lang: string) => void
  setWechatConnected: (connected: boolean) => void
  setPanelWidth: (width: number) => void
  toggleTheme: () => void
  /** 从 Agent 管理点击"发消息"，切换到聊天页并标记为主动发起 */
  startChat: () => void
  /** 切换某个 Agent 的会话列表展开/折叠状态 */
  toggleSessionExpand: (agentId: number) => void
  /** 设置某个 Agent 的会话列表展开状态 */
  setSessionExpanded: (agentId: number, expanded: boolean) => void
}

export const useUIStore = create<UIState>((set, get) => ({
  navActive: 'chat',
  selectedItem: null,
  theme: 'system',
  language: 'zh-CN',
  wechatConnected: false,
  panelWidth: 280,
  chatInitiated: false,
  toolboxEditMode: false,
  expandedSessionAgents: new Set(),

  setNavActive: (nav, selected?: string | null) => set({
    navActive: nav,
    selectedItem: selected !== undefined ? selected : null,
    // chatInitiated 不再随 Tab 切换重置，保持聊天状态跨 Tab 持久
  }),
  setSelectedItem: (item) => set({ selectedItem: item, toolboxEditMode: false }),
  setToolboxEditMode: (mode) => set({ toolboxEditMode: mode }),
  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    // 持久化到数据库
    window.electronAPI?.config?.update({ theme }).catch(() => {})
    // 跟随系统时监听系统变化
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        if (get().theme === 'system') {
          applyTheme('system')
        }
      }
      mq.addEventListener('change', handler)
      // 清理旧监听
      if (themeChangeCleanup) themeChangeCleanup()
      themeChangeCleanup = () => mq.removeEventListener('change', handler)
    } else {
      if (themeChangeCleanup) { themeChangeCleanup(); themeChangeCleanup = null }
    }
  },
  setLanguage: (language) => set({ language }),
  setWechatConnected: (wechatConnected) => set({ wechatConnected }),
  setPanelWidth: (panelWidth) => set({ panelWidth }),
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
  startChat: () => set({ navActive: 'chat', selectedItem: null, chatInitiated: true }),

  toggleSessionExpand: (agentId: number) => {
    set((state) => {
      const next = new Set(state.expandedSessionAgents)
      if (next.has(agentId)) {
        // 已展开则折叠
        next.delete(agentId)
      } else {
        // 互斥：展开新的 Agent 前，先折叠其他所有已展开的 Agent
        next.clear()
        next.add(agentId)
      }
      return { expandedSessionAgents: next }
    })
  },

  setSessionExpanded: (agentId: number, expanded: boolean) => {
    set((state) => {
      const next = new Set(state.expandedSessionAgents)
      if (expanded) {
        // 互斥：展开指定 Agent 前，先折叠其他所有已展开的 Agent
        next.clear()
        next.add(agentId)
      } else {
        next.delete(agentId)
      }
      return { expandedSessionAgents: next }
    })
  },
}))
