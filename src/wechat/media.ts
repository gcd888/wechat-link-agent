/**
 * 微信媒体处理
 *
 * 临时目录改为 wechat-link-agent。
 */

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import type { MessageItem, ImageItem } from './types.js'
import { MessageItemType } from './types.js'
import { downloadAndDecryptBuffer } from './cdn.js'
import { logger } from '../logger.js'
import { t } from '../i18n/index.js'

/** 通过魔数检测 MIME 类型 */
function detectMimeType(data: Buffer): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data[0] === 0xFF && data[1] === 0xD8) return 'image/jpeg'
  if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif'
  if (data[0] === 0x52 && data[1] === 0x49) return 'image/webp'
  if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp'
  return 'image/jpeg'
}

/**
 * 从 ImageItem 提取 AES 密钥和 encrypt_query_param
 * 支持新版 media 格式，以及旧版 aeskey 回退（hex→base64 转换）
 */
function getImageCdnData(imageItem: ImageItem): { aesKey: string; encryptQueryParam: string } | null {
  if (imageItem.media?.encrypt_query_param && imageItem.media.aes_key) {
    return {
      aesKey: imageItem.media.aes_key,
      encryptQueryParam: imageItem.media.encrypt_query_param,
    }
  }

  // aeskey 以 hex 字符串形式传入时，转换为 base64 传递给 parseAesKey
  if (imageItem.media?.encrypt_query_param && imageItem.aeskey) {
    return {
      aesKey: Buffer.from(imageItem.aeskey, 'hex').toString('base64'),
      encryptQueryParam: imageItem.media.encrypt_query_param,
    }
  }

  logger.warn('图片项没有可用的 CDN 数据', {
    hasAeskey: !!imageItem.aeskey,
    hasMedia: !!imageItem.media,
  })
  return null
}

/**
 * 下载 CDN 图片，解密后返回 base64 data URI
 * 失败返回 null
 */
export async function downloadImage(item: MessageItem): Promise<string | null> {
  const imageItem = item.image_item
  if (!imageItem) {
    return null
  }

  const cdnData = getImageCdnData(imageItem)
  if (!cdnData) {
    return null
  }

  try {
    const decrypted = await downloadAndDecryptBuffer(cdnData.encryptQueryParam, cdnData.aesKey)
    const mimeType = detectMimeType(decrypted)
    const base64 = decrypted.toString('base64')
    const dataUri = `data:${mimeType};base64,${base64}`
    logger.info('图片下载并解密成功', { size: decrypted.length })
    return dataUri
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('图片下载失败', { error: msg })
    return null
  }
}

/** 从消息项提取文本 */
export function extractText(item: MessageItem): string {
  if (item.text_item?.text) return item.text_item.text
  if (item.type === MessageItemType.VOICE) {
    return item.voice_item?.text || t('bot.wechat.voiceUnrecognized', '[用户发送了语音消息，但未能识别内容]')
  }
  if (item.file_item?.file_name) return t('bot.wechat.userSentFile', '[用户发送了文件: {{name}}]', { name: item.file_item.file_name })
  if (item.type === MessageItemType.VIDEO) return t('bot.wechat.userSentVideo', '[用户发送了视频]')
  return ''
}

/** 查找列表中第一个图片项 */
export function extractFirstImageUrl(items?: MessageItem[]): MessageItem | undefined {
  return items?.find((item) => item.type === MessageItemType.IMAGE)
}

/** 查找列表中第一个文件项 */
export function extractFirstFileItem(items?: MessageItem[]): MessageItem | undefined {
  return items?.find((item) => item.type === MessageItemType.FILE)
}

/**
 * 下载 CDN 文件，解密后保存到临时目录
 * 返回本地文件路径，失败返回 null
 */
export async function downloadFile(item: MessageItem): Promise<string | null> {
  const fileItem = item.file_item
  if (!fileItem) return null

  let aesKey: string | undefined
  let encryptQueryParam: string | undefined

  if (fileItem.media?.encrypt_query_param) {
    encryptQueryParam = fileItem.media.encrypt_query_param
    aesKey = fileItem.media.aes_key
  }

  if (!encryptQueryParam || !aesKey) {
    logger.warn('文件项没有可用的 CDN 数据')
    return null
  }

  try {
    const decrypted = await downloadAndDecryptBuffer(encryptQueryParam, aesKey)
    const tmpDir = path.join(os.tmpdir(), 'wechat-link-agent')
    fs.mkdirSync(tmpDir, { recursive: true })
    const fileName = fileItem.file_name || `file-${Date.now()}.bin`
    const filePath = path.join(tmpDir, fileName)
    fs.writeFileSync(filePath, decrypted)
    logger.info('文件下载并保存成功', { path: filePath, size: decrypted.length, name: fileName })
    return filePath
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('文件下载失败', { error: msg })
    return null
  }
}
