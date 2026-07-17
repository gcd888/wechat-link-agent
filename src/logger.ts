/**
 * 日志系统
 *
 * 功能:
 * - 每日轮转（按日期分割日志文件）
 * - 敏感信息脱敏（token, password, secret 等）
 * - 保留 30 天日志，自动清理过期
 * - 控制台和文件双输出
 * - 日志级别: error / warn / info / debug
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** 日志存储目录 */
const LOG_DIR = join(homedir(), '.wechat-link-agent', 'logs')
/** 日志保留天数 */
const LOG_RETENTION_DAYS = 30

type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** 需要脱敏的字段名（不区分大小写） */
const SENSITIVE_KEYS = ['token', 'password', 'secret', 'auth', 'authorization', 'key', 'bot_token']

/**
 * 递归脱敏处理
 * 替换敏感字段的值以及字符串中内联的 key=value 形式
 */
function sanitize(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(
      /(token|secret|key|password|bot_token)[=:]\s*['"]?([^\s'"]+)['"]?/gi,
      '$1=***'
    )
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isSensitive = SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))
      result[key] = isSensitive ? '***' : sanitize(value)
    }
    return result
  }
  return obj
}

class Logger {
  private currentDate = ''

  constructor() {
    // 确保日志目录存在
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true })
    }
  }

  /**
   * 写入日志
   * @param level 日志级别
   * @param message 日志消息
   * @param data 附加数据（自动脱敏）
   */
  private write(level: LogLevel, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString()
    const sanitizedData = data ? sanitize(data) : undefined
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${sanitizedData ? ' ' + JSON.stringify(sanitizedData) : ''}\n`

    // 控制台输出（带级别着色简化）
    const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    consoleFn(line.trim())

    // 文件输出
    const today = timestamp.slice(0, 10) // YYYY-MM-DD
    const logPath = join(LOG_DIR, `bridge-${today}.log`)
    try {
      appendFileSync(logPath, line, 'utf-8')
    } catch (err) {
      console.error('Failed to write log file:', logPath, err)
    }
  }

  error(message: string, data?: unknown): void { this.write('error', message, data) }
  warn(message: string, data?: unknown): void { this.write('warn', message, data) }
  info(message: string, data?: unknown): void { this.write('info', message, data) }
  debug(message: string, data?: unknown): void { this.write('debug', message, data) }

  /**
   * 清理超过 30 天的旧日志文件
   * 应用启动时调用
   */
  cleanup(): void {
    try {
      const files = readdirSync(LOG_DIR)
      const now = Date.now()
      const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
      for (const file of files) {
        if (!file.startsWith('bridge-') || !file.endsWith('.log')) continue
        const dateStr = file.slice(7, 17) // bridge-YYYY-MM-DD.log
        const fileDate = new Date(dateStr).getTime()
        if (now - fileDate > maxAge) {
          unlinkSync(join(LOG_DIR, file))
        }
      }
    } catch {
      // 清理失败不影响主流程
    }
  }
}

export const logger = new Logger()
