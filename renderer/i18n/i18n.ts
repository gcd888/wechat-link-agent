/**
 * i18n 国际化配置
 *
 * 使用 i18next + react-i18next
 * 支持语言: zh-CN / zh-TW / en
 * 语言检测: 浏览器语言偏好 → localStorage → 默认 zh-CN
 *
 * 翻译数据统一维护在 src/i18n/translations.ts（前后端共享）
 */

import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { zhCN, zhTW, en } from '@/i18n/translations'

// 导出 useTranslation 供组件获取语言等额外信息
export { useTranslation }

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    en: { translation: en },
  },
  lng: localStorage.getItem('i18nextLng') || 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n

/**
 * 根据当前语言选择对应的多语言字段值（带回退）
 *
 * - zh-CN → 优先取 zhVal，空则回退 twVal → enVal
 * - zh-TW → 优先取 twVal，空则回退 zhVal → enVal
 * - en    → 优先取 enVal，空则回退 zhVal → twVal
 *
 * 用于从数据库返回的三语字段（如 vendorEn/vendorZh/vendorTw、
 * descriptionEn/descriptionZh/descriptionTw、nameZh/nameTw/nameEn）
 * 中选择当前语言对应的值。
 */
export function pickLangField(
  lang: string,
  zhVal: string | undefined,
  twVal: string | undefined,
  enVal: string | undefined,
): string {
  if (lang === 'zh-TW') return twVal || zhVal || enVal || ''
  if (lang === 'zh-CN') return zhVal || twVal || enVal || ''
  return enVal || zhVal || twVal || ''
}

/**
 * 带默认值的翻译函数（供非 React 场景使用）
 * 用法: $t('nav.chat', '聊天')
 * key 有翻译 → 读翻译；没有 → 显示默认值
 */
export function $t(key: string, fallback: string): string {
  const result = i18n.t(key)
  return result === key ? fallback : result
}

/**
 * React Hook: 带默认值的翻译
 * 用法: const t = useT(); t('nav.chat', '聊天')
 * 比直接用 useTranslation 更安全，新增 key 不会显示空值
 */
export function useT(): (key: string, fallback: string, params?: Record<string, string>) => string {
  const { t } = useTranslation()
  return (key: string, fallback: string, params?: Record<string, string>) => {
    const result = t(key, params)
    // i18next 找不到 key 时会返回 key 本身
    return result === key ? fallback : result
  }
}
