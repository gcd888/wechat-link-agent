/**
 * iLink Bot API 客户端
 *
 * 包含:
 *   - 请求封装（fetch + 超时 + 重试）
 *   - 消息长轮询（getUpdates）
 *   - 消息发送（sendMessage，含限频 + 熔断器）
 *   - 打字指示器（sendTyping）
 *   - 文件上传 URL 获取（getUploadUrl）
 *   - 通知停止/开始（notifyStop/notifyStart）
 *
 * 所有请求携带 iLink-App-Id / iLink-App-ClientVersion 头
 * 所有 POST 请求体包含 base_info
 */

import type {
  GetUpdatesResp,
  SendMessageReq,
  GetUploadUrlResp,
  SendTypingReq,
  GetConfigResp,
  NotifyStopResp,
  NotifyStartResp,
  GetUploadUrlReq,
} from './types.js'
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_LONG_POLL_TIMEOUT_MS,
  DEFAULT_CONFIG_TIMEOUT_MS,
  buildHeaders,
  buildBaseInfo,
} from './constants.js'
import { logger } from '../logger.js'
import { t } from '../i18n/index.js'

export class WeChatApi {
  private readonly token: string
  readonly baseUrl: string
  private readonly nextSendTime = new Map<string, number>()
  private static readonly MIN_SEND_INTERVAL = 2500
  /** 熔断器：触发限频后冷却时间 */
  private static readonly RATE_LIMIT_COOLDOWN_MS = 30_000

  // ── 熔断器 ────────────────────────────────────────────────────────────
  private static readonly CIRCUIT_THRESHOLD = 1
  private static readonly CIRCUIT_WINDOW_MS = 30_000
  private static readonly CIRCUIT_OPEN_MS = 30_000
  private readonly _rateLimitEvents: number[] = []
  private _circuitUntil = 0

