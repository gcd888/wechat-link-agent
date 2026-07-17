/**
 * 限频暂存队列
 *
 * 当微信消息发送超过 iLink API 限频限制时，
 * 将待发送的消息暂存到队列中，等下一个用户消息带来
 * 新的 context_token（刷新发送限额）后自动补发。
 *
 * 限频暂存队列实现
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { logger } from './logger.js'

/** 暂存队列目录 */
const PENDING_DIR = join(homedir(), '.wechat-link-agent', 'pending-queue')

/** 暂存项 */
export interface PendingItem {
  text: string
  role: 'interstitial' | 'final'
  queuedAt: number
}

/**
 * 加载暂存队列
 */
export function loadPendingQueue(accountId: string): PendingItem[] {
  const path = join(PENDING_DIR, `${accountId}.json`)
  try {
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    logger.warn('Failed to load pending queue', { accountId, error: String(err) })
  }
  return []
}

/**
 * 保存暂存队列
 */
export function savePendingQueue(accountId: string, queue: PendingItem[]): void {
  if (!existsSync(PENDING_DIR)) {
    mkdirSync(PENDING_DIR, { recursive: true })
  }
  const path = join(PENDING_DIR, `${accountId}.json`)
  try {
    writeFileSync(path, JSON.stringify(queue), 'utf-8')
  } catch (err) {
    logger.warn('Failed to save pending queue', { accountId, error: String(err) })
  }
}
