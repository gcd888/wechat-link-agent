/**
 * 根组件
 *
 * 三栏布局（性能优化版）:
 *   第一栏: NavSidebar（功能导航，60px 固定宽度）
 *   第二栏: ListPanel（列表区，CSS 变量驱动宽度，不触发 React 重渲染）
 *   第三栏: ContentArea（内容区，flex: 1）
 *
 * 优化策略:
 *   - 面板拖拽直接用 DOM 操作 CSS 变量，不经过 React state
 *   - App 只订阅 navActive 变化（切换页面才重渲染）
 *   - 子组件通过 Zustand selector 各自订阅所需数据
 */

import React, { useEffect, useRef, useCallback } from 'react'
import { useAgentStore } from './stores/agent-store.js'
import { useChatStore, getLastLoadedAgent } from './stores/chat-store.js'
import { useUIStore } from './stores/ui-store.js'
import { MessageSquare } from 'lucide-react'
import i18n, { useT } from './i18n/i18n.js'
import { NavSidebar } from './components/NavSidebar/NavSidebar.js'
import { ListPanel } from './components/ListPanel/ListPanel.js'
import { ChatPage } from './components/ChatPage/ChatPage.js'
import { AgentManager } from './components/AgentManager/AgentManager.js'
import { StorePage } from './components/StorePage/StorePage.js'
import { ToolboxPage } from './components/ToolboxPage/ToolboxPage.js'
import { SettingsPage } from './components/Settings/SettingsPage.js'

export default function App() {
  const t = useT()
  const loadAgents = useAgentStore((s) => s.load)
  const currentAgent = useAgentStore((s) => s.currentAgent)
  const isClawBotMode = useAgentStore((s) => s.isClawBotMode)
  const initStatusListener = useAgentStore((s) => s.initStatusListener)
  const cleanupStatusListener = useAgentStore((s) => s.cleanupStatusListener)
  const loadHistory = useChatStore((s) => s.loadHistory)
  const loadClawBotHistory = useChatStore((s) => s.loadClawBotHistory)
  const initClawBotListeners = useChatStore((s) => s.initClawBotListeners)
  const cleanupClawBotListeners = useChatStore((s) => s.cleanupClawBotListeners)
  const navActive = useUIStore((s) => s.navActive)
  const setNavActive = useUIStore((s) => s.setNavActive)
  const chatInitiated = useUIStore((s) => s.chatInitiated)

  // 只订阅 navActive 用于切页面，其他数据子组件各自订阅

  // 初始化加载
  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // 启动时从 i18n 同步语言到 Zustand store
  // i18n 从 localStorage 读取上次选择的语言，但 useUIStore.language 默认为 zh-CN
  // 需要同步以确保 ListPanel/AgentManager 等组件使用正确的语言
  useEffect(() => {
    useUIStore.getState().setLanguage(i18n.language)
  }, [])

  // 初始化 Agent 状态变更监听（应用启动时注册一次，卸载时清理）
  useEffect(() => {
    initStatusListener()
    return () => {
      cleanupStatusListener()
    }
  }, [initStatusListener, cleanupStatusListener])

  // 启动时从数据库读取配置并应用主题
  useEffect(() => {
    window.electronAPI.config.get().then((cfg) => {
      if (cfg.theme) {
        useUIStore.getState().setTheme(cfg.theme as any)
      }
    }).catch(() => {
      // 降级：使用 store 默认值，通过 applyTheme 正确处理 system 模式
      const theme = useUIStore.getState().theme
      useUIStore.getState().setTheme(theme)
    })
  }, [])

  // 记录上一个 navActive，用于检测是否刚从其他 Tab 切到聊天 Tab
  const prevNavRef = useRef(navActive)

  // 加载聊天历史
  // 策略：仅在切 Tab 回来或 Agent 变更时加载，chatInitiated 变化不触发（由 switchTo 负责加载）
  useEffect(() => {
    if (navActive === 'chat') {
      if (isClawBotMode) {
        // ClawBot 模式始终重新加载
        loadClawBotHistory()
      } else if (currentAgent && chatInitiated) {
        const justSwitchedToChat = prevNavRef.current !== 'chat'
        // ① 刚从其他 Tab 切到 chat → 强制从 DB 加载（确保消息不丢失）
        // ② 同一 Tab 内 Agent 变了且不在发送中 → 加载
        if (justSwitchedToChat) {
          loadHistory(currentAgent.name)
        } else if (getLastLoadedAgent() !== currentAgent.name && !useChatStore.getState().isSending) {
          loadHistory(currentAgent.name)
        }
      }
    }
    prevNavRef.current = navActive
    // 注意：chatInitiated 不在依赖数组中，避免点击 Agent 时与 switchTo 产生竞态条件
  }, [currentAgent, navActive, loadHistory, isClawBotMode, loadClawBotHistory])

  // ClawBot 模式下初始化实时消息监听
  useEffect(() => {
    if (isClawBotMode && navActive === 'chat') {
      initClawBotListeners()
      return () => {
        cleanupClawBotListeners()
      }
    }
  }, [isClawBotMode, navActive, initClawBotListeners, cleanupClawBotListeners])

  // 面板拖拽（纯 DOM 操作，不触发 React 重渲染）
  const listPanelRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !listPanelRef.current) return
      const newWidth = Math.max(200, Math.min(500, e.clientX - 60))
      // 直接操作 CSS 变量，不经过 React state
      listPanelRef.current.style.setProperty('--panel-width', `${newWidth}px`)
    }

    const handleMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // 持久化宽度到 Zustand（只在松手时一次）
      if (listPanelRef.current) {
        const w = parseInt(listPanelRef.current.style.getPropertyValue('--panel-width')) || 280
        useUIStore.getState().setPanelWidth(w)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // 渲染第三栏内容
  const renderContent = () => {
    switch (navActive) {
      case 'chat':
        // 非 ClawBot 模式下：用户未主动选择 Agent 时展示空状态
        if (!isClawBotMode && !chatInitiated) {
          return (
            <div className="empty-state">
              <MessageSquare size={48} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <div style={{ fontSize: '16px', fontWeight: 500 }}>{t('chat.emptyTitle', '开始对话')}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '400px', lineHeight: '1.6' }}>
                {t('chat.selectAgentToStart', '请先在 Agent 管理中选择一个 Agent 开始对话')}
              </div>
            </div>
          )
        }
        return <ChatPage />
      case 'agent':
        return <AgentManager />
      case 'toolbox':
        return <ToolboxPage />
      case 'store':
        return <StorePage />
      case 'settings':
        return <SettingsPage />
      default:
        return <ChatPage />
    }
  }

  return (
    <div className="layout">
      {/* 第一栏：导航 */}
      <NavSidebar />

      {/* 第二栏：列表区 */}
      <div
        ref={listPanelRef}
        className="list-panel"
        style={{ '--panel-width': '280px' } as React.CSSProperties}
      >
        <ListPanel />
        {/* 拖拽手柄 */}
        <div className="resize-handle" onMouseDown={handleMouseDown} />
      </div>

      {/* 第三栏：内容区 */}
      <div className="content-area">
        {renderContent()}
      </div>
    </div>
  )
}
