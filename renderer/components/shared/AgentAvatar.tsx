import React from 'react'
import { Bot } from 'lucide-react'

/**
 * Agent SVG 图标组件
 *
 * 从数据库/注册表的 icon 字段读取文件名，拼接路径后显示。
 * 兼容 file:// 和 http:// 两种加载方式。
 * 无 icon 或加载失败时 fallback 到 Bot 图标。
 *
 * 深色模式下为图标添加微亮背景衬底，防止深色 SVG 在深色背景中不可见。
 */
/**
 * Agent SVG 图标组件
 *
 * 从数据库/注册表的 icon 字段读取文件名，拼接路径后显示。
 * 兼容 file:// 和 http:// 两种加载方式。
 * 无 icon 或加载失败时 fallback 到 Bot 图标。
 *
 * 深色模式下为图标添加微亮背景衬底，防止深色 SVG 在深色背景中不可见。
 */
export function AgentAvatar({
  icon,                              /** 图标文件名（如 "claude.svg"），为空时显示 fallback */
  isActive,                          /** 是否为当前激活的 Agent（影响 fallback 图标颜色） */
  size = 20,                         /** 图标尺寸（宽高一致，默认 20px） */
}: { icon?: string | null; isActive?: boolean; size?: number }) {
  const src = icon ? `./assets/icons/${icon}` : undefined
  const [showFallback, setShowFallback] = React.useState(false)

  // 容器样式：深色模式下添加背景衬底 + 细边框，提升图标可见度
  const containerStyle: React.CSSProperties = {
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: '4px',
    background: 'var(--color-avatar-bg)',
    border: '1px solid var(--color-avatar-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }

  if (!src || showFallback) {
    return (
      <div style={containerStyle}>
        <Bot size={size} strokeWidth={1.5} style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} />
      </div>
    )
  }
  return (
    <div style={containerStyle}>
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
        onError={() => setShowFallback(true)}
      />
    </div>
  )
}
