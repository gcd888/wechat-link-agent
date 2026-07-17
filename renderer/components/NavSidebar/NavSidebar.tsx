/**
 * 导航侧边栏组件（第一栏）
 *
 * 固定 60px 宽度，包含:
 *   - 应用 Logo
 *   - 聊天 / Agent 管理 / 商城 导航按钮
 *   - 微信连接状态指示器（点击跳转设置页绑定）
 *   - 设置导航按钮
 *
 * 通过 useUIStore 管理导航状态，切换时触发第三栏内容渲染。
 */
import React, { useEffect } from 'react'
import { useT } from '../../i18n/i18n.js'
import { MessageSquare, Bot, Store, Settings, Smartphone, Wrench } from 'lucide-react'
import { useUIStore } from '../../stores/ui-store.js'

/** 导航项类型 */
type NavItem = 'chat' | 'agent' | 'toolbox' | 'store' | 'settings'

/** 导航按钮组件属性 */
interface NavButtonProps {
  icon: React.ReactNode            /** 按钮图标 */
  label: string                    /** 按钮标签（用于 tooltip 和 aria-label） */
  item: NavItem                    /** 导航项标识 */
  active: NavItem                  /** 当前激活的导航项 */
  onClick: (item: NavItem) => void /** 点击回调 */
}

/** 导航按钮组件 — 高亮当前激活项 */
function NavButton({ icon, label, item, active, onClick }: NavButtonProps) {
  return (
    <button
      className={`nav-btn ${active === item ? 'active' : ''}`}
      onClick={() => onClick(item)}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  )
}

/** 导航侧边栏主组件 */
export function NavSidebar() {
  const t = useT()
  const navActive = useUIStore((s) => s.navActive)
  const wechatConnected = useUIStore((s) => s.wechatConnected)
  const setWechatConnected = useUIStore((s) => s.setWechatConnected)
  const setNavActive = useUIStore((s) => s.setNavActive)

  // 启动时查询微信连接状态 + 监听会话过期事件
  useEffect(() => {
    window.electronAPI.wechat.getStatus().then((s) => setWechatConnected(s.connected)).catch(() => {})

    // 监听会话过期，自动更新状态
    window.electronAPI.wechat.onSessionExpired(() => {
      setWechatConnected(false)
    })

    return () => {
      window.electronAPI.wechat.removeSessionExpiredListener()
    }
  }, [])

  return (
    <nav className="nav-sidebar">
      {/* 应用 Logo */}
      <img
        src="./assets/brand/logo.svg"
        alt={t('app.name', '微连')}
        width={36}
        height={36}
        style={{ borderRadius: '10px', objectFit: 'contain', marginBottom: '12px', padding: '2px' }}
        title={t('app.logoTitle', '微连 - WeChat Link Agent')}
      />

      <NavButton icon={<MessageSquare size={22} strokeWidth={1.5} />} label={t('nav.chat', '聊天')} item="chat" active={navActive} onClick={setNavActive} />
      <NavButton icon={<Bot size={22} strokeWidth={1.5} />} label={t('nav.agent', 'Agent 管理')} item="agent" active={navActive} onClick={setNavActive} />
      <NavButton icon={<Wrench size={22} strokeWidth={1.5} />} label={t('nav.toolbox', '工具箱')} item="toolbox" active={navActive} onClick={setNavActive} />
      <NavButton icon={<Store size={22} strokeWidth={1.5} />} label={t('nav.store', '商城')} item="store" active={navActive} onClick={setNavActive} />

      <div style={{ width: '24px', height: '1px', background: 'var(--color-border)', margin: '6px 0', flexShrink: 0 }} />

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        {/* 微信连接状态按钮 - 保留手机图标，悬停显示连接信息 */}
        <button
          className="nav-btn"
          onClick={() => setNavActive('settings', 'wechat')}
          title={wechatConnected
            ? `${t('wechat.bound', '微信已绑定')} • ${t('wechat.connected', '连接正常')}`
            : `${t('wechat.unbound', '微信未绑定')} • ${t('wechat.disconnected', '点击绑定')}`
          }
          style={{ position: 'relative' }}
        >
          <Smartphone size={20} strokeWidth={1.5} style={{
            color: wechatConnected ? 'var(--color-success)' : 'var(--color-text-muted)',
          }} />
          {/* 连接状态小圆点 */}
          <div className={`wechat-dot ${wechatConnected ? 'connected' : 'disconnected'}`}
            style={{ bottom: '4px', right: '2px', width: '7px', height: '7px' }} />
        </button>

        <NavButton icon={<Settings size={22} strokeWidth={1.5} />} label={t('nav.settings', '设置')} item="settings" active={navActive} onClick={setNavActive} />
      </div>
    </nav>
  )
}

