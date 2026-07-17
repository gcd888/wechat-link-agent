/**
 * 微信 iLink Bot 协议常量与公共工具函数
 *
 * 集中管理 iLink 协议标识、请求头构建、base_info 构建等，
 * 供 api.ts / login.ts 等模块统一引用，避免重复定义和硬编码。
 */

import type { BaseInfo } from './types.js'

// ── iLink Bot API 基础地址 ──────────────────────────────────────────

/** iLink Bot API 基础地址 */
export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'

/** 微信 CDN 基础地址（文件上传/下载） */
export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'

// ── iLink 应用标识 ──────────────────────────────────────────────────

/** iLink-App-Id：iLink Bot 应用标识 */
export const ILINK_APP_ID = 'bot'

/** iLink 协议版本号（代表 iLink Bot API 协议版本，非应用版本） */
export const ILINK_PROTOCOL_VERSION = '2.4.6'

/** bot_agent 标识（类比 HTTP User-Agent，用于观测/监控，非鉴权） */
export const DEFAULT_BOT_AGENT = 'WechatLinkAgent'

/**
 * iLink-App-ClientVersion: uint32 编码 0x00MMNNPP
 * 高 8 位固定为 0；其余位: major<<16 | minor<<8 | patch
 * 如 "2.4.6" → (2<<16)|(4<<8)|6 = 132102
 */
export function buildClientVersion(version: string): number {
  const parts = version.split('.').map((p) => parseInt(p, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff)
}

/** iLink-App-ClientVersion 数值（预计算） */
export const ILINK_APP_CLIENT_VERSION = buildClientVersion(ILINK_PROTOCOL_VERSION)

// ── 二维码登录常量 ──────────────────────────────────────────────────

/** 二维码登录默认 bot_type */
export const DEFAULT_ILINK_BOT_TYPE = '3'

/** 二维码长轮询超时时间（毫秒） */
export const QR_LONG_POLL_TIMEOUT_MS = 35_000

/** 二维码轮询间隔（毫秒） */
export const QR_POLL_INTERVAL_MS = 1_000

// ── API 请求超时常量 ────────────────────────────────────────────────

/** 长轮询 getUpdates 默认超时 */
export const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000

/** 常规 API 请求默认超时（sendMessage, getUploadUrl 等） */
export const DEFAULT_API_TIMEOUT_MS = 15_000

/** 轻量 API 请求默认超时（getConfig, sendTyping 等） */
export const DEFAULT_CONFIG_TIMEOUT_MS = 10_000

// ── CDN 文件上传常量 ────────────────────────────────────────────────

/** 最大文件大小（25MB） */
export const MAX_FILE_SIZE = 25 * 1024 * 1024

/** CDN 上传最大重试次数 */
export const CDN_UPLOAD_MAX_RETRIES = 3

/** CDN 上传单次超时（毫秒） */
export const CDN_UPLOAD_TIMEOUT_MS = 60_000

/** CDN 媒体加密类型：1=打包缩略图/中图等信息 */
export const CDN_ENCRYPT_TYPE_PACKED = 1

// ── 请求头构建 ──────────────────────────────────────────────────────

/**
 * X-WECHAT-UIN: 随机 uint32 → 十进制字符串 → base64 编码
 * 每次请求生成新值，用于请求标识
 */
export function randomWechatUin(): string {
  const buf = new Uint8Array(4)
  crypto.getRandomValues(buf)
  const uint32 = new DataView(buf.buffer).getUint32(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

/** 公共请求头（GET 请求用，包含 iLink-App-Id 等基础标识） */
export function buildCommonHeaders(): Record<string, string> {
  return {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
  }
}

/**
 * 完整请求头（POST 请求用）
 * 在公共头基础上增加 Content-Type、AuthorizationType、X-WECHAT-UIN
 * @param token - 可选的 Bot Token，传入时添加 Authorization 头
 */
export function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
    ...buildCommonHeaders(),
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }
  return headers
}

/** 构建请求体中的 base_info（每个 API 请求都会携带） */
export function buildBaseInfo(): BaseInfo {
  return {
    channel_version: ILINK_PROTOCOL_VERSION,
    bot_agent: DEFAULT_BOT_AGENT,
  }
}
