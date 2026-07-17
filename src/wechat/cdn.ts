/**
 * CDN 下载 + 解密
 *
 * 支持可选的 cdnBaseUrl 参数。
 */

import { decryptAesEcb } from './crypto.js'
import { CDN_BASE_URL } from './constants.js'
import { logger } from '../logger.js'
import { t } from '../i18n/index.js'

/** 构建 CDN 下载 URL */
export function buildCdnDownloadUrl(encryptedQueryParam: string, cdnBaseUrl = CDN_BASE_URL): string {
  if (!/^[A-Za-z0-9%=&+._~\-/]+$/.test(encryptedQueryParam)) {
    throw new Error(t('bot.wechat.invalidCdnParam', 'CDN 查询参数无效'))
  }
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)} `
}

/** 构建 CDN 上传 URL */
export function buildCdnUploadUrl(params: {
  cdnBaseUrl: string
  uploadParam: string
  filekey: string
}): string {
  return `${params.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)} `
}

/**
 * 解析 AES 密钥，支持两种格式:
 * 1. base64-of-raw-16-bytes: 16 原始字节 base64 编码
 * 2. base64-of-hex-string: 32 字符 hex 字符串再 base64 编码
 */
function parseAesKey(aesKeyBase64: string, label: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64')
  if (decoded.length === 16) {
    return decoded
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex')
  }
  const msg = t('bot.wechat.aesKeyInvalid', '{{label}}: aes_key 解码后必须是 16 字节原始数据或 32 字符 hex 字符串，实际 {{len}} 字节', { label, len: String(decoded.length) })
  logger.error(msg)
  throw new Error(msg)
}

/** 从 CDN 下载加密数据 */
async function fetchCdnBytes(url: string, label: string): Promise<Buffer> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    const cause = (err as NodeJS.ErrnoException).cause ?? (err as NodeJS.ErrnoException).code ?? '(no cause)'
    logger.error(`${label}: 网络请求失败 url=${url} err=${String(err)} cause=${String(cause)}`)
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)')
    throw new Error(t('bot.wechat.cdnDownloadFailed', '{{label}}: CDN 下载失败 {{status}} {{statusText}} body={{body}}', { label, status: String(res.status), statusText: res.statusText, body }))
  }
  return Buffer.from(await res.arrayBuffer())
}

/**
 * 下载 CDN 文件并解密
 * @param encryptedQueryParam - CDN 加密查询参数
 * @param aesKeyBase64 - AES 密钥（base64 编码）
 * @param cdnBaseUrl - CDN 基础 URL（默认从 constants.ts 导入）
 * @param label - 日志标签
 * @param fullUrl - 完整下载 URL（可选，指定后忽略 encryptedQueryParam + cdnBaseUrl 组合）
 * @returns 解密后的 Buffer
 */
export async function downloadAndDecryptBuffer(
  encryptedQueryParam: string,
  aesKeyBase64: string,
  cdnBaseUrl = CDN_BASE_URL,
  label = 'cdn',
  fullUrl?: string,
): Promise<Buffer> {
  const key = parseAesKey(aesKeyBase64, label)
  const url = fullUrl ?? buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl)
  const encrypted = await fetchCdnBytes(url, label)
  const decrypted = decryptAesEcb(encrypted, key)
  logger.info('CDN 下载并解密成功', { size: decrypted.length })
  return decrypted
}

/** 下载 CDN 数据（不解密，返回原始 Buffer） */
export async function downloadPlainCdnBuffer(
  encryptedQueryParam: string,
  cdnBaseUrl = CDN_BASE_URL,
  label = 'cdn',
  fullUrl?: string,
): Promise<Buffer> {
  const url = fullUrl ?? buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl)
  return fetchCdnBytes(url, label)
}

/** 兼容旧版导出名 */
export { downloadAndDecryptBuffer as downloadAndDecrypt }
