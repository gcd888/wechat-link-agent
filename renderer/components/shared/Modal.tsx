/**
 * 通用弹窗组件
 *
 * 复用 DisclaimerModal 的视觉风格（遮罩 + 居中卡片 + 头部 + 内容 + 底部按钮）。
 * 支持自定义标题、图标、内容、按钮文本，以及内容区域可复制选择。
 *
 * 用法:
 *   {showModal && (
 *     <Modal
 *       title="安装失败"
 *       icon={<AlertCircle size={16} />}
 *       onClose={() => setShowModal(false)}
 *       buttons={[{ label: '关闭', onClick: () => setShowModal(false), primary: true }]}
 *     >
 *       <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{errorMsg}</pre>
 *     </Modal>
 *   )}
 */

import React from 'react'
import { X } from 'lucide-react'
import { useT } from '../../i18n/i18n.js'

/** 按钮配置 */
export interface ModalButton {
  /** 按钮文本 */
  label: string
  /** 点击回调 */
  onClick: () => void
  /** 是否为主按钮（高亮） */
  primary?: boolean
  /** 是否禁用 */
  disabled?: boolean
}

/** Modal 组件属性 */
export interface ModalProps {
  /** 弹窗标题 */
  title: string
  /** 标题前的图标 */
  icon?: React.ReactNode
  /** 关闭回调（点击遮罩或 X 按钮） */
  onClose: () => void
  /** 弹窗内容 */
  children: React.ReactNode
  /** 底部按钮列表（不传则只显示关闭按钮） */
  buttons?: ModalButton[]
  /** 弹窗宽度（默认 480px） */
  width?: number
  /** 是否可复制内容（默认 true） */
  copyable?: boolean
}

/**
 * 通用弹窗组件
 *
 * 全屏遮罩 + 居中卡片，与 DisclaimerModal 风格一致。
 * 内容区域支持文本选择和复制（user-select: text）。
 */
export function Modal({
  title,
  icon,
  onClose,
  children,
  buttons,
  width = 480,
  copyable = true,
}: ModalProps) {
  const t = useT()

  // 默认按钮：只有关闭
  const finalButtons: ModalButton[] = buttons || [
    { label: t('common.close', '关闭'), onClick: onClose, primary: true },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-panel)',
          borderRadius: '12px',
          width: `${width}px`,
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* ── 弹窗头部 ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
            {icon}
            {title}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px' }}
            aria-label={t('common.close', '关闭')}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* ── 弹窗内容（可滚动 + 可选择复制） ── */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            userSelect: copyable ? 'text' : 'none',
            WebkitUserSelect: copyable ? 'text' : 'none',
          }}
        >
          {children}
        </div>

        {/* ── 弹窗底部按钮 ── */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            padding: '16px 20px',
            borderTop: '1px solid var(--color-border)',
            flexShrink: 0,
          }}
        >
          {finalButtons.map((btn, i) => (
            <button
              key={i}
              onClick={btn.onClick}
              disabled={btn.disabled}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: btn.primary ? 'none' : '1px solid var(--color-border)',
                background: btn.primary ? 'var(--color-primary)' : 'transparent',
                color: btn.primary ? '#fff' : 'var(--color-text-secondary)',
                cursor: btn.disabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                opacity: btn.disabled ? 0.5 : 1,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
