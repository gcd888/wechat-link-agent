/**
 * WebDAV 云端同步模块
 *
 * 三层架构设计:
 *   1. HTTP 传输层 — 基于 webdav npm 包，封装 PUT/GET/PROPFIND
 *   2. 同步协议层 — manifest.json（含 SHA-256 hash、版本号、设备信息）
 *   3. 自动同步引擎 — 数据库变更触发 debounce 同步
 *
 * 同步内容:
 *   - wla.db — SQLite 数据库文件（完整备份）
 *   - manifest.json — 同步清单
 *
 * 远程目录结构:
 *   {base_url}/{remote_root}/v1/db-v1/{profile}/
 *     manifest.json
 *     wla.db
 */

import { createClient, type WebDAVClient } from 'webdav'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, hostname } from 'node:os'
import { createHash } from 'node:crypto'
import { getDb, saveDb, DB_PATH, DATA_DIR } from '../database/db.js'
// 注：getDb/saveDb/DB_PATH/DATA_DIR 均从 db.ts 导入，saveConfigToDb/loadConfigFromDb 需要使用 getDb/saveDb
import { encryptSecret, decryptSecret } from '../crypto/encryption.js'
import { logger } from '../logger.js'

/** 同步协议版本 */
const PROTOCOL_VERSION = 1
/** 数据库兼容版本 */
const DB_COMPAT_VERSION = 1

/** 同步配置 */
export interface SyncConfig {
  enabled: boolean
  syncType: 'webdav'
  baseUrl: string
  username: string
  password: string
  remoteRoot: string
  profile: string
  autoSync: boolean
  autoSyncInterval: number  // 自动同步间隔（分钟），可选: 5/10/15/30/60
}

/** 远程快照信息 */
export interface RemoteSnapshotInfo {
  deviceName: string
  createdAt: string
  remotePath: string
  artifacts: string[]
  compatible: boolean
  protocolVersion: number
  dbCompatVersion?: number
}

/** 同步状态 */
export interface SyncStatus {
  lastSyncAt: number | null
  lastError: string | null
  isSyncing: boolean
}

class WebDavSync {
  private client: WebDAVClient | null = null
  private config: SyncConfig | null = null
  private isSyncing = false
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null
  private status: SyncStatus = {
    lastSyncAt: null,
    lastError: null,
    isSyncing: false,
  }

  /**
   * 配置 WebDAV 连接（仅内存，不持久化）
   */
  configure(config: SyncConfig): void {
    this.config = config
    this.client = createClient(config.baseUrl, {
      username: config.username,
      password: config.password,
    })
  }

