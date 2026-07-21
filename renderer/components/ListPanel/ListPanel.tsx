/**
 * 列表面板组件（第二栏）
 *
 * CSS 变量驱动宽度（200-500px，可拖拽），根据 navActive 渲染不同列表:
 *   - chat:    聊天 Agent 列表 / ClawBot 微信对话入口
 *   - agent:   Agent 管理列表（已安装 + 可用推荐）
 *   - store:   商城分组列表
 *   - settings: 设置分类列表
 *
 * 搜索框支持按关键词过滤列表项。
 * 拖拽通过 DOM 操作 CSS 变量实现，不触发 React 重渲染（性能优化）。
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, Settings, Smartphone, Cloud, Search, Info, ShoppingBag, Plus, MessageSquare, Plug, Star, Package, AlertTriangle, Shield, Link, Lightbulb, Trash2, MessageCircle, Boxes, Edit3, Download, AlertCircle, EyeOff, Lock, Wrench, ExternalLink, Copy } from 'lucide-react'
import { useAgentStore } from '../../stores/agent-store.js'
import { useUIStore } from '../../stores/ui-store.js'
import { useChatStore, resetLastLoadedAgent } from '../../stores/chat-store.js'
import { AgentAvatar } from '../shared/AgentAvatar.js'
import { DisclaimerModal, DisclaimerCheckbox } from '../shared/DisclaimerContent.js'
import { Modal } from '../shared/Modal.js'
import { useT, pickLangField } from '../../i18n/i18n.js'

/** 右键上下文菜单状态 */
interface ContextMenuState {
  x: number
  y: number
  /** 右键目标的类型 */
  targetType: 'agent' | 'session'
  /** Agent 信息（agent 和 session 类型都需要） */
  agentId?: number
  agentName?: string
  /** Session 信息（仅 session 类型） */
  sessionId?: number
  sessionTitle?: string
}

/** 删除确认弹窗状态 */
interface DeleteConfirmState {
  type: 'agent' | 'session'
  agentId: number
  agentName: string
  sessionId?: number
  sessionTitle?: string
}

/** 图标渲染辅助函数 */
const ic = (Icon: any, color?: string) => <Icon size={18} strokeWidth={1.5} style={{ color: color || 'var(--color-text-secondary)', flexShrink: 0 }} />

/** 商城分类图标映射表 */
const CATEGORY_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  api: { icon: <Plug size={16} strokeWidth={1.5} />, color: '#4f9cf7' },
  aggregate: { icon: <Boxes size={16} strokeWidth={1.5} />, color: '#10b981' },
  agent: { icon: <Bot size={16} strokeWidth={1.5} />, color: '#9b59b6' },
  subscription: { icon: <Star size={16} strokeWidth={1.5} />, color: '#f39c12' },
}

/** 商城商品标签配置：官方(绿) / 第三方(橙) / 中转站(紫)，颜色走 CSS 变量适配深浅主题 */
const TAG_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  '官方': { label: '官方', color: 'var(--color-tag-official, #10b981)', bgColor: 'var(--color-tag-official-bg, rgba(16,185,129,0.15))', icon: <Shield size={10} strokeWidth={2} /> },
  '第三方': { label: '第三方', color: 'var(--color-tag-thirdparty, #f59e0b)', bgColor: 'var(--color-tag-thirdparty-bg, rgba(245,158,11,0.15))', icon: <AlertTriangle size={10} strokeWidth={2} /> },
  '中转站': { label: '中转站', color: 'var(--color-tag-relay, #8b5cf6)', bgColor: 'var(--color-tag-relay-bg, rgba(139,92,246,0.15))', icon: <Link size={10} strokeWidth={2} /> },
}

/** 格式化相对时间（如“2小时前”、“1天前”） */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

/** 搜索框组件 */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="search-box" onClick={() => inputRef.current?.focus()}>
      <Search size={14} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <span
          style={{ cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onChange('') }}
        >
          ✕
        </span>
      )}
    </div>
  )
}

