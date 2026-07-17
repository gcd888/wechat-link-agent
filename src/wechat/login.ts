/**
 * 微信扫码登录
 *
 * 关键点:
 *   1. 使用 undici 的 fetch（绕过 Electron 可能的 Chromium 网络栈覆盖）
 *   2. QR 获取: POST + local_token_list + 完整请求头
 *   3. 状态轮询: GET + 公共请求头
 *   4. iLink-App-Id / iLink-App-ClientVersion 等协议常量统一从 constants.ts 引入
 *
 * saveAccount 使用 SQLite 写入。
 */

import type { AccountData } from './accounts.js'
import { saveAccount, loadAllAccounts } from './accounts.js'
import {
  DEFAULT_BASE_URL,
  DEFAULT_ILINK_BOT_TYPE,
  QR_LONG_POLL_TIMEOUT_MS,
  QR_POLL_INTERVAL_MS,
  DEFAULT_API_TIMEOUT_MS,
  buildCommonHeaders,
  buildHeaders,
} from './constants.js'
import { logger } from '../logger.js'
import { t } from '../i18n/index.js'

// 使用 Node.js 内置 undici 的 fetch，绕过 Electron 可能的 Chromium 网络栈
// undici 不在 node_modules 中，是 Node.js 22+ 内置模块，用 createRequire 确保加载
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetch: undiciFetch, Agent: UndiciAgent } = require('undici')

// 记录是否成功加载 undici
logger.info('undici 加载状态', { hasFetch: typeof undiciFetch, hasAgent: typeof UndiciAgent })

/** undici Agent（启用长连接 keep-alive） */
const undiciAgent = new UndiciAgent({
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 120_000,
})

// ── 类型定义 ────────────────────────────────────────────────────────

interface QrCodeResponse {
  qrcode: string
  qrcode_img_content: string
}

interface QrStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'scaned_but_redirect' | 'need_verifycode' | 'verify_code_blocked' | 'binded_redirect'
  bot_token?: string
  ilink_bot_id?: string
  baseurl?: string
  ilink_user_id?: string
  redirect_host?: string
}

// ── 工具函数 ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 获取本地已登录账号的 bot token 列表（最多 10 个） */
async function getLocalBotTokenList(): Promise<string[]> {
  try {
    const accounts = await loadAllAccounts()
    const tokens: string[] = []
    for (let i = 0; i < accounts.length && tokens.length < 10; i++) {
      const token = accounts[i].botToken?.trim()
      if (token) tokens.push(token)
    }
    return tokens
  } catch {
    return []
  }
}

// ── 公共类型 ────────────────────────────────────────────────────────

export type QrScanStatus =
  | { status: 'wait' }
  | { status: 'scaned' }
  | { status: 'expired' }
  | { status: 'regenerated'; qrcodeUrl: string; qrcodeId: string }
  | { status: 'confirmed'; account: AccountData }

export interface WaitForWeixinLoginOptions {
  onStatusChange?: (event: QrScanStatus) => void
  autoRegenerate?: boolean
  maxRegenerate?: number
}

// ── 第一阶段：请求二维码（POST + local_token_list） ──────────────

/**
 * 请求二维码
 *
 * POST 请求 + local_token_list body
 * 使用 undici fetch 绕过 Electron Chromium 网络栈
 */
export async function startWeixinLoginWithQr(): Promise<{ qrcodeUrl: string; qrcodeId: string }> {
  logger.info('正在请求二维码')

  const localTokenList = await getLocalBotTokenList()
  logger.info(`请求二维码: local_token_list count=${localTokenList.length}`)

  const url = `${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_ILINK_BOT_TYPE)}`
  const body = JSON.stringify({ local_token_list: localTokenList })

  logger.debug('POST 请求二维码', { url })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_API_TIMEOUT_MS)
  let res: any
  try {
    res = await undiciFetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body,
      signal: controller.signal,
      dispatcher: undiciAgent,
    } as any)
  } catch (e: any) {
    clearTimeout(timer)
    throw new Error(t('bot.wechat.qrFetchFailed', '获取二维码失败: {{msg}}', { msg: e.message || String(e) }))
  }
  clearTimeout(timer)

  if (!res.ok) {
    throw new Error(t('bot.wechat.qrFetchFailedHttp', '获取二维码失败: HTTP {{status}}', { status: String(res.status) }))
  }

  const rawText = await res.text()
  const data = JSON.parse(rawText) as QrCodeResponse

  if (!data.qrcode || !data.qrcode_img_content) {
    throw new Error(t('bot.wechat.qrMissingFields', '获取二维码失败: 响应缺少必要字段'))
  }

  const qrContentPreview = data.qrcode_img_content.substring(0, 80)
  logger.info('二维码获取成功', { qrcodeId: data.qrcode, qrContentPreview })

  return {
    qrcodeUrl: data.qrcode_img_content,
    qrcodeId: data.qrcode,
  }
}

// ── 轮询二维码状态（GET + 公共请求头） ────────────────────────────

/**
 * 轮询二维码状态
 *
 * GET 请求 + 公共请求头
 * 使用 undici fetch 绕过 Electron Chromium 网络栈
 */
