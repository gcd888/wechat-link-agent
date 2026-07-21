/**
 * 免责声明共享组件
 *
 * 将免责声明的文本内容和样式统一抽取为独立组件，便于后续维护:
 *   - DisclaimerContent:  纯内容组件（仅免责声明正文），可嵌入任意容器
 *   - DisclaimerModal:    弹窗组件（带遮罩、关闭按钮、可选确认按钮），内部渲染 DisclaimerContent
 *   - DisclaimerCheckbox: 注册登录风格的勾选组件（「我已阅读并同意 免责声明条款内容」）
 *   - DisclaimerLink:     独立的可点击链接（带 FileText 图标）
 *
 * 使用场景:
 *   - StorePage:  勾选框旁的「免责声明」链接点击后弹出
 *   - ListPanel:  点击非官方商品时的风险确认弹窗
 *
 * 修改免责声明文本或样式只需修改本文件，所有引用处自动同步。
 */

import React from 'react'
import { FileText, X } from 'lucide-react'
import { useT } from '../../i18n/i18n.js'

// ─────────────────────────────────────────────────────────────────────────
//  免责声明内容（纯结构化 HTML，可嵌入任意容器）
// ─────────────────────────────────────────────────────────────────────────

/**
 * 免责声明内容组件
 *
 * 仅包含免责声明正文，不含弹窗容器和按钮。
 * 可通过 `compact` 属性控制是否使用紧凑布局（用于嵌入小弹窗）。
 */
export function DisclaimerContent({ compact = false }: { compact?: boolean }) {
  const t = useT()

  return (
    <div style={{ fontSize: compact ? '12.5px' : '13px', lineHeight: 1.8, color: 'var(--color-text)' }}>
      {/* ── 免责声明正文 ── */}
      <div
        style={{
          background: 'var(--color-bg-hover)',
          borderRadius: '8px',
          padding: compact ? '10px' : '14px',
        }}
      >
        <div style={{ fontWeight: 500, marginBottom: '6px', fontSize: compact ? '13px' : '14px' }}>
          {t('store.risk.disclaimerTitle', '免责声明：')}
        </div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: compact ? '12px' : '12.5px' }}>
          {t(
            'store.risk.disclaimerText',
            '我已充分了解并同意，通过本平台访问非官方服务（包括第三方服务和中转站服务）所产生的一切风险由我本人承担。平台仅提供链接展示服务，不对服务内容、质量、安全性及交易结果负责。我承诺不会因使用此类服务而向平台主张任何权利或索赔。',
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  免责声明弹窗（带遮罩 + 内容 + 可选按钮）
// ─────────────────────────────────────────────────────────────────────────

/** DisclaimerModal 组件属性 */
interface DisclaimerModalProps {
  /** 关闭弹窗回调 */
  onClose: () => void
  /** 点击「同意并确认」按钮回调（不传则不显示该按钮） */
  onAgree?: () => void
  /** 同意按钮是否禁用（如倒计时未结束） */
  agreeDisabled?: boolean
  /** 同意按钮自定义文本（默认「我已阅读并同意」） */
  agreeLabel?: string
  /** 弹窗宽度（默认 480px） */
  width?: number
}

/**
 * 免责声明弹窗组件
 *
 * 全屏遮罩 + 居中弹窗，内部渲染 DisclaimerContent。
 * 可选显示「同意并确认」按钮（通过 onAgree 控制）。
 *
 * 用法:
 *   {showModal && (
 *     <DisclaimerModal
 *       onClose={() => setShowModal(false)}
 *       onAgree={() => { setAgreed(true); setShowModal(false) }}
 *     />
 *   )}
 */
export function DisclaimerModal({
  onClose,
  onAgree,
  agreeDisabled = false,
  agreeLabel,
  width = 480,
}: DisclaimerModalProps) {
  const t = useT()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--material-popover)',
          backdropFilter: 'var(--material-popover-blur)',
          WebkitBackdropFilter: 'var(--material-popover-blur)',
          borderRadius: '16px',
          width: `${width}px`,
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-xl)',
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
            <FileText size={16} strokeWidth={1.5} />
            {t('store.risk.disclaimerTitle', '免责声明')}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px' }}
            aria-label={t('common.close', '关闭')}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* ── 弹窗内容（仅免责声明正文，滚动区） ── */}
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          <DisclaimerContent />
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
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {t('common.close', '关闭')}
          </button>
          {onAgree && (
            <button
              onClick={onAgree}
              disabled={agreeDisabled}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: agreeDisabled ? '#d1d5db' : 'var(--color-primary)',
                color: agreeDisabled ? '#9ca3af' : '#fff',
                cursor: agreeDisabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {agreeLabel || t('store.risk.agreeAction', '我已阅读并同意')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  免责声明勾选组件（注册登录风格）
// ─────────────────────────────────────────────────────────────────────────

/** DisclaimerCheckbox 组件属性 */
interface DisclaimerCheckboxProps {
  /** 是否已勾选 */
  checked: boolean
  /** 勾选状态变更回调 */
  onChange: (checked: boolean) => void
  /** 点击「免责声明条款内容」链接的回调（通常是打开弹窗） */
  onShowDisclaimer: () => void
  /** checkbox 的 html id（用于 label 关联） */
  id?: string
}

/**
 * 免责声明勾选组件
 *
 * 参考注册登录页面的「同意条款」样式:
 *   ☑ 我已阅读并同意「免责声明条款内容」
 *
 * 其中「免责声明条款内容」为可点击链接，点击后弹出免责声明弹窗。
 * 整行文字（含链接）均可点击切换勾选状态，链接部分阻止冒泡仅打开弹窗。
 */
export function DisclaimerCheckbox({
  checked,
  onChange,
  onShowDisclaimer,
  id = 'disclaimer-checkbox',
}: DisclaimerCheckboxProps) {
  const t = useT()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '14px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={() => onChange(!checked)}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0, margin: 0 }}
      />
      <label
        htmlFor={id}
        style={{ fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {t('store.risk.agreePrefix', '我已阅读并同意')}
      </label>
      <span
        onClick={(e) => { e.stopPropagation(); onShowDisclaimer() }}
        style={{
          fontSize: '12px',
          color: 'var(--color-primary)',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: '2px',
          fontWeight: 500,
        }}
      >
        {t('store.risk.disclaimerTerms', '《免责声明条款内容》')}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
//  免责声明链接（独立可点击文字 + 图标）
// ─────────────────────────────────────────────────────────────────────────

/** DisclaimerLink 组件属性 */
interface DisclaimerLinkProps {
  /** 点击链接回调（通常是打开弹窗） */
  onClick: () => void
}

/**
 * 免责声明链接组件
 *
 * 渲染为带 FileText 图标的可点击文字链接，
 * 通常放在勾选框旁边，点击后弹出免责声明内容。
 */
export function DisclaimerLink({ onClick }: DisclaimerLinkProps) {
  const t = useT()

  return (
    <span
      onClick={onClick}
      style={{
        color: 'var(--color-primary)',
        cursor: 'pointer',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '2px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontWeight: 500,
      }}
    >
      <FileText size={12} strokeWidth={1.5} />
      {t('store.risk.disclaimerShort', '免责声明')}
    </span>
  )
}