function StoreListPanel({ search, onSearchChange }: { search: string; onSearchChange: (v: string) => void }) {
  const t = useT()
  const selectedItem = useUIStore((s) => s.selectedItem)
  const setSelectedItem = useUIStore((s) => s.setSelectedItem)
  const language = useUIStore((s) => s.language)
  const [storeItems, setStoreItems] = useState<StoreItem[]>([])
  const [categories, setCategories] = useState<StoreCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const [confirmModal, setConfirmModal] = useState<{ item: StoreItem } | null>(null)
  const [countdown, setCountdown] = useState(5)
  const [agreed, setAgreed] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.electronAPI.store.list(),
      window.electronAPI.store.categories(),
    ]).then(([items, cats]) => {
      setStoreItems(items)
      setCategories(cats)
      // 商城分组默认全部折叠
      const allCollapsed: Record<string, boolean> = {}
      for (const c of cats) {
        allCollapsed[c.categoryKey] = true
      }
      setCollapsed(allCollapsed)
    }).catch(() => {
      setStoreItems([])
      setCategories([])
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  // 根据当前语言生成分类名映射
  const catLabelMap: Record<string, string> = {}
  for (const cat of categories) {
    catLabelMap[cat.categoryKey] = pickLangField(language, cat.nameZh, cat.nameTw, cat.nameEn)
  }

  // 按搜索过滤 + category 分组
  const filtered = search
    ? storeItems.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.provider && item.provider.toLowerCase().includes(search.toLowerCase())) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase()))
      )
    : storeItems
  const grouped = filtered.reduce<Record<string, StoreItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  /** 点击商品：官方直接打开，非官方（第三方/中转站）弹出风险确认弹窗 */
  const handleItemClick = (item: StoreItem) => {
    const isSelected = selectedItem === item.name
    if (isSelected) {
      setSelectedItem(null)
      return
    }
    // tag 为空时按官方处理（schema 默认值为 '官方'）
    if (!item.tag || item.tag === '官方') {
      setSelectedItem(item.name)
      return
    }
    setConfirmModal({ item })
    setCountdown(5)
    setAgreed(false)
  }

  /** 倒计时定时器：弹窗打开后每秒递减，到 0 后允许确认 */
  useEffect(() => {
    if (!confirmModal || countdown <= 0) return
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)
    return () => clearTimeout(timer)
  }, [confirmModal, countdown])

  /** 用户勾选免责条款且倒计时结束后，确认访问非官方商品 */
  const handleConfirm = () => {
    if (!confirmModal) return
    setSelectedItem(confirmModal.item.name)
    setConfirmModal(null)
  }

  const tagConfig = (tag: string) => TAG_CONFIG[tag] || { label: tag, color: '#6b7280', bgColor: '#f3f4f6', icon: null }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-header"><span className="title">{t('nav.store', '商城')}</span></div>
      <SearchBox value={search} onChange={onSearchChange} placeholder={t('store.search', '搜索商品...')} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px 0' }}>
        {loading ? (
          <div className="empty-state"><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t('common.loading', '加载中...')}</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <ShoppingBag size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: '14px', fontWeight: 500, marginTop: '8px' }}>
              {search ? t('store.noSearchResults', '未找到匹配的商品') : t('store.empty', '暂无商品')}
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => {
            const isOpen = !collapsed[cat]
            const catIcon = CATEGORY_ICONS[cat] || { icon: <Package size={16} strokeWidth={1.5} />, color: '#888' }
            const catLabel = catLabelMap[cat] || cat
            return (
              <div key={cat} style={{ marginBottom: '4px' }}>
                {/* 分组标题（可折叠） */}
                <div
                  className="agent-item"
                  onClick={() => toggleCollapse(cat)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  <span style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: catIcon.color, flexShrink: 0 }}>{catIcon.icon}</span>
                  <div style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>{catLabel}</div>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '1px 6px', borderRadius: '8px', background: 'var(--color-bg-hover)' }}>{items.length}</span>
                </div>
                {/* 分组内的商品列表 */}
                {isOpen && items.map((item) => {
                  const isSelected = selectedItem === item.name
                  const tag = tagConfig(item.tag || '官方')
                  return (
                    <div
                      key={item.id}
                      className={`agent-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleItemClick(item)}
                      style={{ paddingLeft: '42px' }}
                    >
                      <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--color-avatar-bg)', border: '1px solid var(--color-avatar-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: catIcon.color }}>
                        {item.icon ? (
                          <img
                            src={`./assets/icons/${item.icon}`}
                            alt={item.name}
                            width={18}
                            height={18}
                            style={{ objectFit: 'contain' }}
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : null}
                        {!item.icon && catIcon.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isSelected ? 600 : 400, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.name}
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 500,
                              color: tag.color,
                              background: tag.bgColor,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              flexShrink: 0,
                            }}
                          >
                            {tag.icon}
                            {t('store.tag.' + (item.tag || '官方'), tag.label)}
                          </span>
                        </div>
                        {item.provider && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>{item.provider}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {confirmModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            style={{
              background: 'var(--material-popover)',
              backdropFilter: 'var(--material-popover-blur)',
              WebkitBackdropFilter: 'var(--material-popover-blur)',
              borderRadius: '16px',
              width: '420px',
              maxWidth: '90vw',
              padding: '20px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: '1px solid var(--color-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} strokeWidth={1.5} style={{ color: '#f59e0b' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                  {confirmModal.item.tag === '第三方'
                    ? t('store.risk.titleThirdParty', '第三方服务提示')
                    : t('store.risk.titleRelay', '中转站服务提示')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {t('store.risk.description', `您即将访问的「${confirmModal.item.name}」为非官方渠道服务，建议少量多次充值使用。`, { name: confirmModal.item.name })}
                </div>
              </div>
            </div>

            {/* 温馨提示（语气缓和，引导少量多次充值） */}
            <div
              style={{
                background: '#fffbeb',
                borderRadius: '8px',
                padding: '12px',
                marginTop: '16px',
                fontSize: '13px',
                color: '#92400e',
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>{t('store.risk.hintTitle', '💡 温馨提示：')}</div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li>{t('store.risk.hint1', '建议少量多次充值，避免一次性大额充值')}</li>
                <li>{t('store.risk.hint2', '请确认服务正常后再酌情续费')}</li>
                <li>{t('store.risk.hint3', '保留充值记录，便于后续核对')}</li>
                <li>{t('store.risk.hint4', '如遇服务异常，请及时联系提供方')}</li>
              </ul>
            </div>

            {/* 注册风格勾选框：我已阅读并同意《免责声明条款内容》 */}
            <DisclaimerCheckbox
              checked={agreed}
              onChange={setAgreed}
              onShowDisclaimer={() => setShowDisclaimer(true)}
              id="agree-terms"
            />

            {/* 免责声明弹窗 — 点击链接后展示完整内容 */}
            {showDisclaimer && (
              <DisclaimerModal
                onClose={() => setShowDisclaimer(false)}
                onAgree={() => { setAgreed(true); setShowDisclaimer(false) }}
              />
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!agreed || countdown > 0}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: !agreed || countdown > 0 ? '#d1d5db' : '#f59e0b',
                  color: !agreed || countdown > 0 ? '#9ca3af' : '#fff',
                  cursor: !agreed || countdown > 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {countdown > 0
                  ? t('store.risk.countdownConfirm', `确认访问 (${countdown})`, { countdown: String(countdown) })
                  : t('store.risk.confirm', '确认访问')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ListPanel() {
  const t = useT()
  const navActive = useUIStore((s) => s.navActive)
  const selectedItem = useUIStore((s) => s.selectedItem)
  const setSelectedItem = useUIStore((s) => s.setSelectedItem)
  const setNavActive = useUIStore((s) => s.setNavActive)
  const wechatConnected = useUIStore((s) => s.wechatConnected)
  const agents = useAgentStore((s) => s.agents)
  const currentAgent = useAgentStore((s) => s.currentAgent)
  const switchTo = useAgentStore((s) => s.switchTo)
  const isClawBotMode = useAgentStore((s) => s.isClawBotMode)
  const switchToClawBot = useAgentStore((s) => s.switchToClawBot)
  const language = useUIStore((s) => s.language)
  const chatInitiated = useUIStore((s) => s.chatInitiated)
  // 订阅消息列表，用于判断当前 Agent 是否有聊天记录
  const hasMessages = useChatStore((s) => s.messages.length > 0)

  // ── 多会话管理 ──
  const expandedSessionAgents = useUIStore((s) => s.expandedSessionAgents)
  const toggleSessionExpand = useUIStore((s) => s.toggleSessionExpand)
  const currentSessionId = useChatStore((s) => s.currentSessionId)
  const chatSessions = useChatStore((s) => s.sessions)
  const switchSession = useChatStore((s) => s.switchSession)
  const createNewSession = useChatStore((s) => s.createNewSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const renameSession = useChatStore((s) => s.renameSession)

  // 各 Agent 的会话列表缓存（展开时加载，key = agentId）
  const [agentSessionsCache, setAgentSessionsCache] = useState<Record<number, SessionPreview[]>>({})
  // 每个 Agent 展示的会话数量（默认5条，点击加载更多 +5）
  const [sessionDisplayCount, setSessionDisplayCount] = useState<Record<number, number>>({})
  // 隐藏的聊天 Agent（右键「不显示该聊天」，仅内存，重启恢复）
  const [hiddenChatAgents, setHiddenChatAgents] = useState<Set<number>>(new Set())
  // 隐藏的会话（右键「不显示该会话」，仅内存，重启恢复）
  const [hiddenSessions, setHiddenSessions] = useState<Set<number>>(new Set())
  // 删除确认状态（记录正在确认删除的 sessionId）
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<number | null>(null)
  // 正在重命名的 sessionId
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null)
  // 重命名输入的临时文本
  const [editingSessionTitle, setEditingSessionTitle] = useState('')
  // 重命名输入框 ref（自动聚焦）
  const renameInputRef = useRef<HTMLInputElement>(null)

  // ── 右键上下文菜单 ──
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  // 删除确认弹窗
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  // 导出状态提示
  const [exportStatus, setExportStatus] = useState<{ success: boolean; message: string } | null>(null)

  /** 关闭右键菜单（点击菜单项或外部时调用） */
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  /** 右键点击 Agent 条目 */
  const handleAgentContextMenu = useCallback((e: React.MouseEvent, agent: AgentInfo) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetType: 'agent',
      agentId: agent.id,
      agentName: agent.name,
    })
  }, [])

  /** 右键点击会话条目 */
  const handleSessionContextMenu = useCallback((e: React.MouseEvent, agentId: number, agentName: string, session: SessionPreview) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetType: 'session',
      agentId,
      agentName,
      sessionId: session.id,
      sessionTitle: session.title || '',
    })
  }, [])

  /** 执行删除操作 */
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'agent') {
        // 删除 Agent 的所有聊天记录（所有会话 + 消息）
        await window.electronAPI.message.deleteAgentChats(deleteConfirm.agentId)
        // 刷新聊天列表
        const list = await window.electronAPI.message.getChatAgents()
        setChatAgents(list)
        // 清空该 Agent 的会话缓存
        setAgentSessionsCache((prev) => {
          const next = { ...prev }
          delete next[deleteConfirm.agentId]
          return next
        })
        // 如果删除的是当前 Agent 的聊天记录，清空消息和会话状态
        if (currentAgent?.id === deleteConfirm.agentId) {
          useChatStore.setState({ messages: [], sessions: [], currentSessionId: null })
          resetLastLoadedAgent()
        }
      } else if (deleteConfirm.sessionId !== undefined) {
        // 删除单个会话
        await deleteSession(deleteConfirm.sessionId)
        // 刷新缓存
        const sessions = await window.electronAPI.session.list(deleteConfirm.agentId)
        setAgentSessionsCache((prev) => ({ ...prev, [deleteConfirm.agentId]: sessions }))
      }
    } catch (err) {
      // ignore
    }
    setDeleteConfirm(null)
  }, [deleteConfirm, deleteSession, currentAgent])

  /** 执行导出操作 */
  const handleExport = useCallback(async () => {
    if (!contextMenu) return
    const { targetType, agentId, agentName, sessionId } = contextMenu
    setContextMenu(null)
    setExportStatus({ success: false, message: t('chat.exporting', '正在导出...') })
    try {
      let result: { success: boolean; filePath?: string; error?: string }
      if (targetType === 'agent' && agentId && agentName) {
        result = await window.electronAPI.message.exportAgentChats(agentId, agentName)
      } else if (targetType === 'session' && sessionId !== undefined) {
        result = await window.electronAPI.message.exportSession(sessionId)
      } else {
        return
      }
      if (result.success) {
        setExportStatus({ success: true, message: `${t('chat.exportedTo', '已导出到')}: ${result.filePath}` })
      } else {
        setExportStatus({ success: false, message: result.error || t('chat.exportFailed', '导出失败') })
      }
    } catch (err: any) {
      setExportStatus({ success: false, message: err.message || String(err) })
    }
  }, [contextMenu, t])

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  // 导出状态提示自动消失（4 秒后）
  useEffect(() => {
    if (!exportStatus) return
    const timer = setTimeout(() => setExportStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [exportStatus])

  /** 展开/折叠某 Agent 的会话列表，展开时加载会话 */
  const handleToggleSessions = useCallback(async (agentId: number) => {
    const wasExpanded = expandedSessionAgents.has(agentId)
    toggleSessionExpand(agentId)
    // 展开时从 DB 加载最新数据（每次展开都刷新，确保标题为最新）
    if (!wasExpanded) {
      try {
        const sessions = await window.electronAPI.session.list(agentId)
        setAgentSessionsCache((prev) => ({ ...prev, [agentId]: sessions }))
      } catch {
        setAgentSessionsCache((prev) => ({ ...prev, [agentId]: [] }))
      }
    }
  }, [expandedSessionAgents, toggleSessionExpand])

  /** 点击某个会话：先切换 Agent，再切换到指定会话 */
  const handleSessionClick = useCallback(async (agentName: string, sessionId: number) => {
    // 如果不是当前 Agent，先刷新当前 Agent 的会话缓存，再切换
    if (currentAgent?.name !== agentName) {
      // 刷新当前 Agent 的会话缓存，确保切换到其他 Agent 后原 Agent 的标题是最新的
      if (currentAgent?.id) {
        try {
          const sessions = await window.electronAPI.session.list(currentAgent.id)
          setAgentSessionsCache((prev) => ({ ...prev, [currentAgent.id!]: sessions }))
        } catch { /* ignore */ }
      }
      await switchTo(agentName)
    }
    // 切换到指定会话
    await switchSession(sessionId)
  }, [currentAgent, switchTo, switchSession])

  /** 点击新对话按钮：先切换 Agent，再创建新会话 */
  const handleNewSession = useCallback(async (agentName: string) => {
    if (currentAgent?.name !== agentName) {
      await switchTo(agentName)
    }
    await createNewSession()
    // 刷新缓存
    const agent = useAgentStore.getState().currentAgent
    if (agent?.id) {
      const sessions = await window.electronAPI.session.list(agent.id)
      setAgentSessionsCache((prev) => ({ ...prev, [agent.id!]: sessions }))
    }
  }, [currentAgent, switchTo, createNewSession])

  /** 删除会话 */
  const handleDeleteSession = useCallback(async (agentId: number, sessionId: number) => {
    await deleteSession(sessionId)
    setConfirmDeleteSession(null)
    // 刷新缓存
    try {
      const sessions = await window.electronAPI.session.list(agentId)
      setAgentSessionsCache((prev) => ({ ...prev, [agentId]: sessions }))
    } catch {
      // ignore
    }
  }, [deleteSession])

  /** 进入重命名模式 */
  const handleStartRename = useCallback((session: SessionPreview) => {
    setEditingSessionId(session.id)
    setEditingSessionTitle(session.title || '')
    setConfirmDeleteSession(null)
    // 延迟聚焦，等待 input 渲染
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }, [])

  /** 右键菜单：新建会话（仅 Agent 级别） */
  const handleMenuNewSession = useCallback(async () => {
    if (!contextMenu?.agentName) return
    const agentName = contextMenu.agentName
    setContextMenu(null)
    await handleNewSession(agentName)
  }, [contextMenu, handleNewSession])

  /** 右键菜单：重命名会话（仅 Session 级别） */
  const handleMenuRename = useCallback(() => {
    if (!contextMenu?.sessionId) return
    const sessionId = contextMenu.sessionId
    const title = contextMenu.sessionTitle || ''
    setContextMenu(null)
    // 需要找到对应的 session 对象传入 handleStartRename
    const session = agentSessionsCache[contextMenu.agentId!]?.find((s) => s.id === sessionId)
    if (session) {
      handleStartRename(session)
    } else {
      // fallback：直接设置编辑状态
      setEditingSessionId(sessionId)
      setEditingSessionTitle(title)
      setConfirmDeleteSession(null)
      setTimeout(() => renameInputRef.current?.focus(), 50)
    }
  }, [contextMenu, agentSessionsCache, handleStartRename])

  /** 右键菜单：不显示（隐藏） */
  const handleMenuHide = useCallback(() => {
    if (!contextMenu) return
    if (contextMenu.targetType === 'agent' && contextMenu.agentId) {
      setHiddenChatAgents((prev) => new Set(prev).add(contextMenu.agentId!))
    } else if (contextMenu.targetType === 'session' && contextMenu.sessionId) {
      setHiddenSessions((prev) => new Set(prev).add(contextMenu.sessionId!))
    }
    setContextMenu(null)
  }, [contextMenu])

  /** 确认重命名 */
  const handleConfirmRename = useCallback(async (agentId: number, sessionId: number) => {
    const newTitle = editingSessionTitle.trim()
    if (newTitle) {
      await renameSession(sessionId, newTitle)
      // 刷新缓存
      try {
        const sessions = await window.electronAPI.session.list(agentId)
        setAgentSessionsCache((prev) => ({ ...prev, [agentId]: sessions }))
      } catch {
        // ignore
      }
    }
    setEditingSessionId(null)
    setEditingSessionTitle('')
  }, [editingSessionTitle, renameSession])

  /** 取消重命名 */
  const handleCancelRename = useCallback(() => {
    setEditingSessionId(null)
    setEditingSessionTitle('')
  }, [])

  /** 重命名输入框键盘事件：Enter 确认，Escape 取消 */
  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent, agentId: number, sessionId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirmRename(agentId, sessionId)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelRename()
    }
  }, [handleConfirmRename, handleCancelRename])

  // 搜索关键词（切换页面时重置）
  const [searchQuery, setSearchQuery] = useState('')
  const prevNav = useRef(navActive)
  useEffect(() => {
    if (prevNav.current !== navActive) {
      setSearchQuery('')
      prevNav.current = navActive
    }
  }, [navActive])

  // 聊天模式下只展示有聊天记录的 Agent
  const [chatAgents, setChatAgents] = useState<AgentInfo[]>([])
  const [loadingChats, setLoadingChats] = useState(false)
  useEffect(() => {
    if (navActive === 'chat') {
      setLoadingChats(true)
      window.electronAPI.message.getChatAgents().then((list) => {
        setChatAgents(list)
      }).catch(() => {
        setChatAgents([])
      }).finally(() => {
        setLoadingChats(false)
      })
    }
  }, [navActive, agents])

  // 过滤后的聊天列表
  // 当 chatInitiated 为 true 或当前 Agent 有聊天记录时，
  // 将当前 Agent 合并到列表顶部，确保切换 Tab 后仍能看到。
  // 过滤掉被用户「不显示」的 Agent
  const filteredChatAgents = (() => {
    let list = chatAgents.filter((a) => a.id !== undefined && !hiddenChatAgents.has(a.id))
    // 合并当前 Agent（如果不在列表中，且用户主动发起了聊天或有聊天记录）
    if ((chatInitiated || hasMessages) && currentAgent && currentAgent.id !== undefined && !chatAgents.some((a) => a.id === currentAgent.id) && !hiddenChatAgents.has(currentAgent.id)) {
      list = [currentAgent, ...list]
    }
    return searchQuery
      ? list.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : list
  })()

  // 过滤后的 Agent 列表
  const filteredAgents = searchQuery
    ? agents.filter((a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.command.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : agents

  if (navActive === 'chat') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="chat-header"><span className="title">{t('nav.chat', '聊天')}</span></div>
        <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={t('chat.search', '搜索聊天...')} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* 微信 ClawBot 条目（仅微信已连接时显示） */}
          {wechatConnected && !searchQuery && (
            <div
              className={`agent-item ${isClawBotMode ? 'active' : ''}`}
              onClick={() => switchToClawBot()}
              style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '4px' }}
            >
              {/* 占位符：与 Agent 条目的展开箭头宽度对齐 */}
              <span style={{ width: '20px', flexShrink: 0 }} />
              <img
                src="./assets/icons/clawbot.png"
                alt={t('chat.clawbot', '微信 ClawBot')}
                width={24}
                height={24}
                style={{ flexShrink: 0, borderRadius: '6px', objectFit: 'contain' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: isClawBotMode ? 600 : 400, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {t('chat.clawbot', '微信 ClawBot')}
                  <div className="status-dot online" style={{ flexShrink: 0 }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{t('chat.clawbotDesc', '微信对话同步')}</div>
              </div>
            </div>
          )}
          {loadingChats ? (
            <div className="empty-state">
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t('common.loading', '加载中...')}</div>
            </div>
          ) : filteredChatAgents.length === 0 ? (
            <div className="empty-state">
              <MessageSquare size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: '14px', fontWeight: 500, marginTop: '8px' }}>
                {searchQuery ? t('chat.noSearchResults', '未找到匹配的聊天') : t('chat.noHistory', '暂无聊天记录')}
              </div>
            </div>
          ) : (
            filteredChatAgents.map((agent) => {
              const isActive = !isClawBotMode && currentAgent?.id === agent.id
              const isExpanded = expandedSessionAgents.has(agent.id!)
              // 获取该 Agent 的会话列表：优先使用缓存，当前 Agent 也可用 ChatStore 的 sessions
              const sessions = agent.id === currentAgent?.id ? chatSessions : (agentSessionsCache[agent.id!] || [])
              return (
                <div key={agent.id}>
                  {/* Agent 条目（点击切换 Agent + 展开/折叠历史会话） */}
                  <div
                    className={`agent-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (isActive) {
                        // 已是当前 Agent：
                        // - 若 currentSessionId 为空（如重启后），重新调用 switchTo 加载会话和消息
                        // - 否则仅切换展开/折叠
                        if (!currentSessionId) {
                          switchTo(agent.name)
                        }
                        handleToggleSessions(agent.id!)
                      } else {
                        // 非当前 Agent：先切换 Agent（会自动加载会话并选中最新的），再展开会话列表
                        switchTo(agent.name)
                        if (!isExpanded) handleToggleSessions(agent.id!)
                      }
                      // 标记用户已主动进入聊天，触发第三栏渲染 ChatPage
                      useUIStore.setState({ chatInitiated: true })
                    }}
                    onContextMenu={(e) => handleAgentContextMenu(e, agent)}
                  >
                    {/* 展开/折叠指示箭头（放在头像前面，类似微信联系人展开/折叠） */}
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        flexShrink: 0,
                        color: 'var(--color-text-muted)',
                        transition: 'transform 0.15s ease',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      }}
                    >
                      {/* 右箭头图标，展开时旋转 90° 朝下 */}
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <AgentAvatar icon={agent.icon} isActive={isActive} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: isActive ? 600 : 400, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{agent.command}{agent.status === 'processing' ? ` · ${t('chat.processing', '处理中...')}` : ''}</div>
                    </div>
                    {/* 状态圆点统一靠右 */}
                    <div className={`status-dot ${agent.status}`} style={{ flexShrink: 0, marginRight: '4px' }} />
                  </div>

                  {/* 展开的历史会话列表 */}
                  {isExpanded && (
                    <div className="session-sublist">
                      {(() => {
                        // 过滤掉被隐藏的会话
                        const visibleSessions = sessions.filter((s: SessionPreview) => !hiddenSessions.has(s.id))
                        // 获取当前展示数量（默认5）
                        const displayCount = sessionDisplayCount[agent.id!] || 5
                        const displayedSessions = visibleSessions.slice(0, displayCount)
                        const hasMore = visibleSessions.length > displayCount
                        if (visibleSessions.length === 0) {
                          return <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('chat.noSessions', '暂无历史会话')}</div>
                        }
                        return (
                          <>
                            {displayedSessions.map((session: SessionPreview) => {
                              const isCurrentSession = currentSessionId === session.id && isActive
                              const isConfirming = confirmDeleteSession === session.id
                              const isEditing = editingSessionId === session.id
                              return (
                                <div
                                  key={session.id}
                                  className={`session-item ${isCurrentSession ? 'active' : ''}`}
                                  style={{ gap: '10px' }}
                                  onClick={() => !isEditing && handleSessionClick(agent.name, session.id)}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation()
                                    if (!isConfirming) handleStartRename(session)
                                  }}
                                  onContextMenu={(e) => !isEditing && handleSessionContextMenu(e, agent.id!, agent.name, session)}
                                >
                                  {/* 占位符：与 Agent 条目的展开箭头宽度对齐 */}
                                  <span style={{ width: '20px', flexShrink: 0 }} />
                                  {/* 会话图标：与 Agent 头像对齐 */}
                                  <span className="session-icon" style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isCurrentSession ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                                    <MessageCircle size={16} strokeWidth={2} />
                                  </span>

                                  {/* 重命名模式 vs 正常显示 */}
                                  {isEditing ? (
                                    <input
                                      ref={renameInputRef}
                                      className="session-rename-input"
                                      value={editingSessionTitle}
                                      onChange={(e) => setEditingSessionTitle(e.target.value)}
                                      onKeyDown={(e) => handleRenameKeyDown(e, agent.id!, session.id)}
                                      onBlur={() => handleConfirmRename(agent.id!, session.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      maxLength={60}
                                    />
                                  ) : (
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {/* 会话标题 */}
                                      <div className="session-title" style={{ fontSize: '13px', fontWeight: isCurrentSession ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.3' }}>
                                        {session.title || t('chat.untitledSession', '未命名会话')}
                                      </div>
                                      {/* 会话预览：消息数 · 时间 · 最后消息摘要 */}
                                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden' }}>
                                        {session.lastMessageTime ? (
                                          <span style={{ flexShrink: 0 }}>{formatRelativeTime(session.lastMessageTime)}</span>
                                        ) : (
                                          <span style={{ flexShrink: 0 }}>{session.messageCount}{t('chat.msgCount', '条')}</span>
                                        )}
                                        {session.lastMessage && (
                                          <>
                                            <span style={{ flexShrink: 0 }}>·</span>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.lastMessage}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* 操作按钮区域（非编辑模式才显示） */}
                                  {!isEditing && (
                                    isConfirming ? (
                                      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                        <span
                                          onClick={() => handleDeleteSession(agent.id!, session.id)}
                                          style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: 'var(--color-error, #ef4444)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}
                                        >
                                          {t('common.confirm', '确认')}
                                        </span>
                                        <span
                                          onClick={() => setConfirmDeleteSession(null)}
                                          style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                          {t('common.cancel', '取消')}
                                        </span>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                        {/* 重命名按钮（hover 时显示） */}
                                        <span
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleStartRename(session)
                                          }}
                                          title={t('chat.renameSession', '重命名')}
                                          className="session-action-btn"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '3px',
                                            cursor: 'pointer',
                                            color: 'var(--color-text-muted)',
                                            opacity: 0,
                                            transition: 'opacity 0.15s',
                                          }}
                                        >
                                          <Edit3 size={11} strokeWidth={2} />
                                        </span>
                                        {/* 删除按钮（hover 时显示） */}
                                        <span
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setConfirmDeleteSession(session.id)
                                          }}
                                          title={t('chat.deleteSession', '删除会话')}
                                          className="session-action-btn session-delete-btn"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '3px',
                                            cursor: 'pointer',
                                            color: 'var(--color-text-muted)',
                                            opacity: 0,
                                            transition: 'opacity 0.15s',
                                          }}
                                        >
                                          <Trash2 size={11} strokeWidth={2} />
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              )
                            })}
                            {/* 加载更多按钮 */}
                            {hasMore && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSessionDisplayCount((prev) => ({ ...prev, [agent.id!]: (prev[agent.id!] || 5) + 5 }))
                                }}
                                style={{
                                  padding: '8px 16px',
                                  fontSize: '12px',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                              >
                                {t('chat.loadMore', '加载更多')} ({visibleSessions.length - displayCount})
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
          <button style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => setNavActive('agent')}>
            <Plus size={14} strokeWidth={2} /> {t('agent.add', '添加 Agent')}
          </button>
        </div>

        {/* ── 右键上下文菜单 ── */}
        {contextMenu && (
          <div
            style={{
              position: 'fixed',
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 240)),
              left: 68,
              zIndex: 10000,
              background: 'var(--material-popover)',
              backdropFilter: 'var(--material-popover-blur)',
              WebkitBackdropFilter: 'var(--material-popover-blur)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              padding: '6px',
              width: '180px',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 新对话（仅 Agent 级别） */}
            {contextMenu.targetType === 'agent' && (
              <div className="ctx-menu-item" onClick={handleMenuNewSession}>
                <Plus size={14} strokeWidth={2} />
                {t('chat.newSession', '新对话')}
              </div>
            )}
            {/* 重命名（仅 Session 级别） */}
            {contextMenu.targetType === 'session' && (
              <div className="ctx-menu-item" onClick={handleMenuRename}>
                <Edit3 size={14} strokeWidth={2} />
                {t('chat.renameSession', '重命名')}
              </div>
            )}
            {/* 导出 */}
            <div className="ctx-menu-item" onClick={handleExport}>
              <Download size={14} strokeWidth={2} />
              {t('common.export', '导出')}
            </div>
            {/* 分隔线 */}
            <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />
            {/* 不显示 */}
            <div className="ctx-menu-item" onClick={handleMenuHide}>
              <EyeOff size={14} strokeWidth={2} />
              {contextMenu.targetType === 'agent'
                ? t('chat.hideChat', '不显示该聊天')
                : t('chat.hideSession', '不显示该会话')}
            </div>
            {/* 删除（红色） */}
            <div
              className="ctx-menu-item ctx-menu-danger"
              onClick={() => {
                setDeleteConfirm({
                  type: contextMenu.targetType,
                  agentId: contextMenu.agentId!,
                  agentName: contextMenu.agentName!,
                  sessionId: contextMenu.sessionId,
                  sessionTitle: contextMenu.sessionTitle,
                })
                setContextMenu(null)
              }}
            >
              <Trash2 size={14} strokeWidth={2} />
              {contextMenu.targetType === 'agent'
                ? t('chat.deleteAgentChats', '删除聊天记录')
                : t('chat.deleteSessionConfirm', '删除会话')}
            </div>
          </div>
        )}

        {/* ── 删除确认弹窗（二次确认） ── */}
        {deleteConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001,
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              style={{
                background: 'var(--color-bg-panel)',
                borderRadius: '12px',
                width: '400px',
                maxWidth: '90vw',
                padding: '24px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                border: '1px solid var(--color-border)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 警告图标 + 标题 + 描述 */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: 'rgba(239,68,68,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <AlertCircle size={22} strokeWidth={1.5} style={{ color: '#ef4444' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>
                    {deleteConfirm.type === 'agent'
                      ? t('chat.deleteAgentChats', '删除 Agent 聊天记录')
                      : t('chat.deleteSessionConfirm', '删除会话')}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                    {deleteConfirm.type === 'agent'
                      ? t('chat.deleteAgentWarning', `确定要删除「${deleteConfirm.agentName}」的所有聊天记录吗？所有会话和消息将被永久删除，此操作不可恢复。`, { name: deleteConfirm.agentName })
                      : t('chat.deleteSessionWarning', `确定要删除会话「${deleteConfirm.sessionTitle || t('chat.untitledSession', '未命名会话')}」吗？该会话的所有消息将被永久删除，此操作不可恢复。`, { title: deleteConfirm.sessionTitle || t('chat.untitledSession', '未命名会话') })}
                  </div>
                </div>
              </div>
              {/* 取消 / 确认删除 按钮 */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer', fontSize: '14px',
                  }}
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px',
                    border: 'none',
                    background: '#ef4444', color: '#fff',
                    cursor: 'pointer', fontSize: '14px', fontWeight: 500,
                  }}
                >
                  {t('common.confirmDelete', '确认删除')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 导出状态提示（Toast） ── */}
        {exportStatus && (
          <div
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10002,
              background: 'var(--material-popover)',
              backdropFilter: 'var(--material-popover-blur)',
              WebkitBackdropFilter: 'var(--material-popover-blur)',
              border: `1px solid ${exportStatus.success ? 'var(--color-success)' : 'var(--color-error)'}`,
              borderRadius: '12px',
              padding: '10px 16px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              maxWidth: '90vw',
              cursor: 'pointer',
            }}
            onClick={() => setExportStatus(null)}
          >
            {exportStatus.success
              ? <Download size={16} style={{ color: '#10b981', flexShrink: 0 }} />
              : <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
            }
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {exportStatus.message}
            </span>
          </div>
        )}
      </div>
    )
  }

  if (navActive === 'agent') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="chat-header"><span className="title">{t('agent.title', 'Agent 管理')}</span></div>
        <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={t('agent.search', '搜索 Agent...')} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredAgents.length === 0 ? (
            <div className="empty-state">
              <Bot size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                {searchQuery ? t('agent.noSearchResults', '未找到匹配的 Agent') : t('agent.noAgents', '暂无已安装的 Agent')}
              </div>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isSelected = selectedItem === agent.name
              return (
                <div key={agent.id} className={`agent-item ${isSelected ? 'active' : ''}`} onClick={() => setSelectedItem(isSelected ? null : agent.name)} style={{ paddingLeft: '16px' }}>
                  <AgentAvatar icon={agent.icon} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px' }}>{agent.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{agent.command}</div>
                  </div>
                  {/* 状态圆点统一靠右 */}
                  <div className={`status-dot ${agent.status}`} style={{ flexShrink: 0, marginRight: '4px' }} />
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  if (navActive === 'store') {
    return <StoreListPanel search={searchQuery} onSearchChange={setSearchQuery} />
  }

  if (navActive === 'toolbox') {
    return <ToolboxListPanel search={searchQuery} onSearchChange={setSearchQuery} />
  }

  if (navActive === 'settings') {
    const items: Array<{ key: string; label: string; icon: any }> = [
      { key: 'general', label: t('settings.general', '通用设置'), icon: Settings },
      { key: 'security', label: t('settings.security', '安全设置'), icon: Lock },
      { key: 'wechat', label: t('settings.wechat', '微信绑定'), icon: Smartphone },
{ key: 'syncBackup', label: t('settings.syncBackup', '数据同步'), icon: Cloud },
{ key: 'feedback', label: t('settings.feedback', '建议意见'), icon: Lightbulb },
      { key: 'about', label: t('settings.about', '关于'), icon: Info },
    ]
    // 设置项关键词搜索
    const filteredSettings = searchQuery
      ? items.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
      : items
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="chat-header"><span className="title">{t('nav.settings', '设置')}</span></div>
        <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder={t('settings.search', '搜索设置...')} />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredSettings.length === 0 ? (
            <div className="empty-state">
              <Settings size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                {t('settings.noSearchResults', '未找到匹配的设置')}
              </div>
            </div>
          ) : (
            filteredSettings.map((item) => {
              const isSelected = selectedItem === item.key
              return (
                <div key={item.key} className={`agent-item ${isSelected ? 'active' : ''}`} onClick={() => setSelectedItem(item.key)}>
                  <span style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ic(item.icon)}</span>
                  <div style={{ fontSize: '14px' }}>{item.label}</div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return null
}

/** 工具箱右键菜单状态 */
interface ToolboxContextMenuState {
  x: number
  y: number
  providerId: number
  providerName: string
}

/** 工具箱删除确认弹窗状态 */
interface ToolboxDeleteConfirmState {
  providerId: number
  providerName: string
}

/**
 * 工具箱列表面板（第二栏）
 * 展示用户自定义的 LLM 供应商列表，支持新增
 * 右键供应商可复制、修改、删除
 */
function ToolboxListPanel({ search, onSearchChange }: { search: string; onSearchChange: (v: string) => void }) {
  const t = useT()
  const selectedItem = useUIStore((s) => s.selectedItem)
  const setSelectedItem = useUIStore((s) => s.setSelectedItem)
  const setToolboxEditMode = useUIStore((s) => s.setToolboxEditMode)
  const [providers, setProviders] = useState<LlmProvider[]>([])
  const [loading, setLoading] = useState(true)

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ToolboxContextMenuState | null>(null)
  // 删除确认弹窗状态
  const [deleteConfirm, setDeleteConfirm] = useState<ToolboxDeleteConfirmState | null>(null)
  // 操作状态提示（复制/删除等）
  const [actionStatus, setActionStatus] = useState<{ success: boolean; message: string } | null>(null)
  // 复制操作进行中
  const [copying, setCopying] = useState(false)

  // 加载供应商列表
  const loadProviders = useCallback(() => {
    setLoading(true)
    window.electronAPI.provider.list().then((list) => {
      setProviders(list)
    }).catch(() => {
      setProviders([])
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  // 操作状态提示自动消失（3 秒后）
  useEffect(() => {
    if (!actionStatus) return
    const timer = setTimeout(() => setActionStatus(null), 3000)
    return () => clearTimeout(timer)
  }, [actionStatus])

  // 按关键词过滤
  const filteredProviders = search
    ? providers.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : providers

  /** 右键点击供应商：弹出上下文菜单 */
  const handleContextMenu = useCallback((e: React.MouseEvent, provider: LlmProvider) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      providerId: provider.id,
      providerName: provider.name,
    })
  }, [])

  /** 右键菜单 - 复制供应商：加载详情 → 创建副本 */
  const handleCopy = useCallback(async () => {
    if (!contextMenu) return
    const { providerId, providerName } = contextMenu
    setContextMenu(null)
    setCopying(true)
    try {
      // 加载供应商完整详情（含模型和 API Key）
      const detail = await window.electronAPI.provider.get(providerId)
      if (!detail) {
        setActionStatus({ success: false, message: t('toolbox.copyFailed', '复制失败') })
        return
      }
      // 创建副本，名称添加后缀
      const result = await window.electronAPI.provider.create({
        name: providerName + t('toolbox.copySuffix', '（副本）'),
        description: detail.description,
        website: detail.website,
        logoUrl: detail.logoUrl || '',
        baseUris: detail.baseUris,
        apiKey: detail.apiKey || '',
        models: detail.models.map((m) => ({ displayName: m.displayName, modelName: m.modelName })),
      })
      if (result.success) {
        setActionStatus({ success: true, message: t('toolbox.copySuccess', '复制成功') })
        // 刷新列表
        loadProviders()
        // 选中新创建的副本（查看模式）
        if (result.id) {
          setSelectedItem(String(result.id))
        }
      } else {
        setActionStatus({ success: false, message: result.error || t('toolbox.copyFailed', '复制失败') })
      }
    } catch (err: any) {
      setActionStatus({ success: false, message: err.message || t('toolbox.copyFailed', '复制失败') })
    } finally {
      setCopying(false)
    }
  }, [contextMenu, t, loadProviders, setSelectedItem])

  /** 右键菜单 - 修改供应商：进入编辑模式 */
  const handleEdit = useCallback(() => {
    if (!contextMenu) return
    const { providerId } = contextMenu
    setContextMenu(null)
    // 先选中供应商，再切换到编辑模式
    setSelectedItem(String(providerId))
    setToolboxEditMode(true)
  }, [contextMenu, setSelectedItem, setToolboxEditMode])

  /** 右键菜单 - 删除供应商：弹出确认弹窗 */
  const handleDeleteClick = useCallback(() => {
    if (!contextMenu) return
    setDeleteConfirm({
      providerId: contextMenu.providerId,
      providerName: contextMenu.providerName,
    })
    setContextMenu(null)
  }, [contextMenu])

  /** 确认删除供应商 */
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    try {
      const result = await window.electronAPI.provider.delete(deleteConfirm.providerId)
      if (result.success) {
        // 刷新列表
        loadProviders()
        // 如果删除的是当前选中的供应商，清空选中状态
        if (selectedItem === String(deleteConfirm.providerId)) {
          setSelectedItem(null)
        }
      }
    } catch {
      // ignore
    }
    setDeleteConfirm(null)
  }, [deleteConfirm, loadProviders, selectedItem, setSelectedItem])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-header">
        <span className="title">{t('nav.toolbox', '工具箱')}</span>
      </div>
      <SearchBox value={search} onChange={onSearchChange} placeholder={t('toolbox.search', '搜索供应商...')} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div className="empty-state">
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t('common.loading', '加载中...')}</div>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="empty-state">
            <Wrench size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: '14px', fontWeight: 500, marginTop: '8px' }}>
              {search ? t('toolbox.noSearchResults', '未找到匹配的供应商') : t('toolbox.empty', '暂无供应商')}
            </div>
            {!search && (
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                {t('toolbox.clickAdd', '点击下方「新增」添加 LLM 供应商')}
              </div>
            )}
          </div>
        ) : (
          filteredProviders.map((provider) => {
            const isSelected = selectedItem === String(provider.id)
            return (
              <div
                key={provider.id}
                className={`agent-item ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedItem(String(provider.id))}
                onContextMenu={(e) => handleContextMenu(e, provider)}
              >
                <span style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {provider.logoUrl ? (
                    <img
                      src={provider.logoUrl}
                      alt={provider.name}
                      width={20}
                      height={20}
                      style={{ objectFit: 'contain', borderRadius: '4px' }}
                      onError={(e) => {
                        // Logo 加载失败时隐藏图片，显示备用图标
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) {
                          parent.innerHTML = ''
                          const span = document.createElement('span')
                          span.style.display = 'flex'
                          span.style.alignItems = 'center'
                          span.style.justifyContent = 'center'
                          span.style.width = '24px'
                          span.style.height = '24px'
                          span.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + (isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)') + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
                          parent.appendChild(span)
                        }
                      }}
                    />
                  ) : (
                    <Wrench size={18} strokeWidth={1.5} style={{ color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: isSelected ? 600 : 400, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {provider.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {provider.description || provider.website || t('toolbox.noDescription', '暂无描述')}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      {/* 底部新增供应商按钮（参考聊天页面的「添加 Agent」风格） */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
        <button
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px dashed var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          onClick={() => setSelectedItem('__new__')}
        >
          <Plus size={14} strokeWidth={2} /> {t('toolbox.addProvider', '新增供应商')}
        </button>
      </div>

      {/* ── 右键上下文菜单 ── */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 180)),
            left: 68,
            zIndex: 10000,
            background: 'var(--color-bg-panel)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            padding: '6px',
            width: '160px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 复制 */}
          <div className="ctx-menu-item" onClick={handleCopy} style={{ opacity: copying ? 0.5 : 1, pointerEvents: copying ? 'none' : 'auto' }}>
            <Copy size={14} strokeWidth={2} />
            {copying ? t('common.saving', '处理中...') : t('toolbox.ctxCopy', '复制')}
          </div>
          {/* 修改 */}
          <div className="ctx-menu-item" onClick={handleEdit}>
            <Edit3 size={14} strokeWidth={2} />
            {t('toolbox.ctxEdit', '修改')}
          </div>
          {/* 分隔线 */}
          <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />
          {/* 删除（红色） */}
          <div className="ctx-menu-item ctx-menu-danger" onClick={handleDeleteClick}>
            <Trash2 size={14} strokeWidth={2} />
            {t('toolbox.ctxDelete', '删除')}
          </div>
        </div>
      )}

      {/* ── 删除确认弹窗 ── */}
      {deleteConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              background: 'var(--material-popover)',
              backdropFilter: 'var(--material-popover-blur)',
              WebkitBackdropFilter: 'var(--material-popover-blur)',
              borderRadius: '16px',
              width: '400px',
              maxWidth: '90vw',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: '1px solid var(--color-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: 'rgba(239,68,68,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <AlertCircle size={22} strokeWidth={1.5} style={{ color: '#ef4444' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>
                  {t('toolbox.confirmDelete', '确定删除此供应商？')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {t('toolbox.deleteWarning', `确定要删除「${deleteConfirm.providerName}」吗？此操作不可恢复。`, { name: deleteConfirm.providerName })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: '14px',
                }}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444', color: '#fff',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 500,
                }}
              >
                {t('common.confirmDelete', '确认删除')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 操作状态提示（Toast） ── */}
      {actionStatus && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10002,
background: 'var(--material-popover)',
              backdropFilter: 'var(--material-popover-blur)',
              WebkitBackdropFilter: 'var(--material-popover-blur)',
              border: `1px solid ${actionStatus.success ? 'var(--color-success)' : 'var(--color-error)'}`,
              borderRadius: '12px',
              padding: '10px 16px',
              boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            maxWidth: '90vw',
            cursor: 'pointer',
          }}
          onClick={() => setActionStatus(null)}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {actionStatus.message}
          </span>
        </div>
      )}
    </div>
  )
}
