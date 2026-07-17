/**
 * 微信账号管理（SQLite 存储）
 *
 * bot_token 使用 safeStorage 透明加密存储，应用启动时自动解密恢复连接。
 */

import { getDb, saveDb } from '../database/db.js'
import { encryptSecret, decryptSecret } from '../crypto/encryption.js'
import { logger } from '../logger.js'
import { DEFAULT_BASE_URL } from './constants.js'

/** 账号数据 */
export interface AccountData {
  botToken: string
  accountId: string
  baseUrl: string
  userId: string
  createdAt: string
}

/**
 * 保存账号到 SQLite
 * bot_token 使用 safeStorage 加密后存储，防止明文落库
 */
export async function saveAccount(data: AccountData): Promise<void> {
  const db = await getDb()
  // 加密 bot_token 后再写入数据库
  const encryptedToken = encryptSecret(data.botToken)
  db.run(
    `INSERT OR REPLACE INTO accounts (id, bot_token, user_id, base_url, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [data.accountId, encryptedToken, data.userId, data.baseUrl, data.createdAt],
  )
  saveDb()
  logger.info('账号已保存', { accountId: data.accountId })
}

/**
 * 按 ID 加载账号
 */
export async function loadAccount(accountId: string): Promise<AccountData | null> {
  const db = await getDb()
  const results = db.exec(
    `SELECT id, bot_token, user_id, base_url, created_at FROM accounts WHERE id = ?`,
    [accountId],
  )
  if (!results[0]?.values.length) return null
  return rowToAccount(results[0].values[0])
}

/**
 * 加载最新绑定的账号（按创建时间排序）
 */
export async function loadLatestAccount(): Promise<AccountData | null> {
  const db = await getDb()
  const results = db.exec(
    `SELECT id, bot_token, user_id, base_url, created_at FROM accounts ORDER BY created_at DESC LIMIT 1`,
  )
  if (!results[0]?.values.length) return null
  return rowToAccount(results[0].values[0])
}

/**
 * 获取所有已绑定账号
 */
export async function loadAllAccounts(): Promise<AccountData[]> {
  const db = await getDb()
  const results = db.exec(
    `SELECT id, bot_token, user_id, base_url, created_at FROM accounts ORDER BY created_at DESC`,
  )
  if (!results[0]) return []
  return results[0].values.map((row: unknown[]) => rowToAccount(row))
}

/**
 * 删除账号
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const db = await getDb()
  db.run('DELETE FROM accounts WHERE id = ?', [accountId])
  saveDb()
  logger.info('账号已删除', { accountId })
}

/**
 * 将数据库行转为 AccountData
 * bot_token 从数据库读出后自动解密（兼容旧明文值）
 */
function rowToAccount(row: unknown[]): AccountData {
  return {
    accountId: String(row[0]),
    // 解密 bot_token
    botToken: decryptSecret(String(row[1])),
    userId: String(row[2] || ''),
    baseUrl: String(row[3] || DEFAULT_BASE_URL),
    createdAt: String(row[4] || ''),
  }
}
