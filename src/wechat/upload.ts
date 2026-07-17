/**
 * CDN 文件上传
 *
 * 上传流程:
 *   1. 读取文件 → 计算 MD5 → 生成 AES 密钥
 *   2. 调用 getUploadUrl 获取上传 URL
 *   3. AES-128-ECB 加密 → POST 到 CDN
 *   4. 从响应头获取 downloadEncryptedQueryParam
 *
 * CDN_BASE_URL 从 constants.ts 导入；
 * 返回 UploadedFileInfo 结构。
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { encryptAesEcb, aesEcbPaddedSize } from './crypto.js'
import { buildCdnUploadUrl } from './cdn.js'
import { CDN_BASE_URL, MAX_FILE_SIZE, CDN_UPLOAD_MAX_RETRIES, CDN_UPLOAD_TIMEOUT_MS } from './constants.js'
import { WeChatApi } from './api.js'
import { UploadMediaType } from './types.js'
import { logger } from '../logger.js'
import { t } from '../i18n/index.js'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'])

export interface UploadedFileInfo {
  filekey: string
  /** CDN 返回的下载加密参数，填入 ImageItem.media.encrypt_query_param */
  downloadEncryptedQueryParam: string
  /** AES-128-ECB 密钥（hex 编码），转 base64 后填入 CDNMedia.aes_key */
  aeskey: string
  /** 明文文件大小（字节） */
  fileSize: number
  /** 密文文件大小（字节，AES-128-ECB + PKCS7 填充后） */
  fileSizeCiphertext: number
}

/** 判断文件是否为图片 */
export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * 上传加密数据到 CDN（带重试）
 * @param cdnUrl - CDN 上传地址
 * @param plaintext - 待加密的原始数据
 * @param aeskey - AES 密钥（16 字节 Buffer）
 * @param label - 日志标签
 * @returns CDN 返回的下载加密参数（x-encrypted-param）
 */
async function uploadBufferToCdn(
  cdnUrl: string,
  plaintext: Buffer,
  aeskey: Buffer,
  label: string,
): Promise<string> {
  const ciphertext = encryptAesEcb(plaintext, aeskey)
  let lastError: unknown

  for (let attempt = 1; attempt <= CDN_UPLOAD_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CDN_UPLOAD_TIMEOUT_MS)

    try {
      const res = await fetch(cdnUrl, {
        method: 'POST',
        body: new Uint8Array(ciphertext),
        signal: controller.signal,
        headers: { 'Content-Type': 'application/octet-stream' },
      })

      clearTimeout(timer)

      // 4xx 客户端错误：不可重试，直接抛出
      if (res.status >= 400 && res.status < 500) {
        const errMsg = res.headers.get('x-error-message') ?? await res.text().catch(() => '')
        throw new Error(t('bot.wechat.cdnClientError', '{{label}}: CDN 客户端错误 {{status}}: {{msg}}', { label, status: String(res.status), msg: errMsg }))
      }

      // 5xx 服务端错误：可重试
      if (res.status >= 500) {
        const errMsg = res.headers.get('x-error-message') ?? `status ${res.status}`
        logger.warn(`${label}: CDN 服务端错误，正在重试`, { status: res.status, errMsg, attempt })
        lastError = new Error(`${label}: CDN 服务端错误: ${errMsg}`)
        continue
      }

      const param = res.headers.get('x-encrypted-param')
      if (!param) {
        throw new Error(t('bot.wechat.cdnMissingParam', '{{label}}: CDN 响应缺少 x-encrypted-param 头部', { label }))
      }
      return param
    } catch (err) {
      clearTimeout(timer)
      // 客户端错误不重试
      if (err instanceof Error && err.message.includes('客户端错误')) {
        throw err
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(t('bot.wechat.cdnUploadTimeout', '{{label}}: CDN 上传超时', { label }))
      }
      lastError = err
      if (attempt < CDN_UPLOAD_MAX_RETRIES) {
        logger.warn(`${label}: 第 ${attempt} 次上传失败，正在重试`, { error: String(err) })
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label}: CDN 上传在 ${CDN_UPLOAD_MAX_RETRIES} 次重试后仍然失败`)
}

/**
 * 上传文件到微信 CDN
 * @param api - WeChatApi 实例
 * @param toUserId - 接收方用户 ID
 * @param filePath - 本地文件路径
 * @param cdnBaseUrl - CDN 基础 URL（可选，默认从 constants.ts 导入）
 * @returns 上传后的文件信息（UploadedFileInfo）
 */
export async function uploadFileToWeixin(
  api: WeChatApi,
  toUserId: string,
  filePath: string,
  cdnBaseUrl = CDN_BASE_URL,
): Promise<UploadedFileInfo> {
  const stat = statSync(filePath)
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(t('bot.wechat.fileTooLarge', '文件过大 ({{size}}MB)，最大支持 {{max}}MB', { size: (stat.size / 1024 / 1024).toFixed(1), max: String(MAX_FILE_SIZE / 1024 / 1024) }))
  }

  const fileName = basename(filePath)
  const isImage = isImageFile(filePath)
  const mediaType = isImage ? UploadMediaType.IMAGE : UploadMediaType.FILE

  const plaintext = readFileSync(filePath)
  const rawsize = plaintext.length
  const rawfilemd5 = createHash('md5').update(plaintext).digest('hex')
  const filesize = aesEcbPaddedSize(rawsize)
  const filekey = randomBytes(16).toString('hex')
  const aesKey = randomBytes(16)
  const aeskey = aesKey.toString('hex')

  logger.info('正在请求上传 URL', { fileName, rawsize, mediaType, toUserId })

  const uploadResp = await api.getUploadUrl({
    filekey,
    media_type: mediaType,
    to_user_id: toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    no_need_thumb: true,
    aeskey,
  })

  const uploadFullUrl = uploadResp.upload_full_url?.trim()
  const uploadParam = uploadResp.upload_param

  if (!uploadFullUrl && !uploadParam) {
    throw new Error(t('bot.wechat.getUploadUrlNoUrl', 'getUploadUrl 未返回上传 URL: {{resp}}', { resp: JSON.stringify(uploadResp) }))
  }

  // 优先使用服务端返回的完整 URL，否则客户端拼接
  const cdnUrl = uploadFullUrl
    ?? buildCdnUploadUrl({ cdnBaseUrl, uploadParam: uploadParam!, filekey })

  const downloadParam = await uploadBufferToCdn(cdnUrl, plaintext, aesKey, `uploadFileToWeixin[${fileName}]`)

  logger.info('CDN 上传成功', { fileName })

  return {
    filekey,
    downloadEncryptedQueryParam: downloadParam,
    aeskey,
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
  }
}

/** 兼容旧版导出名 */
export { uploadFileToWeixin as uploadFile }