  /** ret:-2 + errmsg="unknown error" 是会话过期信号，暂停 10 分钟 */
  private static readonly STALE_SESSION_PAUSE_MS = 10 * 60 * 1000

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    if (baseUrl) {
      try {
        const url = new URL(baseUrl)
        const allowedHosts = ['weixin.qq.com', 'wechat.com']
        const isAllowed = allowedHosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h))
        if (url.protocol !== 'https:' || !isAllowed) {
          logger.warn('不可信的 baseUrl，使用默认值', { baseUrl })
          baseUrl = DEFAULT_BASE_URL
        }
      } catch {
        logger.warn('无效的 baseUrl，使用默认值', { baseUrl })
        baseUrl = DEFAULT_BASE_URL
      }
    }
    this.token = token
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /** 请求头（包含 iLink-App-Id 等公共头 + Authorization） */
  private headers(): Record<string, string> {
    return buildHeaders(this.token)
  }

  private async request<T = Record<string, unknown>>(
    path: string,
    body: unknown,
    timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const url = `${this.baseUrl}/${path}`

    logger.debug('API 请求', { url, body })

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text}`)
      }

      const json = (await res.json()) as T
      logger.debug('API 响应', json)
      return json
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(t('bot.wechat.requestTimeout', '请求 {{url}} 超时 ({{ms}}ms)', { url, ms: String(timeoutMs) }))
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /** 长轮询拉取新消息 */
  async getUpdates(buf?: string): Promise<GetUpdatesResp> {
    return this.request<GetUpdatesResp>(
      'ilink/bot/getupdates',
      { get_updates_buf: buf ?? '', base_info: buildBaseInfo() },
      DEFAULT_LONG_POLL_TIMEOUT_MS,
    )
  }

  /** 发送消息给用户，包含每用户限频 + 重试 + 熔断器 */
  async sendMessage(req: SendMessageReq): Promise<void> {
    // 熔断器：开启时直接快速失败
    if (this._isCircuitOpen()) {
      const remainingSec = Math.ceil((this._circuitUntil - Date.now()) / 1000)
      logger.warn('发送消息被熔断器拦截', { remainingSec })
      throw new Error(t('bot.wechat.circuitOpen', '熔断器已开启，剩余 {{sec}} 秒', { sec: String(remainingSec) }))
    }

    const userId = req.msg?.to_user_id
    if (userId) {
      const now = Date.now()
      const nextAvailable = (this.nextSendTime.get(userId) ?? 0) + WeChatApi.MIN_SEND_INTERVAL
      const sendAt = Math.max(now, nextAvailable)
      this.nextSendTime.set(userId, sendAt)
      const waitMs = sendAt - now
      if (waitMs > 0) {
        logger.debug('等待限频', { userId, waitMs })
        await new Promise(r => setTimeout(r, waitMs))
      }
    }

    const MAX_RETRIES = 2
    let delay = 3_000
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 每次重试前再检查一次熔断器
      if (this._isCircuitOpen()) {
        const remainingSec = Math.ceil((this._circuitUntil - Date.now()) / 1000)
        logger.warn('重试中被熔断器中断', { attempt, remainingSec })
        throw new Error(t('bot.wechat.circuitOpenRetry', '熔断器在重试期间开启，剩余 {{sec}} 秒', { sec: String(remainingSec) }))
      }

      const res = await this.request<{ ret?: number; errmsg?: string; retmsg?: string }>('ilink/bot/sendmessage', { ...req, base_info: buildBaseInfo() })
      // 兼容 errmsg / retmsg 两种字段名
      const errmsg = res.errmsg ?? res.retmsg ?? ''
      logger.info('发送消息 API 响应', { ret: res.ret, errmsg, userId })

      if (res.ret === -2) {
        // 区分会话过期（ret:-2 + errmsg "unknown error"）和真实限频
        if (errmsg.toLowerCase() === 'unknown error') {
          logger.warn('检测到会话过期 (ret:-2 + unknown error)', { userId })
          if (userId) {
            this.nextSendTime.set(userId, Date.now() + WeChatApi.STALE_SESSION_PAUSE_MS)
          }
          throw new Error(t('bot.wechat.staleSession', '会话过时 — 用户需发送消息刷新 context_token'))
        }

        // 真实限频：触发熔断器
        this._tripCircuit()
        if (userId) {
          this.nextSendTime.set(userId, Date.now() + WeChatApi.RATE_LIMIT_COOLDOWN_MS)
        }
        if (attempt === MAX_RETRIES) {
          logger.warn('发送消息达到最大重试次数，仍在限频', { attempts: MAX_RETRIES })
          throw new Error(t('bot.wechat.sendRetryExhausted', '发送消息在 {{max}} 次重试后仍然限频', { max: String(MAX_RETRIES) }))
        }
        logger.warn('发送消息限频 (ret:-2)，正在重试', { attempt, delayMs: delay })
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay * 2, 15_000)
        continue
      }

      // 检查其他错误码（非 0 且非 undefined）
      if (res.ret !== undefined && res.ret !== 0) {
        logger.error('发送消息 API 返回错误', { ret: res.ret, errmsg, userId })
        throw new Error(t('bot.wechat.sendFailed', '发送消息失败: ret={{ret}}, errmsg={{errmsg}}', { ret: String(res.ret), errmsg: errmsg || 'unknown' }))
      }

      logger.info('消息发送成功', { userId })
      return
    }
  }

  // ── 熔断器辅助方法 ────────────────────────────────────────────────────

  /** 熔断器是否开启 */
  private _isCircuitOpen(): boolean {
    if (this._circuitUntil === 0) return false
    if (Date.now() >= this._circuitUntil) {
      this._circuitUntil = 0
      this._rateLimitEvents.length = 0
      return false
    }
    return true
  }

  /** 记录限频事件，达到阈值后开启熔断器 */
  private _tripCircuit(): void {
    const now = Date.now()
    const windowStart = now - WeChatApi.CIRCUIT_WINDOW_MS
    while (this._rateLimitEvents.length > 0 && this._rateLimitEvents[0] < windowStart) {
      this._rateLimitEvents.shift()
    }
    this._rateLimitEvents.push(now)
    if (this._rateLimitEvents.length >= WeChatApi.CIRCUIT_THRESHOLD) {
      const openUntil = Math.max(this._circuitUntil, now + WeChatApi.CIRCUIT_OPEN_MS)
      if (openUntil > this._circuitUntil) {
        logger.warn('熔断器触发', {
          events: this._rateLimitEvents.length,
          openMs: WeChatApi.CIRCUIT_OPEN_MS,
        })
      }
      this._circuitUntil = openUntil
    }
  }

  /** 获取 Bot 配置（含 typing_ticket） */
  async getConfig(ilinkUserId: string, contextToken?: string): Promise<GetConfigResp> {
    return this.request<GetConfigResp>(
      'ilink/bot/getconfig',
      { ilink_user_id: ilinkUserId, context_token: contextToken, base_info: buildBaseInfo() },
      DEFAULT_CONFIG_TIMEOUT_MS,
    )
  }

  /** 发送打字指示器 */
  async sendTyping(req: SendTypingReq): Promise<void> {
    await this.request('ilink/bot/sendtyping', { ...req, base_info: buildBaseInfo() }, DEFAULT_CONFIG_TIMEOUT_MS)
  }

  /** 获取文件上传 URL */
  async getUploadUrl(req: GetUploadUrlReq): Promise<GetUploadUrlResp> {
    return this.request<GetUploadUrlResp>('ilink/bot/getuploadurl', { ...req, base_info: buildBaseInfo() })
  }

  /** 通知停止 */
  async notifyStop(): Promise<NotifyStopResp> {
    return this.request<NotifyStopResp>('ilink/bot/msg/notifystop', { base_info: buildBaseInfo() })
  }

  /** 通知开始 */
  async notifyStart(): Promise<NotifyStartResp> {
    return this.request<NotifyStartResp>('ilink/bot/msg/notifystart', { base_info: buildBaseInfo() })
  }
}
