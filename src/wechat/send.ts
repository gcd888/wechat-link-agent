/**
 * 微信消息发送器
 *
 * 提供:
 *   - sendText: 发送文本消息
 *   - sendFile: 发送文件（自动上传到 CDN）
 *   - startTyping: 打字指示器（带 keepalive）
 * 使用 uploadFileToWeixin 上传文件，类型使用 WeixinMessage。
 */

import { existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { WeChatApi } from './api.js'
import { MessageItemType, MessageType, MessageState, TypingStatus, type MessageItem, type WeixinMessage } from './types.js'
import { CDN_ENCRYPT_TYPE_PACKED } from './constants.js'
import { uploadFileToWeixin } from './upload.js'
import { logger } from '../logger.js'
import { t } from '../i18n/index.js'

const TYPING_KEEPALIVE_MS = 5_000

export function createSender(api: WeChatApi, botAccountId: string) {
  const typingTicketCache = new Map<string, { ticket: string; fetchedAt: number }>()
  const TICKET_TTL = 24 * 60 * 60 * 1000

  /** 生成唯一 client_id（时间戳 + 随机字节，格式: wla:{timestamp}-{8hex}） */
  function generateClientId(): string {
    return `wla:${Date.now()}-${randomBytes(4).toString('hex')}`
  }

  async function getTypingTicket(userId: string, contextToken?: string): Promise<string> {
    const cached = typingTicketCache.get(userId)
    if (cached && Date.now() - cached.fetchedAt < TICKET_TTL) {
      return cached.ticket
    }
    try {
      const resp = await api.getConfig(userId, contextToken)
      if (resp.ret === 0 && resp.typing_ticket) {
        typingTicketCache.set(userId, { ticket: resp.typing_ticket, fetchedAt: Date.now() })
        return resp.typing_ticket
      }
      logger.warn('getConfig 未返回 typing_ticket', { ret: resp.ret })
    } catch (err) {
      logger.warn('getConfig 请求失败', { err: err instanceof Error ? err.message : String(err) })
    }
    return ''
  }

  function startTyping(toUserId: string, contextToken: string): () => void {
    let cancelled = false

    ;(async () => {
      const ticket = await getTypingTicket(toUserId, contextToken)
      if (!ticket || cancelled) return

      try {
        await api.sendTyping({
          ilink_user_id: toUserId,
          typing_ticket: ticket,
          status: TypingStatus.TYPING,
        })
      } catch (err) {
        logger.debug('发送打字指示器失败', { err: err instanceof Error ? err.message : String(err) })
        return
      }

      while (!cancelled) {
        await new Promise(r => setTimeout(r, TYPING_KEEPALIVE_MS))
        if (cancelled) break
        try {
          await api.sendTyping({
            ilink_user_id: toUserId,
            typing_ticket: ticket,
            status: TypingStatus.TYPING,
          })
        } catch {
          break
        }
      }

      if (!ticket) return
      try {
        await api.sendTyping({
          ilink_user_id: toUserId,
          typing_ticket: ticket,
          status: TypingStatus.CANCEL,
        })
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }

  async function sendText(toUserId: string, contextToken: string, text: string): Promise<void> {
    const clientId = generateClientId()

    const items: MessageItem[] = [
      {
        type: MessageItemType.TEXT,
        text_item: { text },
      },
    ]

    const msg: WeixinMessage = {
      from_user_id: botAccountId,
      to_user_id: toUserId,
      client_id: clientId,
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      ...(contextToken ? { context_token: contextToken } : {}),
      item_list: items,
    }

    logger.info('正在发送文本消息', { toUserId, clientId, textLength: text.length })
    await api.sendMessage({ msg })
    logger.info('文本消息发送成功', { toUserId, clientId })
  }

  async function sendFile(toUserId: string, contextToken: string, filePath: string): Promise<void> {
    const resolved = resolve(filePath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || ''))
    if (!existsSync(resolved)) {
      await sendText(toUserId, contextToken, t('bot.wechat.fileNotFound', '文件不存在: {{path}}', { path: resolved }))
      return
    }

    try {
      const uploaded = await uploadFileToWeixin(api, toUserId, resolved)
      const clientId = generateClientId()
      const aesKeyBase64 = Buffer.from(uploaded.aeskey, 'hex').toString('base64')

      const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|ico)$/i.test(resolved)
      let item: MessageItem
      if (isImage) {
        item = {
          type: MessageItemType.IMAGE,
          image_item: {
            media: {
              encrypt_query_param: uploaded.downloadEncryptedQueryParam,
              aes_key: aesKeyBase64,
              encrypt_type: CDN_ENCRYPT_TYPE_PACKED,
            },
            mid_size: uploaded.fileSizeCiphertext,
          },
        }
      } else {
        item = {
          type: MessageItemType.FILE,
          file_item: {
            media: {
              encrypt_query_param: uploaded.downloadEncryptedQueryParam,
              aes_key: aesKeyBase64,
              encrypt_type: CDN_ENCRYPT_TYPE_PACKED,
            },
            file_name: basename(resolved),
            len: String(uploaded.fileSize),
          },
        }
      }

      const msg: WeixinMessage = {
        from_user_id: botAccountId,
        to_user_id: toUserId,
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        ...(contextToken ? { context_token: contextToken } : {}),
        item_list: [item],
      }

      logger.info('正在发送文件消息', { toUserId, clientId, fileName: basename(resolved) })
      await api.sendMessage({ msg })
      logger.info('文件消息发送成功', { toUserId, clientId, fileName: basename(resolved) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('文件发送失败', { filePath: resolved, error: msg })
      if (!msg.includes('rate-limited')) {
        await sendText(toUserId, contextToken, t('bot.wechat.sendFileFailed', '发送文件失败: {{msg}}', { msg }))
      }
      throw err
    }
  }

  return { sendText, startTyping, sendFile }
}
