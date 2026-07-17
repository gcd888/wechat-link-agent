/**
 * 设置页面组件（第三栏）
 *
 * 根据 selectedItem 渲染不同设置子页面:
 *   - general:    通用设置（主题、语言、工作目录、开机自启、后台运行）
 *   - wechat:     微信绑定（扫码绑定 / 断开连接）
 *   - syncBackup: 数据同步（云端同步 WebDAV 配置 + 本地备份恢复，Tab 切换）
 *   - about:      关于（版本 / 平台 / 数据目录信息）
 */
import { useState, useEffect, useRef, createElement, type ReactNode } from 'react'
import { Settings as SettingsIcon, Smartphone, Info, RotateCw, ScanLine, Cloud, HardDrive, Loader, Clock, Lightbulb, MessageSquare, MessageCircle, Copy, ExternalLink, Check, X, Lock, Unlock, KeyRound, Trash2, Save, Plug, Upload, Download, Unlink, RefreshCw } from 'lucide-react'
import i18n, { useT } from '../../i18n/i18n.js'
import { useUIStore } from '../../stores/ui-store.js'
import { Modal } from '../shared/Modal.js'
import QRCode from 'qrcode'

/** 生成二维码 data URL（用于微信扫码绑定） */
async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/** 设置页面主组件 — 根据选中的设置项渲染对应子页面 */
export function SettingsPage() {
  const t = useT()
  const selectedItem = useUIStore((s) => s.selectedItem)
  switch (selectedItem) {
    case 'general': return <GeneralSettings />
    case 'security': return <SecuritySettings />
    case 'wechat': return <WechatSettings />
    case 'syncBackup': return <SyncBackupSettings />
    case 'feedback': return <FeedbackSettings />
    case 'about': return <AboutSettings />
    default: return (
      <div className="empty-state">
        <SettingsIcon size={48} strokeWidth={1.5} style={{ opacity: 0.3, marginBottom: '12px' }} />
        <div style={{ fontSize: '16px', fontWeight: 500 }}>{t('settings.title', '设置')}</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t('settings.selectCategory', '请从左侧选择一个设置分类')}</div>
      </div>
    )
  }
}

function GeneralSettings() {
  const t = useT()
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const [cfg, setCfg] = useState<AppConfig>({ language: '', theme: '', workingDirectory: '', systemPrompt: '', launchOnStartup: false, minimizeToTray: true })
  const [workingDir, setWorkingDir] = useState('')

  useEffect(() => {
    window.electronAPI.config.get().then((c) => { setCfg(c); setWorkingDir(c.workingDirectory || '') }).catch(() => {})
  }, [])

  const updateCfg = async (partial: Partial<AppConfig>) => {
    const updated = await window.electronAPI.config.update(partial as any)
    setCfg(updated)
    if (partial.workingDirectory) setWorkingDir(updated.workingDirectory || '')
  }

  const handlePickDir = async () => {
    const dir = await window.electronAPI.config.pickDirectory()
    if (dir) await updateCfg({ workingDirectory: dir } as any)
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><SettingsIcon size={20} strokeWidth={1.5} /> {t('settings.general', '通用设置')}</div>
      <SettingCard title={t('settings.theme', '主题')}>
        <select className="chat-input" value={theme} onChange={(e) => setTheme(e.target.value as any)} style={{ cursor: 'pointer' }}>
          <option value="dark">{t('settings.dark', '深色模式')}</option>
          <option value="light">{t('settings.light', '浅色模式')}</option>
          <option value="system">{t('settings.system', '跟随系统')}</option>
        </select>
      </SettingCard>
      <SettingCard title={t('settings.language', '语言')}>
        <select className="chat-input" value={i18n.language} onChange={(e) => { i18n.changeLanguage(e.target.value); localStorage.setItem('i18nextLng', e.target.value); useUIStore.getState().setLanguage(e.target.value) }} style={{ cursor: 'pointer' }}>
          <option value="zh-CN">{t('settings.zhCN', '简体中文')}</option>
          <option value="zh-TW">{t('settings.zhTW', '繁体中文')}</option>
          <option value="en">{t('settings.en', 'English')}</option>
        </select>
      </SettingCard>
      <SettingCard title={t('settings.launchOnStartup', '开机自启')}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
          <input type="checkbox" checked={cfg.launchOnStartup} onChange={(e) => updateCfg({ launchOnStartup: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          {t('settings.launchOnStartupDesc', '开机时自动启动微连')}
        </label>
      </SettingCard>
      <SettingCard title={t('settings.minimizeToTray', '后台运行')}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
          <input type="checkbox" checked={cfg.minimizeToTray}
            onChange={(e) => {
              const checked = e.target.checked
              // 取消勾选时弹出警告
              if (!checked && !window.confirm(t('settings.minimizeToTrayWarn', '取消后台运行后，关闭窗口将直接退出应用。\n微信 ClawBot 将无法连接电脑上的 Agent。\n\n确定要取消后台运行吗？'))) {
                // 用户取消—直接 return，checkbox 会因 checked={cfg.minimizeToTray} 自动恢复
                return
              }
              updateCfg({ minimizeToTray: checked })
            }}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          {t('settings.minimizeToTrayDesc', '关闭窗口时最小化到托盘而不是退出')}
        </label>
      </SettingCard>
      <SettingCard title={t('settings.workspace', '工作空间')}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input className="chat-input" value={workingDir || ''} readOnly placeholder={t('settings.selectWorkspace', '选择工作空间')} style={{ flex: 1, cursor: 'default' }} />
          <button onClick={handlePickDir} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text)', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>{t('common.browse', '浏览')}</button>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          {t('settings.workspaceDesc', '*应用数据存储在 ~/.wechat-link-agent/ 目录下')}
        </div>
      </SettingCard>
    </div>
  )
}

/**
 * 渲染包含行内代码（反引号包裹）的文本
 * 将 `code` 格式的文本解析为 <code> 元素，其余部分保持纯文本
 * 支持 \n 换行（配合父容器 white-space: pre-line）
 */
function renderInlineCode(text: string): ReactNode[] {
  // 按反引号对拆分，捕获组保留分隔符
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      // 去掉首尾反引号，渲染为 <code>
      return createElement('code', {
        key: i,
        style: {
          background: 'var(--color-bg-card)',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          border: '1px solid var(--color-border)',
        },
      }, part.slice(1, -1))
    }
    return part
  })
}

