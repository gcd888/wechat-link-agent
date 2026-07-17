/**
 * 微信消息监听器
 *
 * 通过长轮询 getUpdates 持续拉取新消息，支持:
 *   - 会话过期检测（errcode:-14）
 *   - 消息去重（message_id）
 *   - 指数退避（失败 3 次后长退避）
 */

import { WeChatApi } from './api.js'
import { loadSyncBuf, saveSyncBuf } from './sync-buf.js'
import { DEFAULT_LONG_POLL_TIMEOUT_MS } from './constants.js'
import { logger } from '../logger.js'
import type { WeixinMessage } from './types.js'

const SESSION_EXPIRED_ERRCODE = -14
const SESSION_EXPIRED_PAUSE_MS = 60 * 60 * 1000 // 1 小时
const BACKOFF_THRESHOLD = 3
const BACKOFF_LONG_MS = 30_000
const BACKOFF_SHORT_MS = 3_000

export interface MonitorCallbacks {
  onMessage: (msg: WeixinMessage) => Promise<void>
  onSessionExpired: () => void
}

/**
 * 创建消息监听器
 * @param api - WeChatApi 实例
 * @param callbacks - 消息回调和会话过期回调
 * @returns { run, stop } — run 启动轮询，stop 停止
 */
export function createMonitor(api: WeChatApi, callbacks: MonitorCallbacks) {
  const controller = new AbortController()
  let stopped = false
  const recentMsgIds = new Set<number>()
  const MAX_MSG_IDS = 1000

  async function run(): Promise<void> {
    let consecutiveFailures = 0
    let nextTimeoutMs = DEFAULT_LONG_POLL_TIMEOUT_MS

    while (!controller.signal.aborted) {
      try {
        const buf = loadSyncBuf()
        logger.debug('正在轮询消息', { hasBuf: buf.length > 0, timeoutMs: nextTimeoutMs })

        const resp = await api.getUpdates(buf || undefined)

        // 服务端建议的下一次长轮询超时时间
        if (resp.longpolling_timeout_ms != null && resp.longpolling_timeout_ms > 0) {
          nextTimeoutMs = resp.longpolling_timeout_ms
          logger.debug('更新下一次轮询超时', { nextTimeoutMs })
        }

        // 检查会话过期（errcode 或 ret 等于 -14）
        const isSessionExpired =
          resp.errcode === SESSION_EXPIRED_ERRCODE ||
          resp.ret === SESSION_EXPIRED_ERRCODE
        if (isSessionExpired) {
          logger.warn('会话已过期，暂停 1 小时')
          callbacks.onSessionExpired()
          await sleep(SESSION_EXPIRED_PAUSE_MS, controller.signal)
          consecutiveFailures = 0
          continue
        }

        if (resp.ret !== undefined && resp.ret !== 0) {
          logger.warn('getUpdates 返回错误', { ret: resp.ret, retmsg: resp.retmsg })
        }

        // 保存 sync_buf（无论 ret 是否为 0）
        if (resp.get_updates_buf) {
          saveSyncBuf(resp.get_updates_buf)
        }

        // 处理消息（带去重）
        const messages = resp.msgs ?? []
        if (messages.length > 0) {
          logger.info('收到消息', { count: messages.length })
          for (const msg of messages) {
            // 跳过已处理的消息
            if (msg.message_id && recentMsgIds.has(msg.message_id)) {
              continue
            }
            if (msg.message_id) {
              recentMsgIds.add(msg.message_id)
              if (recentMsgIds.size > MAX_MSG_IDS) {
                // 淘汰最旧的一半（Set 按插入顺序迭代）
                const iter = recentMsgIds.values()
                const toDelete: number[] = []
                for (let i = 0; i < MAX_MSG_IDS / 2; i++) {
                  const { value } = iter.next()
                  if (value !== undefined) toDelete.push(value)
                }
                for (const id of toDelete) recentMsgIds.delete(id)
              }
            }
            // 异步处理，不阻塞轮询循环
            callbacks.onMessage(msg).catch((err) => {
              const msg2 = err instanceof Error ? err.message : String(err)
              logger.error('处理消息出错', { error: msg2, messageId: msg.message_id })
            })
          }
        }

        consecutiveFailures = 0
      } catch (err) {
        if (controller.signal.aborted) {
          break
        }

        consecutiveFailures++
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error('监听器错误', { error: errorMsg, consecutiveFailures })

        const backoff = consecutiveFailures >= BACKOFF_THRESHOLD ? BACKOFF_LONG_MS : BACKOFF_SHORT_MS
        logger.info(`等待 ${backoff}ms 后重试`, { consecutiveFailures })
        await sleep(backoff, controller.signal)
      }
    }

    stopped = true
    logger.info('监听器已停止')
  }

  function stop(): void {
    if (!controller.signal.aborted) {
      logger.info('正在停止监听器...')
      controller.abort()
    }
  }

  return { run, stop }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }

    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
