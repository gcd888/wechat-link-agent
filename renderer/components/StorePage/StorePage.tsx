/**
 * 商城页面组件（第三栏）
 *
 * 功能:
 *   - 商城商品详情展示（名称、标签、描述、提供方）
 *   - 内嵌 webview 预览商品链接
 *   - 第三方/中转站商品风险提示弹窗（含号令牌确认）
 *   - 官方商品直接访问，无需风险确认
 *
 * 商品数据从 store_items 表读取，通过 IPC 获取。
 */
import { useState, useEffect, useRef } from 'react'
import { RotateCw, Shield, AlertTriangle, Link } from 'lucide-react'
import { useT } from '../../i18n/i18n.js'
import { useUIStore } from '../../stores/ui-store.js'
import { DisclaimerModal, DisclaimerCheckbox } from '../shared/DisclaimerContent.js'

/** 商城商品标签配置：官方(绿) / 第三方(橙) / 中转站(紫)，颜色走 CSS 变量适配深浅主题 */
const TAG_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  '官方': { label: '官方', color: 'var(--color-tag-official, #10b981)', bgColor: 'var(--color-tag-official-bg, rgba(16,185,129,0.15))', icon: <Shield size={10} strokeWidth={2} /> },
  '第三方': { label: '第三方', color: 'var(--color-tag-thirdparty, #f59e0b)', bgColor: 'var(--color-tag-thirdparty-bg, rgba(245,158,11,0.15))', icon: <AlertTriangle size={10} strokeWidth={2} /> },
  '中转站': { label: '中转站', color: 'var(--color-tag-relay, #8b5cf6)', bgColor: 'var(--color-tag-relay-bg, rgba(139,92,246,0.15))', icon: <Link size={10} strokeWidth={2} /> },
}

/** 商城页面主组件 */
export function StorePage() {
  const t = useT()
  const selectedItem = useUIStore((s) => s.selectedItem)
  const [storeItems, setStoreItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const webviewRef = useRef<Electron.WebviewTag>(null)
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  useEffect(() => {
    window.electronAPI.store.list().then((items) => {
      setStoreItems(items)
    }).catch(() => {
      setStoreItems([])
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  const currentItem = selectedItem
    ? storeItems.find((item) => item.name === selectedItem)
    : null

  const tagConfig = (tag: string) => TAG_CONFIG[tag] || { label: tag, color: '#6b7280', bgColor: '#f3f4f6', icon: null }

  // 空状态：未选择
  if (!currentItem) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
        <div style={{ fontSize: '48px', opacity: 0.3 }}>🛒</div>
        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{t('store.selectItem', '请从左侧选择一个商品')}</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', maxWidth: '300px', textAlign: 'center' }}>
          {t('store.selectHint', '选择一个类别展开，点击商品名称即可查看详情')}
        </div>
      </div>
    )
  }

  const tag = tagConfig(currentItem.tag || '官方')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部信息栏 */}
      <div className="chat-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '18px' }}>{currentItem.isPartner ? '🤝' : '🔗'}</span>
          <span className="title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentItem.name}</span>
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
            }}
          >
            {tag.icon}
            {t('store.tag.' + (currentItem.tag || '官方'), tag.label)}
          </span>
          {currentItem.isPartner && (
            <span style={{ padding: '1px 6px', fontSize: '10px', borderRadius: '4px', background: 'var(--color-primary)', color: '#fff', fontWeight: 500 }}>{t('store.partner', '合作')}</span>
          )}
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{currentItem.description}</span>
        </div>
      </div>

      {(currentItem.tag === '第三方' || currentItem.tag === '中转站') && (
        <>
          <div
            style={{
              padding: '8px 16px',
              background: 'var(--color-warning-bg, #fffbeb)',
              borderBottom: '1px solid var(--color-warning-border, #fde68a)',
              fontSize: '12px',
              color: 'var(--color-warning-text, #92400e)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={14} strokeWidth={1.5} />
            <span>
              {currentItem.tag === '第三方'
                ? t('store.risk.bannerThirdParty', '第三方服务')
                : t('store.risk.bannerRelay', '中转站服务')}
              {t('store.risk.bannerHint', '，充值存在风险，请谨慎操作')}
            </span>
          </div>
          <div
            style={{
              padding: '6px 16px',
              background: 'var(--color-warning-bg, #fffbeb)',
              borderBottom: '1px solid var(--color-warning-border, #fde68a)',
              fontSize: '12px',
              flexShrink: 0,
            }}
          >
            <DisclaimerCheckbox
              checked={disclaimerAgreed}
              onChange={setDisclaimerAgreed}
              onShowDisclaimer={() => setShowDisclaimer(true)}
              id="disclaimer-agreed"
            />
          </div>
        </>
      )}

      {/* webview 展示商品网站 */}
      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        <webview
          ref={webviewRef}
          src={currentItem.link}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allowpopups
        />
      </div>

      {/* 底部操作栏 */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-panel)', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', flexShrink: 0 }}>
        <span style={{ color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentItem.link}</span>
        <button
          onClick={() => webviewRef.current?.reload()}
          style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
        >
          <RotateCw size={14} strokeWidth={1.5} style={{ marginRight: '4px' }} />{t('store.reload', '刷新')}
        </button>
        <button
          onClick={() => window.open(currentItem.link, '_blank')}
          style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
        >
          ↗ {t('store.openExternal', '浏览器打开')}
        </button>
      </div>

      {/* 免责声明弹窗 — 使用共享组件，文本和样式统一维护 */}
      {showDisclaimer && (
        <DisclaimerModal
          onClose={() => setShowDisclaimer(false)}
          onAgree={() => { setDisclaimerAgreed(true); setShowDisclaimer(false) }}
        />
      )}
    </div>
  )
}