function WechatSettings() {
  const t = useT()
  const wechatConnected = useUIStore((s) => s.wechatConnected)
  const setWechatConnected = useUIStore((s) => s.setWechatConnected)
  const [connected, setConnected] = useState(wechatConnected)
  const [qrcodeUrl, setQrcodeUrl] = useState<string | null>(null)
  const [qrcodeId, setQrcodeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountInfo, setAccountInfo] = useState<{ accountId?: string; userId?: string } | null>(null)
  /** 绑定成功后显示的引导提示（提示用户在微信端发送消息） */
  const [guideMessage, setGuideMessage] = useState<string | null>(null)
  /**
   * 扫码状态：null=未开始 / 'wait'=等待扫码 / 'scaned'=已扫码待确认 / 'expired'=过期刷新中
   * 'scaned' 时在二维码中央叠加"请在手机上确认绑定"遮罩，避免一码多用
   */
  const [scanStatus, setScanStatus] = useState<'wait' | 'scaned' | 'expired' | null>(null)

  // 初始加载状态
  useEffect(() => {
    window.electronAPI.wechat.getStatus().then((s) => {
      setConnected(s.connected)
      setAccountInfo(s)
      setWechatConnected(s.connected)
    })
  }, [])

  // 监听会话过期
  useEffect(() => {
    window.electronAPI.wechat.onSessionExpired(() => {
      setConnected(false)
      setWechatConnected(false)
      setAccountInfo(null)
      setError(t('settings.sessionExpired', '微信会话已过期，请重新绑定'))
    })
    return () => {
      window.electronAPI.wechat.removeSessionExpiredListener()
    }
  }, [])

  // 监听扫码状态变更（wait/scaned/expired/regenerated/confirmed）
  // - scaned: 在二维码中央显示"请在手机上确认绑定"遮罩
  // - expired: 显示"正在刷新..."提示（autoRegenerate 启用时随后会推送 regenerated）
  // - regenerated: 用新二维码 URL 替换显示
  useEffect(() => {
    window.electronAPI.wechat.onScanStatus(async (data) => {
      switch (data.status) {
        case 'wait':
          setScanStatus('wait')
          break
        case 'scaned':
          setScanStatus('scaned')
          break
        case 'expired':
          setScanStatus('expired')
          break
        case 'regenerated': {
          setScanStatus('wait')
          setQrcodeId(data.qrcodeId)
          let nextUrl = data.qrcodeUrl
          try {
            nextUrl = await generateQrDataUrl(data.qrcodeUrl)
          } catch {
            // 生成失败退回原始 URL
          }
          setQrcodeUrl(nextUrl)
          break
        }
        case 'confirmed':
          setScanStatus(null)
          break
      }
    })
    return () => {
      window.electronAPI.wechat.removeScanStatusListener()
    }
  }, [])

  // 点击「扫码绑定微信」
  const handleStartLogin = async () => {
    setLoading(true)
    setError(null)
    setGuideMessage(null)
    setQrcodeUrl(null)
    setScanStatus(null)
    try {
      const res = await window.electronAPI.wechat.startLogin()
      if (!res.success || !res.qrcodeUrl || !res.qrcodeId) {
        setError(res.error || t('settings.qrFailed', '获取二维码失败'))
        setLoading(false)
        return
      }
      setQrcodeUrl(res.qrcodeUrl)
      setQrcodeId(res.qrcodeId)
      setScanStatus('wait')

      // res.qrcodeUrl 是 iLink API 返回的 URL，需要用 qrcode 库生成二维码图片
      let qrImageDataUrl = res.qrcodeUrl
      try {
        qrImageDataUrl = await generateQrDataUrl(res.qrcodeUrl)
      } catch {
        // 如果生成失败，退回原始 URL（可能本身就是 data URI）
      }
      setQrcodeUrl(qrImageDataUrl)

      // 自动开始等待扫码（后端启用 autoRegenerate，过期会自动重生成并通过 onScanStatus 推送）
      const scanRes = await window.electronAPI.wechat.waitForScan(res.qrcodeId)
      if (scanRes.success) {
        setConnected(true)
        setWechatConnected(true)
        setQrcodeUrl(null)
        setScanStatus(null)
        // 刷新账号信息
        const status = await window.electronAPI.wechat.getStatus()
        setAccountInfo(status)
        // 显示引导提示：告知用户需要在微信端发送消息才能触发欢迎消息
        setGuideMessage(t('bot.welcome.guide', '🎉 绑定成功！请向微信中的「微连」发送消息即可开始使用。'))
      } else {
        setError(scanRes.error || t('settings.scanFailed', '扫码失败，请重试'))
        setQrcodeUrl(null)
        setScanStatus(null)
      }
    } catch (e: any) {
      setError(e.message || String(e))
      setQrcodeUrl(null)
      setScanStatus(null)
    } finally {
      setLoading(false)
    }
  }

  // 断开连接
  const handleDisconnect = async () => {
    await window.electronAPI.wechat.disconnect()
    setConnected(false)
    setWechatConnected(false)
    setAccountInfo(null)
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Smartphone size={20} strokeWidth={1.5} /> {t('settings.wechat', '微信绑定')}</div>

      {/* 绑定状态 */}
      <SettingCard title={t('settings.wechatStatus', '绑定状态')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
          <div className={`status-dot ${connected ? 'online' : 'offline'}`} />
          <span>{connected ? t('settings.wechatBound', '已绑定') : t('settings.wechatUnbound', '未绑定')}</span>
          {connected && accountInfo?.accountId && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
              ID: {accountInfo.accountId}
            </span>
          )}
        </div>
      </SettingCard>

      {/* 二维码区域 */}
      {qrcodeUrl && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>
            {t('settings.wechatScanHint', '📲 请用微信扫描二维码绑定')}
          </div>
          <div style={{ position: 'relative', width: '236px', height: '236px' }}>
            <img
              src={qrcodeUrl}
              alt={t('settings.wechatQrAlt', '微信绑定二维码')}
              style={{
                width: '220px',
                height: '220px',
                objectFit: 'contain',
                borderRadius: '8px',
                background: '#fff',
                padding: '8px',
                opacity: scanStatus === 'scaned' ? 0.25 : 1,
                transition: 'opacity 200ms ease',
              }}
            />
            {/* 已扫码遮罩：在二维码中央显示"请在手机上确认绑定"，避免一码多用 */}
            {scanStatus === 'scaned' && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                pointerEvents: 'none',
              }}>
                <div style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  textAlign: 'center',
                  padding: '0 12px',
                }}>
                  {t('settings.qrScanned', '请在手机上确认绑定')}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  padding: '0 16px',
                }}>
                  {t('settings.qrScannedSubtitle', '已扫码，为避免一码多用请在手机上完成确认')}
                </div>
              </div>
            )}
            {/* 过期刷新中提示 */}
            {scanStatus === 'expired' && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--color-text-muted)',
                  background: 'rgba(255,255,255,0.85)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                }}>
                  {t('settings.qrExpired', '二维码已过期，正在自动刷新...')}
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
            {scanStatus === 'scaned'
              ? t('settings.qrScanned', '请在手机上确认绑定')
              : scanStatus === 'expired'
                ? t('settings.qrExpired', '二维码已过期，正在自动刷新...')
                : t('settings.wechatWaiting', '正在等待扫码确认...')}
          </div>
        </div>
      )}

      {/* 引导提示（绑定成功后显示） */}
      {guideMessage && (
        <div style={{
          fontSize: '13px',
          padding: '12px 14px',
          background: 'var(--color-bg-hover)',
          borderRadius: '8px',
          marginBottom: '16px',
          color: 'var(--color-text)',
          whiteSpace: 'pre-line',
          border: '1px solid var(--color-border)',
        }}>
          {renderInlineCode(guideMessage)}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div style={{
          fontSize: '13px',
          padding: '10px 14px',
          background: 'var(--color-bg-hover)',
          borderRadius: '6px',
          marginBottom: '16px',
          color: 'var(--color-error)',
        }}>
          {error}
        </div>
      )}

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        {loading ? (
          <button className="action-btn" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
            <Loader size={14} strokeWidth={1.5} style={{ marginRight: '4px', animation: 'spin 1s linear infinite' }} />{t('common.loading', '处理中...')}
          </button>
        ) : connected ? (
          <button
            onClick={handleStartLogin}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '8px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              border: '1px solid var(--color-border)', borderRadius: '8px',
              background: 'transparent', color: 'var(--color-text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            <RotateCw size={15} strokeWidth={1.5} />{t('settings.wechatRebind', '重新绑定')}
          </button>
        ) : (
          <button
            onClick={handleStartLogin}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              border: 'none', borderRadius: '8px',
              background: 'var(--color-primary)',
              color: '#fff',
              transition: 'all 0.2s',
            }}
          >
            <ScanLine size={16} strokeWidth={2} />{t('settings.wechatBind', '微信扫码')}
          </button>
        )}
        {connected && (
          <button
            onClick={handleDisconnect}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              border: '1px solid var(--color-error)', borderRadius: '8px',
              background: 'transparent', color: 'var(--color-error)',
              transition: 'all 0.2s',
            }}
          >
            <Unlink size={15} strokeWidth={1.5} />{t('settings.wechatDisconnect', '断开连接')}
          </button>
        )}
      </div>

      {/* 说明文字 */}
      <div style={{
        fontSize: '12px',
        color: 'var(--color-text-muted)',
        marginTop: '16px',
        lineHeight: 1.8,
      }}>
        <div>{t('settings.wechatBindTips', '💡 绑定后，你可以通过微信与本电脑上的 AI Agent 对话。')}</div>
        <div>{t('settings.wechatBindTip1', '· 在微信中发送消息即可触发 Agent 响应')}</div>
        <div>{t('settings.wechatBindTip2', '· 支持 /wla /wlc /model /cwd 等命令')}</div>
        <div>{t('settings.wechatBindTip3', '· 支持发送图片和文件给 Agent 处理')}</div>
      </div>
    </div>
  )
}

