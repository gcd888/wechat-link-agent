/**
 * 后端 i18n 工具模块
 *
 * 提供轻量级 t() 函数，供主进程业务代码使用。
 * 自动从 app_config 表读取语言设置，支持 {{param}} 插值。
 *
 * 与前端 useT() 保持一致的调用方式：t(key, fallback, params?)
 *
 * 用法:
 *   import { t } from '@/i18n'
 *   t('bot.wlc.cleared', '🗑 已清除当前对话历史')
 *   t('bot.errors.unknownCommand', '未知命令 /{{cmd}}。输入 /wlh 查看可用命令。', { cmd: 'xx' })
 *   t('bot.welcome.text', '欢迎使用 v{{version}}', { version: '0.1.0' })
 */

import { zhCN, zhTW, en } from './translations.js'
import { getConfig } from '../database/db.js'

/** 支持的语言 */
export type Lang = 'zh-CN' | 'zh-TW' | 'en'

/**
 * 获取当前语言设置
 * 从 app_config 表的 language 字段读取，默认 zh-CN
 */
export function getLang(): Lang {
  const raw = getConfig('language') || 'zh-CN'
  if (raw === 'en') return 'en'
  if (raw.startsWith('zh-TW')) return 'zh-TW'
  return 'zh-CN'
}

/** 按语言获取翻译数据对象 */
function getTranslations(lang: Lang): Record<string, unknown> {
  // 根據語言返回對應的翻譯資料
  if (lang === 'en') return en
  if (lang === 'zh-TW') return zhTW
  return zhCN
}

/**
 * 按点分 key 路径从对象中取字符串值
 * 如 resolveKey(obj, 'bot.wlc.cleared') → "🗑 已清除当前对话历史"
 */
function resolveKey(obj: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * {{param}} 插值替换
 * 如 interpolate('当前 Agent: {{name}}', { name: 'Claude' }) → "当前 Agent: Claude"
 */
function interpolate(text: string, params?: Record<string, string>): string {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? '')
}

/**
 * 翻译函数（后端核心方法）
 *
 * 与前端 useT() 签名一致：第二个参数为默认中文值，便于代码阅读。
 *
 * @param key      点分翻译 key，如 'bot.wlc.cleared'
 * @param fallback 默认中文值（当翻译表中找不到 key 时使用）
 * @param params   插值参数，如 { version: '0.1.0' }
 * @param lang     可选，手动指定语言（默认从 config 读取）
 * @returns 翻译后的字符串；找不到 key 时使用 fallback，再进行插值
 */
export function t(key: string, fallback: string, params?: Record<string, string>, lang?: Lang): string {
  const resolvedLang = lang || getLang()
  const translations = getTranslations(resolvedLang)

  // 优先按当前语言查找
  const text = resolveKey(translations, key)
  if (text !== undefined) {
    return interpolate(text, params)
  }

  // 回退到中文
  if (resolvedLang !== 'zh-CN') {
    const zhFallback = resolveKey(zhCN, key)
    if (zhFallback !== undefined) {
      return interpolate(zhFallback, params)
    }
  }

  // 最后回退：使用调用方提供的默认值，并做插值
  return interpolate(fallback, params)
}