  /**
   * 保存配置到数据库（sync_config 表）
   * 使用 INSERT OR REPLACE 策略，单行记录（id=1）
   * password 使用 safeStorage 加密后存储，防止明文落库
   */
  async saveConfigToDb(config: SyncConfig): Promise<void> {
    const db = await getDb()
    // 加密 WebDAV 密码后再写入数据库
    const encryptedPassword = encryptSecret(config.password)
    db.run(
      `INSERT OR REPLACE INTO sync_config
        (id, sync_type, enabled, base_url, username, password, remote_root, profile, auto_sync, auto_sync_interval, updated_at)
       VALUES
        (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
      [
        config.syncType,
        config.enabled ? 1 : 0,
        config.baseUrl,
        config.username,
        encryptedPassword,
        config.remoteRoot,
        config.profile,
        config.autoSync ? 1 : 0,
        config.autoSyncInterval || 30,
      ],
    )
    saveDb()
    logger.info('WebDAV sync config saved to database', { autoSync: config.autoSync, interval: config.autoSyncInterval })
  }

  /**
   * 从数据库加载配置（sync_config 表）
   * 返回 null 表示尚未配置
   * password 从数据库读出后自动解密
   */
  async loadConfigFromDb(): Promise<SyncConfig | null> {
    const db = await getDb()
    const result = db.exec('SELECT sync_type, enabled, base_url, username, password, remote_root, profile, auto_sync, auto_sync_interval FROM sync_config WHERE id = 1')
    if (!result[0] || !result[0].values[0]) return null

    const row = result[0].values[0]
    const config: SyncConfig = {
      syncType: String(row[0]) as 'webdav',
      enabled: Number(row[1]) === 1,
      baseUrl: String(row[2] || ''),
      username: String(row[3] || ''),
      // 解密 WebDAV 密码
      password: decryptSecret(String(row[4] || '')),
      remoteRoot: String(row[5] || 'wechat-link-agent-sync'),
      profile: String(row[6] || 'default'),
      autoSync: Number(row[7]) === 1,
      autoSyncInterval: Number(row[8]) || 30,
    }
    return config
  }

  /**
   * 获取当前配置（内存中的值）
   */
  getConfig(): SyncConfig | null {
    return this.config
  }

  /**
   * 测试 WebDAV 连接
   */
  async testConnection(): Promise<{ success: boolean; message?: string }> {
    if (!this.client || !this.config) {
      return { success: false, message: '未配置 WebDAV 连接' }
    }
    try {
      await this.client.getDirectoryContents('/')
      return { success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    }
  }

  /**
   * 构建远程路径
   */
  private getRemotePath(): string {
    if (!this.config) throw new Error('WebDAV not configured')
    const root = this.config.remoteRoot || 'wechat-link-agent-sync'
    const profile = this.config.profile || 'default'
    return `/${root}/v${PROTOCOL_VERSION}/db-v${DB_COMPAT_VERSION}/${profile}`
  }

  /**
   * 确保远程目录存在
   */
  private async ensureRemoteDir(): Promise<void> {
    if (!this.client) throw new Error('WebDAV not configured')
    const path = this.getRemotePath()
    try {
      await this.client.createDirectory(path, { recursive: true })
    } catch {
      // 目录可能已存在
    }
  }

  /**
   * 计算文件 SHA-256 哈希
   */
  private computeHash(filePath: string): string {
    const data = readFileSync(filePath)
    return createHash('sha256').update(data).digest('hex')
  }

  /**
   * 构建同步清单
   */
  private buildManifest(): Record<string, unknown> {
    const dbHash = existsSync(DB_PATH) ? this.computeHash(DB_PATH) : ''

    return {
      protocolVersion: PROTOCOL_VERSION,
      dbCompatVersion: DB_COMPAT_VERSION,
      deviceName: hostname(),
      createdAt: new Date().toISOString(),
      artifacts: ['wla.db'],
      hashes: {
        'wla.db': dbHash,
      },
      snapshotId: createHash('sha256')
        .update(`${dbHash}-${Date.now()}`)
        .digest('hex'),
    }
  }

  /**
   * 上传数据库到 WebDAV
   */
  async upload(): Promise<boolean> {
    if (!this.client || !this.config) {
      throw new Error('WebDAV not configured')
    }

    if (this.isSyncing) {
      throw new Error('Sync already in progress')
    }

    this.isSyncing = true
    this.status.isSyncing = true

    try {
      // 先持久化数据库
      saveDb()

      // 确保远程目录存在
      await this.ensureRemoteDir()

      const remotePath = this.getRemotePath()

      // 上传数据库文件
      if (existsSync(DB_PATH)) {
        const dbData = readFileSync(DB_PATH)
        await this.client.putFileContents(`${remotePath}/wla.db`, dbData, {
          overwrite: true,
        })
      }

      // 上传清单
      const manifest = this.buildManifest()
      await this.client.putFileContents(
        `${remotePath}/manifest.json`,
        JSON.stringify(manifest, null, 2),
        { overwrite: true },
      )

      this.status.lastSyncAt = Date.now()
      this.status.lastError = null
      logger.info('WebDAV sync upload completed', {
        path: remotePath,
        snapshotId: manifest.snapshotId,
      })

      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.status.lastError = msg
      logger.error('WebDAV sync upload failed', { error: msg })
      throw err
    } finally {
      this.isSyncing = false
      this.status.isSyncing = false
    }
  }

  /**
   * 从 WebDAV 下载数据库
   */
  async download(): Promise<boolean> {
    if (!this.client || !this.config) {
      throw new Error('WebDAV not configured')
    }

    if (this.isSyncing) {
      throw new Error('Sync already in progress')
    }

    this.isSyncing = true
    this.status.isSyncing = true

    try {
      const remotePath = this.getRemotePath()

      // 下载清单
      let manifest: Record<string, unknown>
      try {
        const manifestData = await this.client.getFileContents(
          `${remotePath}/manifest.json`,
          { format: 'text' },
        )
        manifest = JSON.parse(manifestData as string)
      } catch {
        throw new Error('Remote manifest not found or invalid')
      }

      // 检查兼容性
      if (manifest.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(
          `Protocol version mismatch: remote=${manifest.protocolVersion}, local=${PROTOCOL_VERSION}`,
        )
      }

      // 备份当前数据库
      const backupDir = join(DATA_DIR, 'backups')
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
      const backupPath = join(
        backupDir,
        `sync-download-backup-${Date.now()}.db`,
      )
      if (existsSync(DB_PATH)) {
        writeFileSync(backupPath, readFileSync(DB_PATH))
      }

      // 下载数据库
      const dbData = await this.client.getFileContents(`${remotePath}/wla.db`, {
        format: 'binary',
      })
      writeFileSync(DB_PATH, Buffer.from(dbData as ArrayBuffer))

      this.status.lastSyncAt = Date.now()
      this.status.lastError = null
      logger.info('WebDAV sync download completed', {
        path: remotePath,
        backupPath,
      })

      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.status.lastError = msg
      logger.error('WebDAV sync download failed', { error: msg })
      throw err
    } finally {
      this.isSyncing = false
      this.status.isSyncing = false
    }
  }

  /**
   * 获取远程快照信息
   */
  async fetchRemoteInfo(): Promise<RemoteSnapshotInfo | { empty: true }> {
    if (!this.client || !this.config) {
      throw new Error('WebDAV not configured')
    }

    try {
      const remotePath = this.getRemotePath()
      const manifestData = await this.client.getFileContents(
        `${remotePath}/manifest.json`,
        { format: 'text' },
      )
      const manifest = JSON.parse(manifestData as string)

      return {
        deviceName: manifest.deviceName as string,
        createdAt: manifest.createdAt as string,
        remotePath,
        artifacts: manifest.artifacts as string[],
        compatible: manifest.protocolVersion === PROTOCOL_VERSION,
        protocolVersion: manifest.protocolVersion as number,
        dbCompatVersion: manifest.dbCompatVersion as number,
      }
    } catch {
      return { empty: true }
    }
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return { ...this.status }
  }

  // ── 自动同步定时器 ──────────────────────────────────────────────────

  /**
   * 启动自动同步定时器
   * 根据配置的间隔定时上传数据库到 WebDAV
   * 已在运行时先停止旧定时器，确保只有一个定时器在跑
   */
  startAutoSync(): void {
    this.stopAutoSync()
    if (!this.config || !this.config.autoSync) return
    const intervalMs = (this.config.autoSyncInterval || 30) * 60 * 1000
    logger.info('Auto sync timer started', { intervalMin: this.config.autoSyncInterval })
    this.autoSyncTimer = setInterval(async () => {
      if (this.isSyncing) return // 跳过重叠的同步
      try {
        logger.info('Auto sync triggered')
        await this.upload()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('Auto sync failed', { error: msg })
      }
    }, intervalMs)
    // unref 避免 timer 阻止进程退出
    this.autoSyncTimer.unref?.()
  }

  /**
   * 停止自动同步定时器
   */
  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer)
      this.autoSyncTimer = null
      logger.info('Auto sync timer stopped')
    }
  }

  /**
   * 重新配置并重启定时器（保存配置后调用）
   */
  reconfigure(config: SyncConfig): void {
    this.configure(config)
    if (config.autoSync) {
      this.startAutoSync()
    } else {
      this.stopAutoSync()
    }
  }
}

export const webdavSync = new WebDavSync()