/**
 * 数据同步页面（云端同步 + 备份恢复合并）
 *
 * 通过顶部 Tab 切换两个功能区:
 *   - 云端同步: WebDAV 配置 / 测试 / 上传 / 下载
 *   - 备份恢复: 创建本地备份 / 从备份恢复
 */
function SyncBackupSettings() {
  const t = useT()
  const [activeTab, setActiveTab] = useState<'sync' | 'backup'>('sync')

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      {/* 页面标题 */}
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Cloud size={20} strokeWidth={1.5} /> {t('settings.syncBackup', '数据同步')}
      </div>

      {/* Tab 切换栏 */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setActiveTab('sync')}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: activeTab === 'sync' ? 600 : 400,
            color: activeTab === 'sync' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'sync' ? '2px solid var(--color-primary)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '-1px',
          }}
        >
          <Cloud size={16} strokeWidth={1.5} />
          {t('settings.sync', '云端同步')}
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: activeTab === 'backup' ? 600 : 400,
            color: activeTab === 'backup' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'backup' ? '2px solid var(--color-primary)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '-1px',
          }}
        >
          <HardDrive size={16} strokeWidth={1.5} />
          {t('settings.backupTitle', '备份恢复')}
        </button>
      </div>

      {/* 根据当前 Tab 渲染对应功能区 */}
      {activeTab === 'sync' ? <SyncTabContent /> : <BackupTabContent />}
    </div>
  )
}

