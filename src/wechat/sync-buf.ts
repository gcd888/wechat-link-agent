/**
 * 消息同步缓冲区管理
 *
 * iLink API 的 getUpdates 接口使用 sync_buf 实现增量拉取。
 * 每次拉取返回新的 get_updates_buf，下次请求需要带上这个 buf。
 * 本模块负责持久化这个 buf 到磁盘（JSON 格式）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { logger } from '../logger.js'

const DATA_DIR = join(homedir(), '.wechat-link-agent')

function getSyncBufFilePath(): string {
  return join(DATA_DIR, 'get_updates_buf')
}

/** 从文件加载 get_updates_buf（JSON 包装格式） */
export function loadGetUpdatesBuf(filePath?: string): string | undefined {
  const path = filePath ?? getSyncBufFilePath()
  try {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8')
      const data = JSON.parse(raw) as { get_updates_buf?: string }
      if (typeof data.get_updates_buf === 'string') {
        return data.get_updates_buf
      }
    }
  } catch {
    // 文件不存在或格式无效
  }
  return undefined
}

/** 保存 get_updates_buf 到文件（JSON 包装格式） */
export function saveGetUpdatesBuf(filePath: string, buf: string): void {
  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(filePath, JSON.stringify({ get_updates_buf: buf }, null, 0), 'utf-8')
  } catch (err) {
    logger.warn('保存 get_updates_buf 失败', { error: err instanceof Error ? err.message : String(err) })
  }
}

/** 加载 sync_buf（兼容旧版无参数调用） */
export function loadSyncBuf(): string {
  return loadGetUpdatesBuf() ?? ''
}

/** 保存 sync_buf（兼容旧版单参数调用） */
export function saveSyncBuf(buf: string): void {
  saveGetUpdatesBuf(getSyncBufFilePath(), buf)
}