async function pollQRStatus(
  baseUrl: string,
  qrcode: string,
  timeoutMs: number = QR_LONG_POLL_TIMEOUT_MS,
): Promise<QrStatusResponse> {
  const endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`
  const url = `${baseUrl}/${endpoint}`

  const startTime = Date.now()
  logger.debug('长轮询二维码状态', { baseUrl, qrcodeId: qrcode.substring(0, 8) + '***', timeoutMs })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      headers: buildCommonHeaders(),
      signal: controller.signal,
      dispatcher: undiciAgent,
    } as any)
    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const rawText = await res.text()
    const elapsed = Date.now() - startTime
    logger.debug('二维码状态响应', { body: rawText.substring(0, 200), elapsedMs: elapsed })
    return JSON.parse(rawText) as QrStatusResponse
  } catch (err: any) {
    clearTimeout(timer)
    const elapsed = Date.now() - startTime
    if (err.name === 'AbortError') {
      logger.debug(`轮询超时 (${timeoutMs}ms, elapsed=${elapsed}ms)，返回 wait`)
      return { status: 'wait' }
    }
    logger.warn(`轮询网络错误 (elapsed=${elapsed}ms)，将重试: ${String(err)}`)
    return { status: 'wait' }
  }
}

// ── 第二阶段：等待用户扫码确认 ──────────────────────────────────────

export async function waitForWeixinLogin(
  qrcodeId: string,
  options: WaitForWeixinLoginOptions = {},
): Promise<AccountData> {
  const { onStatusChange, autoRegenerate = false, maxRegenerate = 3 } = options
  let currentQrcodeId = qrcodeId
  let regenerateCount = 0
  let currentBaseUrl = DEFAULT_BASE_URL

  logger.info('开始轮询二维码状态')

  while (true) {
    const statusResponse = await pollQRStatus(currentBaseUrl, currentQrcodeId)

    logger.debug('二维码状态', { status: statusResponse.status })

    switch (statusResponse.status) {
      case 'wait':
        onStatusChange?.({ status: 'wait' })
        break

      case 'scaned':
        onStatusChange?.({ status: 'scaned' })
        break

      case 'scaned_but_redirect': {
        onStatusChange?.({ status: 'scaned' })
        if (statusResponse.redirect_host) {
          currentBaseUrl = `https://${statusResponse.redirect_host}`
          logger.info('扫码后收到重定向，切换轮询 host', { newHost: statusResponse.redirect_host })
        } else {
          logger.warn('收到 scaned_but_redirect 但缺少 redirect_host')
        }
        break
      }

      case 'confirmed': {
        if (!statusResponse.bot_token || !statusResponse.ilink_bot_id || !statusResponse.ilink_user_id) {
          throw new Error(t('bot.wechat.qrConfirmedMissingFields', '二维码已确认但响应缺少必要字段'))
        }
        const accountData: AccountData = {
          botToken: statusResponse.bot_token,
          accountId: statusResponse.ilink_bot_id,
          baseUrl: statusResponse.baseurl || DEFAULT_BASE_URL,
          userId: statusResponse.ilink_user_id,
          createdAt: new Date().toISOString(),
        }
        await saveAccount(accountData)
        logger.info('扫码登录成功', { accountId: accountData.accountId })
        onStatusChange?.({ status: 'confirmed', account: accountData })
        return accountData
      }

      case 'expired': {
        onStatusChange?.({ status: 'expired' })
        if (!autoRegenerate) throw new Error(t('bot.wechat.qrExpired', '二维码已过期'))
        if (regenerateCount >= maxRegenerate) {
          throw new Error(t('bot.wechat.qrExpiredMax', '二维码已连续过期 {{max}} 次，请重新发起绑定', { max: String(maxRegenerate) }))
        }
        regenerateCount++
        logger.info('二维码已过期，自动重新生成', { count: regenerateCount, max: maxRegenerate })
        const newQr = await startWeixinLoginWithQr()
        currentQrcodeId = newQr.qrcodeId
        currentBaseUrl = DEFAULT_BASE_URL
        onStatusChange?.({ status: 'regenerated', qrcodeUrl: newQr.qrcodeUrl, qrcodeId: newQr.qrcodeId })
        continue
      }

      case 'binded_redirect': {
        logger.info('收到 binded_redirect，该微信号已绑定过本应用')
        const accounts = await loadAllAccounts()
        if (accounts.length > 0) {
          const account = accounts[0]
          onStatusChange?.({ status: 'confirmed', account })
          return account
        }
        throw new Error(t('bot.wechat.bindedRedirectNoAccount', '服务器返回已绑定，但本地未找到已保存的账号'))
      }

      case 'need_verifycode':
        logger.warn('收到 need_verifycode，当前版本不支持配对码验证流程')
        throw new Error(t('bot.wechat.needVerifyCode', '需要输入配对码验证，当前版本暂不支持此功能，请稍后重试'))

      case 'verify_code_blocked':
        logger.warn('收到 verify_code_blocked，配对码验证被限制')
        throw new Error(t('bot.wechat.verifyCodeBlocked', '配对码验证次数过多，请稍后重试'))

      default:
        logger.warn('未知的二维码状态', { status: statusResponse.status })
        break
    }

    await sleep(QR_POLL_INTERVAL_MS)
  }
}