/** 云端同步 Tab 内容 */
function SyncTabContent() {
  const t = useT()
  const [config, setConfig] = useState({ baseUrl: '', username: '', password: '', remoteRoot: 'wechat-link-agent-sync', profile: 'default', autoSync: false, autoSyncInterval: 30 })
  const [msg, setMsg] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<{ lastSyncAt: number | null; lastError: string | null; isSyncing: boolean }>({ lastSyncAt: null, lastError: null, isSyncing: false })

  // 加载同步状态（最近同步时间等）
  const refreshStatus = () => {
    window.electronAPI.sync.getStatus().then(setSyncStatus).catch(() => {})
  }

  // 组件挂载时从数据库加载已保存的配置 + 同步状态
  useEffect(() => {
    window.electronAPI.sync.getConfig().then((saved) => {
      if (saved) {
        setConfig({
          baseUrl: saved.baseUrl || '',
          username: saved.username || '',
          password: saved.password || '',
          remoteRoot: saved.remoteRoot || 'wechat-link-agent-sync',
          profile: saved.profile || 'default',
          autoSync: saved.autoSync ?? false,
          autoSyncInterval: saved.autoSyncInterval ?? 30,
        })
      }
    }).catch(() => { /* 静默忽略 */ })
    refreshStatus()
    // 每 30 秒刷新一次状态（显示自动同步的最新时间）
    const timer = setInterval(refreshStatus, 30000)
    return () => clearInterval(timer)
  }, [])

  const save = async () => { await window.electronAPI.sync.saveConfig({ enabled: true, syncType: 'webdav', ...config }); setMsg(t('settings.syncSave', '保存成功')); refreshStatus() }
  const test = async () => { const r = await window.electronAPI.sync.test(); setMsg(r.success ? t('settings.syncSuccess', '连接成功') : (r.message || t('settings.syncFailed', '连接失败'))); refreshStatus() }
  const upload = async () => { await window.electronAPI.sync.upload(); setMsg(t('settings.syncUpload', '上传成功')); refreshStatus() }
  const download = async () => { await window.electronAPI.sync.download(); setMsg(t('settings.syncDownload', '下载成功')); refreshStatus() }

  // 格式化最近同步时间
  const formatSyncTime = (ts: number | null): string => {
    if (!ts) return t('settings.neverSynced', '从未同步')
    const date = new Date(ts)
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return t('settings.justNow', '刚刚')
    if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('settings.minutesAgo', '分钟前')}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('settings.hoursAgo', '小时前')}`
    return date.toLocaleString()
  }
  return (
    <>
      <SettingCard title={t('settings.syncServerUrl', '服务器地址')}><input className="chat-input" placeholder="https://dav.example.com/" value={config.baseUrl} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} /></SettingCard>
      <SettingCard title={t('settings.syncUsername', '用户名')}><input className="chat-input" value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} /></SettingCard>
      <SettingCard title={t('settings.syncPassword', '密码')}><input className="chat-input" type="password" value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} /></SettingCard>
      {/* 自动同步勾选 + 频率选择 */}
      <SettingCard title={t('settings.autoSync', '自动同步')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
            <input type="checkbox" checked={config.autoSync} onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            {t('settings.autoSyncEnable', '开启后定时自动上传')}
          </label>
          {config.autoSync && (
            <>
              <select style={{ width: 'auto', fontSize: '13px', padding: '2px 6px', height: '24px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-input)', color: 'var(--color-text)', cursor: 'pointer', outline: 'none' }} value={config.autoSyncInterval} onChange={(e) => setConfig({ ...config, autoSyncInterval: Number(e.target.value) })}>
                <option value={5}>5 {t('settings.minutes', '分钟')}</option>
                <option value={10}>10 {t('settings.minutes', '分钟')}</option>
                <option value={15}>15 {t('settings.minutes', '分钟')}</option>
                <option value={30}>30 {t('settings.minutes', '分钟')}</option>
                <option value={60}>60 {t('settings.minutes', '分钟')}</option>
              </select>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('settings.autoSyncHint', '保存配置后生效')}</span>
            </>
          )}
        </div>
      </SettingCard>
      {/* 最近同步状态（放在按钮上方） */}
      <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
        {syncStatus.isSyncing ? (
          <>
            <Loader size={13} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--color-primary)' }}>{t('settings.syncing', '同步中...')}</span>
          </>
        ) : (
          <>
            <Clock size={13} strokeWidth={1.5} style={{ color: 'var(--color-text-muted)' }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{t('settings.lastSync', '最近同步')}:</span>
            <span style={{ color: 'var(--color-text)' }}>{formatSyncTime(syncStatus.lastSyncAt)}</span>
            {syncStatus.lastError && (
              <span style={{ color: 'var(--color-error)', marginLeft: '8px' }}>⚠️ {syncStatus.lastError}</span>
            )}
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
        <button className="action-btn" onClick={test}><Plug size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} />{t('settings.syncTest', '测试连接')}</button>
        <button className="action-btn primary" onClick={save}><Save size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} />{t('settings.syncSave', '保存配置')}</button>
        <button className="action-btn" onClick={upload}><Upload size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} />{t('settings.syncUpload', '上传同步')}</button>
        <button className="action-btn" onClick={download}><Download size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} />{t('settings.syncDownload', '下载同步')}</button>
      </div>
      {msg && <div style={{ fontSize: '13px', marginTop: '12px', padding: '8px 12px', background: 'var(--color-bg-hover)', borderRadius: '6px' }}>{msg}</div>}
    </>
  )
}

/** 备份恢复 Tab 内容 */
function BackupTabContent() {
  const t = useT()
  const [backups, setBackups] = useState<Array<{ filename: string; path: string; size: number; createdAt: Date }>>([])
  const [msg, setMsg] = useState<string | null>(null)
  const load = async () => { try { setBackups(await window.electronAPI.backup.list()) } catch { /* ignore */ } }
  useEffect(() => { load() }, [])
  const create = async () => { const p = await window.electronAPI.backup.create(); setMsg(t('settings.backupCreated', '备份已创建') + ': ' + p); load() }
  const restore = async (p: string) => { if (!window.confirm(t('settings.backupConfirm', '确定要恢复此备份吗？'))) return; await window.electronAPI.backup.restore(p); setMsg(t('settings.backupRestored', '已从备份恢复')); load() }
  const remove = async (p: string) => { if (!window.confirm(t('settings.backupDeleteConfirm', '确定要删除此备份吗？'))) return; await window.electronAPI.backup.delete(p); setMsg(t('settings.backupDeleted', '备份已删除')); load() }
  return (
    <>
      <button className="action-btn primary" onClick={create}>{t('settings.backupCreate', '创建备份')}</button>
      <div style={{ marginTop: '20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', color: 'var(--color-text-secondary)' }}>{t('settings.backupExisting', '已有备份')}</div>
        {backups.length === 0 ? <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>{t('settings.backupNone', '暂无备份')}</div>
        : backups.slice(0, 10).map((b, i) => (
          <div key={i} style={{ padding: '10px 14px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '6px', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
            <div><div>{b.filename}</div><div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{(b.size / 1024).toFixed(1)} KB</div></div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => restore(b.path)} style={{ padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px' }}>{t('settings.backupRestore', '恢复')}</button>
              <button onClick={() => remove(b.path)} style={{ padding: '4px 8px', border: '1px solid var(--color-error)', borderRadius: '4px', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', fontSize: '12px' }}>{t('settings.backupDelete', '删除')}</button>
            </div>
          </div>
        ))}
      </div>
      {msg && <div style={{ fontSize: '13px', marginTop: '16px', padding: '8px 12px', background: 'var(--color-bg-hover)', borderRadius: '6px' }}>{msg}</div>}
    </>
  )
}

/** 建议意见页面 — 四种反馈渠道：腾讯问卷 / 微信群 / Gitee Issue / GitHub Issue */
type FeedbackChannel = {
  key: string
  icon: React.ReactNode
  color?: string
  bg?: string
  color2?: string
  bg2?: string
  title: string
  desc: string
  url?: string | null
  image?: string
}

function FeedbackSettings() {
  const t = useT()
  // 微信群二维码图片链接（稍后由用户提供，留空时显示占位提示）
  // 占位常量：后续可替换为真实图片 URL
  const WECHAT_GROUP_IMG = 'https://ftp.mioz.cn/test/2026/07/09/1783583357.JPG'

  // 腾讯问卷投放链接（中英双语，含图片上传题，支持功能建议/Bug/页面优化反馈）
  const SURVEY_URL = 'https://wj.qq.com/s2/27267265/5620'
  // Gitee / GitHub Issue 入口
  const GITEE_ISSUES_URL = 'https://gitee.com/gcd888/wechat-link-agent/issues'
  const GITHUB_ISSUES_URL = 'https://github.com/gcd888/wechat-link-agent/issues'

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  // 微信群二维码弹窗显示状态
  const [showWechatQr, setShowWechatQr] = useState(false)
  // 内嵌网页状态：非空时在第三列用 webview 打开对应链接
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [embedTitle, setEmbedTitle] = useState('')

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      // 剪贴板可能被禁用，静默忽略
    }
  }

  const handleOpenExternal = (url: string) => {
    window.electronAPI.app.openExternal(url)
  }

  const handleEmbed = (ch: FeedbackChannel) => {
    if (!ch.url) return
    setEmbedUrl(ch.url)
    setEmbedTitle(ch.title)
  }

  // 反馈渠道配置
  const channels: FeedbackChannel[] = [
    {
      key: 'survey',
      icon: <MessageSquare size={22} strokeWidth={1.5} />,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.10)',
      title: t('settings.feedbackSurvey', '填写表单'),
      desc: t('settings.feedbackSurveyDesc', '提交功能建议 / Bug 反馈 / 页面优化想法，支持上传截图'),
      url: SURVEY_URL,
    },
    {
      key: 'wechat',
      icon: <MessageCircle size={22} strokeWidth={1.5} />,
      color: '#07c160',
      bg: 'rgba(7,193,96,0.10)',
      title: t('settings.feedbackWechatGroup', '微信群'),
      desc: t('settings.feedbackWechatGroupDesc', '扫码加入官方微信群，与开发者直接交流'),
      url: WECHAT_GROUP_IMG || null,
      image: WECHAT_GROUP_IMG,
    },
    {
      key: 'gitee',
      icon: <img src="./assets/icons/gitee.ico" alt="Gitee" width={28} height={28} style={{ display: 'block', objectFit: 'contain' }} />,
      color2: '#c71d23',
      bg2: 'rgba(199,29,35,0.10)',
      title: t('settings.feedbackGitee', 'Gitee Issue'),
      desc: t('settings.feedbackGiteeDesc', '在 Gitee 仓库提交 Issue，跟踪问题处理进度'),
      url: GITEE_ISSUES_URL,
    },
    {
      key: 'github',
      icon: <img src="./assets/icons/github.svg" alt="GitHub" width={26} height={26} className="feedback-brand-icon" style={{ display: 'block', objectFit: 'contain' }} />,
      color: '#24292e',
      bg: 'rgba(36,41,46,0.10)',
      title: t('settings.feedbackGithub', 'GitHub Issue'),
      desc: t('settings.feedbackGithubDesc', '在 GitHub 仓库提交 Issue，跟踪问题处理进度'),
      url: GITHUB_ISSUES_URL,
    },
  ]

  // 内嵌网页视图（第三列直接打开，右上角关闭返回卡片）
  const webviewProps: any = {
    src: embedUrl,
    style: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    allowpopups: 'true',
  }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      {embedUrl ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, gap: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <Lightbulb size={16} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{embedTitle}</span>
            </div>
            <button
              className="feedback-close-btn"
              onClick={() => setEmbedUrl(null)}
              title={t('settings.feedbackClose', '关闭')}
              aria-label={t('settings.feedbackClose', '关闭')}
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            {createElement('webview', webviewProps)}
          </div>
        </div>
      ) : (
        <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
          <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={20} strokeWidth={1.5} /> {t('settings.feedback', '建议意见')}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '20px' }}>
            {t('settings.feedbackIntro', '感谢使用微连！我们非常重视您的反馈。请通过以下任意方式提交建议、反馈 Bug 或与我们交流，每一条留言我们都会认真阅读。')}
          </div>

          {/* 反馈渠道网格：2 行 2 列（2×2），窄屏回退单列 */}
          <div className="feedback-grid">
            {channels.map((ch) => (
              <div
                key={ch.key}
                style={{
                  position: 'relative',
                  padding: '18px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                }}
                className="feedback-card"
              >
                {/* 复制图标：卡片右上角 */}
                <button
                  className={`feedback-copy-btn${copiedKey === ch.key ? ' copied' : ''}`}
                  onClick={() => handleCopy(ch.key, ch.url || '')}
                  title={copiedKey === ch.key ? t('settings.feedbackCopied', '已复制') : t('settings.feedbackCopy', '复制链接')}
                  aria-label={t('settings.feedbackCopy', '复制链接')}
                >
                  {copiedKey === ch.key ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={1.8} />}
                </button>

                {/* 头部：图标 + 标题 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: ch.bg || ch.bg2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: ch.color || ch.color2,
                  }}>
                    {ch.icon}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>{ch.title}</div>
                </div>

                {/* 描述 */}
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.6, flex: 1 }}>
                  {ch.desc}
                </div>

                {/* 操作按钮：打开（内嵌/弹窗）/ 在浏览器打开 */}
                {ch.url && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                    <button
                      className="action-btn primary"
                      onClick={() => ch.key === 'wechat' ? setShowWechatQr(true) : handleEmbed(ch)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      {t('settings.feedbackOpen', '打开')}
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleOpenExternal(ch.url!)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <ExternalLink size={14} strokeWidth={1.5} />
                      {t('settings.feedbackOpenExternal', '在浏览器打开')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 微信群二维码弹窗：点击「打开」按钮后显示 */}
          {showWechatQr && WECHAT_GROUP_IMG && (
            <Modal
              title={t('settings.feedbackWechatGroup', '微信群')}
              icon={<MessageCircle size={18} />}
              onClose={() => setShowWechatQr(false)}
              buttons={[
                { label: t('common.close', '关闭'), onClick: () => setShowWechatQr(false), primary: true },
              ]}
              width={360}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <img
                  src={WECHAT_GROUP_IMG}
                  alt={t('settings.feedbackWechatGroup', '微信群')}
                  style={{
                    width: '240px',
                    height: '240px',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    background: '#fff',
                    padding: '8px',
                    border: '1px solid var(--color-border)',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                    const fallback = document.getElementById('wechat-qr-fallback')
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
                <div
                  id="wechat-qr-fallback"
                  style={{
                    display: 'none',
                    width: '240px',
                    height: '120px',
                    border: '1px dashed var(--color-border)',
                    borderRadius: '8px',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: 'var(--color-text-muted)',
                    textAlign: 'center',
                    padding: '12px',
                  }}
                >
                  {t('settings.feedbackWechatGroupImgError', '群二维码加载失败，请稍后重试或通过其他渠道反馈')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {t('settings.feedbackScanWechat', '微信扫码加入群聊')}
                </div>
              </div>
            </Modal>
          )}

          {/* 底部提示 */}
          <div style={{
            marginTop: '20px',
            padding: '12px 14px',
            background: 'var(--color-bg-hover)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
            lineHeight: 1.7,
          }}>
            💡 {t('settings.feedbackIntro', '感谢使用微连！我们非常重视您的反馈。')}
          </div>
        </div>
      )}
    </div>
  )
}

function AboutSettings() {
  const t = useT()
  const [ver, setVer] = useState(''); const [plat, setPlat] = useState('')
  useEffect(() => { window.electronAPI.app.getVersion().then(setVer); window.electronAPI.app.getPlatform().then(setPlat) }, [])
  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}><Info size={20} strokeWidth={1.5} /> {t('settings.about', '关于')}</div>
      <div style={{ padding: '20px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '10px', textAlign: 'center', marginBottom: '20px' }}>
        <img src="./assets/brand/logo.svg" alt={t('app.name', '微连')} width={64} height={64} style={{ display: 'block', margin: '0 auto 8px auto' }} />
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{t('app.name', '微连')}</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{t('app.description', '微信万能 Agent 遥控器')}</div>
        {/* 版本徽章 + Gitee/GitHub Star 徽章 + License 徽章 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
          {/* 版本徽章 */}
          <img
            src={`https://img.shields.io/badge/WLA-V${ver || '1.0.0'}-green`}
            alt="WeChat-Link-Agent"
          />
          {/* Gitee Star 徽章（可点击跳转） */}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.electronAPI.app.openExternal('https://gitee.com/gcd888/wechat-link-agent') }}
            style={{ display: 'inline-flex', textDecoration: 'none' }}
          >
            <img
              src="https://gitee.com/gcd888/wechat-link-agent/badge/star.svg?theme=dark"
              alt="Gitee Stars"
              style={{ cursor: 'pointer' }}
            />
          </a>
          {/* GitHub Star 徽章（可点击跳转） */}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.electronAPI.app.openExternal('https://github.com/gcd888/wechat-link-agent') }}
            style={{ display: 'inline-flex', textDecoration: 'none' }}
          >
            <img
              src="https://img.shields.io/github/stars/gcd888/wechat-link-agent?style=flat&logo=github&label=Stars"
              alt="GitHub Stars"
              style={{ cursor: 'pointer' }}
            />
          </a>
          {/* MIT License 徽章 */}
          <img
            src="https://img.shields.io/badge/LICENSE-MIT-purple"
            alt="MIT License"
          />
        </div>
      </div>
      {/* 版本信息行 — 版本号 + 检查更新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{t('settings.aboutVersion', '版本')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>{ver || t('common.dash', '—')}</span>
          <button
            onClick={() => { /* TODO: 检查更新逻辑，后续实现 */ }}
            style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-primary)' }}
          >
            <RefreshCw size={12} strokeWidth={1.5} />
            {t('settings.aboutCheckUpdate', '检查更新')}
          </button>
        </div>
      </div>
      <InfoRow label={t('settings.aboutPlatform', '平台')} value={plat} />
      <InfoRow label={t('settings.aboutDataDir', '数据目录')} value="~/.wechat-link-agent/" />
      <InfoRow label={t('settings.aboutDatabase', '数据库')} value="SQLite (sql.js)" />
      <InfoRow label={t('settings.aboutUIFramework', 'UI 框架')} value="React + shadcn/ui" />
      {/* 官网链接（可点击跳转外部浏览器） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>{t('settings.aboutWebsite', '官网')}</span>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.electronAPI.app.openExternal('https://wla.bbroot.com') }}
          style={{ color: 'var(--color-primary)', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          wla.bbroot.com
          <ExternalLink size={12} strokeWidth={1.5} />
        </a>
      </div>
    </div>
  )
}

/**
 * 安全设置 — 密码管理
 *
 * 功能:
 *   - 首次设置密码（用于 API Key 加密）
 *   - 输入密码解锁（查看明文 API Key）
 *   - 修改密码
 *   - 信任此设备（使用 safeStorage 缓存派生密钥，重启免输入）
 *   - 清除密码（重置）
 */
function SecuritySettings() {
  const t = useT()
  const [hasMasterPwd, setHasMasterPwd] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [mode, setMode] = useState<'idle' | 'set' | 'unlock' | 'change'>('idle')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [unlockTrustDevice, setUnlockTrustDevice] = useState(false) // 解锁时是否记住密码
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 初始化检查状态
  useEffect(() => {
    refreshStatus()
  }, [])

  const refreshStatus = async () => {
    const has = await window.electronAPI.masterPassword.has()
    const unlocked = await window.electronAPI.masterPassword.isUnlocked()
    setHasMasterPwd(has)
    setIsUnlocked(unlocked)
    if (has && !unlocked) {
      setMode('unlock')
    } else if (!has) {
      setMode('set')
    } else {
      setMode('idle')
    }
  }

  const handleSet = async () => {
    if (!password.trim()) {
      setMessage({ type: 'error', text: t('security.errorEmptyPassword', '请输入密码') })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: t('security.errorPasswordMismatch', '两次输入的密码不一致') })
      return
    }
    const result = await window.electronAPI.masterPassword.set(password, trustDevice)
    if (result) {
      setMessage({ type: 'success', text: t('security.setSuccess', '密码设置成功') })
      setPassword('')
      setConfirmPassword('')
      setTrustDevice(false)
      await refreshStatus()
    } else {
      setMessage({ type: 'error', text: t('security.setFailed', '密码设置失败') })
    }
  }

  const handleUnlock = async () => {
    const result = await window.electronAPI.masterPassword.unlock(password, unlockTrustDevice)
    if (result) {
      setMessage({ type: 'success', text: t('security.unlockSuccess', '解锁成功') })
      setPassword('')
      setUnlockTrustDevice(false)
      await refreshStatus()
    } else {
      setMessage({ type: 'error', text: t('security.unlockFailed', '密码不正确') })
    }
  }

  const handleChange = async () => {
    if (!newPassword().trim()) {
      setMessage({ type: 'error', text: t('security.errorEmptyPassword', '请输入新密码') })
      return
    }
    if (newPassword() !== confirmPassword) {
      setMessage({ type: 'error', text: t('security.errorPasswordMismatch', '两次输入的密码不一致') })
      return
    }
    const result = await window.electronAPI.masterPassword.change(oldPassword, newPassword(), trustDevice)
    if (result.success) {
      setMessage({ type: 'success', text: t('security.changeSuccess', '密码修改成功') })
      setOldPassword('')
      setPassword('')
      setConfirmPassword('')
      setTrustDevice(false)
      setMode('idle')
      await refreshStatus()
    } else {
      setMessage({ type: 'error', text: result.error || t('security.changeFailed', '密码修改失败') })
    }
  }

  // 用 password 变量作为新密码（change 模式下）
  const newPassword = () => password

  const handleClear = async () => {
    if (!confirm(t('security.confirmClear', '确定清除密码？所有已加密的 API Key 将无法解密，需要重新配置。'))) return
    await window.electronAPI.masterPassword.clear()
    setMessage({ type: 'success', text: t('security.clearSuccess', '密码已清除') })
    setPassword('')
    setConfirmPassword('')
    setOldPassword('')
    setTrustDevice(false)
    await refreshStatus()
  }

  const handleLock = async () => {
    await window.electronAPI.masterPassword.lock()
    setMessage({ type: 'success', text: t('security.locked', '已锁定') })
    await refreshStatus()
  }

  // 输入框样式
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg-input)',
    color: 'var(--color-text)',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  // 统一按钮基础样式（自然宽度，靠左对齐）
  const btnBase: React.CSSProperties = {
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  }
  // 主按钮（强调色）
  const btnPrimary: React.CSSProperties = { ...btnBase, border: 'none', background: 'var(--color-primary)', color: '#fff' }
  // 次按钮（描边）
  const btnSecondary: React.CSSProperties = { ...btnBase, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)' }
  // 危险按钮（红色描边）
  const btnDanger: React.CSSProperties = { ...btnBase, border: '1px solid var(--color-error)', background: 'transparent', color: 'var(--color-error)' }

  return (
    <div style={{ padding: '16px', maxWidth: '600px' }}>
      <SettingCard title={t('security.title', '密码')}>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6', marginBottom: '12px' }}>
          {t('security.description', '密码用于加密存储 API Key 等敏感信息。设置后，查看 API Key 需先输入密码解锁。')}
        </div>

        {/* 状态指示器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
          <Lock size={14} strokeWidth={1.5} style={{ color: hasMasterPwd ? (isUnlocked ? 'var(--color-success)' : 'var(--color-text-muted)') : 'var(--color-error)' }} />
          <span>
            {hasMasterPwd
              ? (isUnlocked ? t('security.statusUnlocked', '已解锁') : t('security.statusLocked', '已锁定'))
              : t('security.statusNotSet', '未设置密码')
            }
          </span>
        </div>

        {/* 消息提示 */}
        {message && (
          <div style={{
            padding: '8px 12px',
            marginBottom: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          }}>
            {message.text}
          </div>
        )}

        {/* 首次设置密码 */}
        {mode === 'set' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('security.enterPassword', '输入密码')} style={inputStyle} />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('security.confirmPassword', '确认密码')} style={inputStyle} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
              {t('security.trustDevice', '信任此设备（重启后免输入密码）')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSet} style={btnPrimary}>
                <Save size={14} strokeWidth={1.5} />
                {t('security.setMasterPassword', '保存')}
              </button>
            </div>
          </div>
        )}

        {/* 解锁 */}
        {mode === 'unlock' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('security.enterPassword', '输入密码')} style={inputStyle}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={unlockTrustDevice} onChange={(e) => setUnlockTrustDevice(e.target.checked)} />
              {t('security.trustDevice', '信任此设备（重启后免输入密码）')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleUnlock} style={btnPrimary}>
                <Unlock size={14} strokeWidth={1.5} />
                {t('security.unlock', '解锁')}
              </button>
            </div>
          </div>
        )}

        {/* 已解锁状态 — 操作按钮横排（自然宽度，靠左排列） */}
        {mode === 'idle' && isUnlocked && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleLock} style={btnSecondary}>
              <Lock size={14} strokeWidth={1.5} />
              {t('security.lock', '锁定')}
            </button>
            <button onClick={() => { setMode('change'); setOldPassword(''); setPassword(''); setConfirmPassword(''); setTrustDevice(false); setMessage(null) }} style={btnSecondary}>
              <KeyRound size={14} strokeWidth={1.5} />
              {t('security.changePassword', '修改密码')}
            </button>
            <button onClick={handleClear} style={btnDanger}>
              <Trash2 size={14} strokeWidth={1.5} />
              {t('security.clearMasterPassword', '清除密码')}
            </button>
          </div>
        )}

        {/* 修改密码 */}
        {mode === 'change' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
              placeholder={t('security.oldPassword', '当前密码')} style={inputStyle} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('security.newPassword', '新密码')} style={inputStyle} />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('security.confirmNewPassword', '确认新密码')} style={inputStyle} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
              {t('security.trustDevice', '信任此设备（重启后免输入密码）')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleChange} style={btnPrimary}>
                <KeyRound size={14} strokeWidth={1.5} />
                {t('common.confirm', '确认修改')}
              </button>
              <button onClick={() => { setMode('idle'); setOldPassword(''); setPassword(''); setConfirmPassword(''); setMessage(null) }} style={btnSecondary}>
                <X size={14} strokeWidth={1.5} />
                {t('common.cancel', '取消')}
              </button>
            </div>
          </div>
        )}
      </SettingCard>
    </div>
  )
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: '14px' }}><label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{title}</label>{children}</div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const t = useT()
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}><span style={{ color: 'var(--color-text-secondary)' }}>{label}</span><span>{value || t('common.dash', '—')}</span></div>
}
