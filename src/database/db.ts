/**
 * 数据库连接管理
 *
 * 基于 sql.js (SQLite WASM) 的嵌入式数据库
 * - 零配置，无需安装数据库服务
 * - 单文件存储 (~/.wechat-link-agent/wla.db)
 * - 通过 export() 持久化到磁盘
 * - 支持备份/恢复（直接复制 .db 文件）
 *
 * 使用方式：
 *   import { getDb } from './database/db.js'
 *   const db = await getDb()
 *   const result = db.exec('SELECT * FROM agents')
 */

import initSqlJs from 'sql.js'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { logger } from '../logger.js'

type SqlJsDatabase = any

/** 数据目录路径 */
export const DATA_DIR = join(homedir(), '.wechat-link-agent')

/** 数据库文件路径 */
export const DB_PATH = join(DATA_DIR, 'wla.db')

/** SQL DDL 文件路径（__dirname 始终指向 dist-electron/，SQL 文件由构建步骤复制至此） */
const SCHEMA_PATH = join(__dirname, 'schema.sql')

/** SQL DML（种子数据）文件路径 */
const SEED_PATH = join(__dirname, 'seed.sql')

// ── 单例 ──────────────────────────────────────────────────────────
let db: SqlJsDatabase | null = null
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

/**
 * 初始化 sql.js WASM 引擎
 * 只需初始化一次，后续 getDb() 直接使用
 */
async function initSqlEngine(): Promise<void> {
  if (SQL) return
  SQL = await initSqlJs({
    // 默认从 node_modules/sql.js/dist/sql-wasm.wasm 加载
  })
  logger.info('SQLite WASM engine initialized')
}

/**
 * 获取数据库实例（单例）
 * 首次调用时自动初始化引擎、创建数据目录、建表
 */
export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db

  await initSqlEngine()

  // 确保数据目录存在
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
    logger.info('Created data directory', { path: DATA_DIR })
  }

  // 加载或创建数据库
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL!.Database(buffer)
    logger.info('Loaded existing database', { path: DB_PATH, size: buffer.length })
  } else {
    db = new SQL!.Database()
    logger.info('Created new database', { path: DB_PATH })
  }

  // 执行建表脚本（含初始数据）
  await runSchema(db)

  return db
}

/**
 * 迁移 agent_commands 表：添加 UNIQUE(agent_command, slash) 约束
 *
 * 问题：旧版 schema.sql 中 agent_commands 表无 UNIQUE 约束，
 * seed.sql 使用 INSERT OR IGNORE 无法防止重复，每次启动都会插入重复行。
 *
 * SQLite 不支持 ALTER TABLE ADD CONSTRAINT，需要通过重建表实现：
 *   1. 创建带 UNIQUE 约束的临时表
 *   2. 复制去重后的数据（每组 agent_command+slash 只保留 id 最小的记录）
 *   3. 删除旧表，重命名临时表
 *   4. 重建索引
 *
 * 此迁移在 DDL 之后、DML 之前执行，确保 seed.sql 的 INSERT OR IGNORE 能正确去重。
 */
function migrateAgentCommands(database: SqlJsDatabase): void {
  try {
    // 从 sqlite_master 获取建表语句，检查是否已有 UNIQUE 约束
    const tableInfo = database.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_commands'"
    )
    const createSql = String(tableInfo[0]?.values?.[0]?.[0] || '')

    // 如果建表语句中已包含 UNIQUE，说明是新数据库或已迁移过，跳过
    if (!createSql || createSql.includes('UNIQUE')) return

    logger.info('Migrating agent_commands table: adding UNIQUE(agent_command, slash) constraint')

    // 1. 创建带 UNIQUE 约束的临时表
    database.run(`
      CREATE TABLE agent_commands_migrate (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_command TEXT NOT NULL,
        slash         TEXT NOT NULL,
        description_en TEXT DEFAULT '',
        description_zh TEXT DEFAULT '',
        description_tw TEXT DEFAULT '',
        source        TEXT DEFAULT 'builtin',
        alias         TEXT DEFAULT '',
        sort_order    INTEGER DEFAULT 0,
        UNIQUE(agent_command, slash)
      )
    `)

    // 2. 复制去重后的数据（按 agent_command + slash 分组，保留 id 最小的记录）
    database.run(`
      INSERT OR IGNORE INTO agent_commands_migrate
        (agent_command, slash, description_en, description_zh, description_tw, source, alias, sort_order)
      SELECT agent_command, slash, description_en, description_zh, description_tw, source, alias, sort_order
      FROM agent_commands
      WHERE id IN (
        SELECT MIN(id) FROM agent_commands GROUP BY agent_command, slash, source
      )
    `)

    // 3. 删除旧表，重命名临时表
    database.run('DROP TABLE agent_commands')
    database.run('ALTER TABLE agent_commands_migrate RENAME TO agent_commands')

    // 4. 重建索引
    database.run('CREATE INDEX IF NOT EXISTS idx_agent_commands_agent ON agent_commands(agent_command)')
    database.run('CREATE INDEX IF NOT EXISTS idx_agent_commands_source ON agent_commands(source)')

    logger.info('agent_commands table migrated successfully')
  } catch (err) {
    // 迁移失败不影响正常启动，seed.sql 中的 DELETE 也能防止进一步重复
    logger.warn('agent_commands migration skipped', { error: String(err) })
  }
}

/**
 * 执行建表脚本（DDL）和种子数据（DML）
 *
 * schema.sql — 表结构
 * seed.sql   — 初始数据（INSERT OR IGNORE 确保重复执行安全）
 * 不做增量迁移，开发阶段每次建表都是完整的最新版本。
 * 例外：agent_commands 表的 UNIQUE 约束需要通过迁移添加（CREATE TABLE IF NOT EXISTS 不会更新已有表）。
 */
async function runSchema(database: SqlJsDatabase): Promise<void> {
  try {
    // DDL
    const ddl = readFileSync(SCHEMA_PATH, 'utf-8')
    database.run(ddl)
    logger.info('Schema DDL executed')

    // 迁移：在 DML 之前为旧版 agent_commands 表添加 UNIQUE 约束并去重
    migrateAgentCommands(database)

    // DML
    const dml = readFileSync(SEED_PATH, 'utf-8')
    database.run(dml)
    logger.info('Seed DML executed')

    database.run("PRAGMA user_version = 1")
  } catch (err) {
    logger.error('Failed to run schema/seed', { error: String(err) })
    throw err
  }
}

/**
 * 持久化数据库到磁盘
 * sql.js 操作在内存中，需要调用 export() 写回文件
 * 建议在每次关键操作后调用
 */
export function saveDb(): void {
  if (!db) return
  const data = db.export()
  writeFileSync(DB_PATH, Buffer.from(data))
}

/**
 * 关闭数据库连接
 * 应用退出前调用，确保数据持久化
 */
export function closeDb(): void {
  if (db) {
    saveDb()
    db.close()
    db = null
    logger.info('Database closed')
  }
}

/**
 * 创建数据库备份
 * 直接复制 .db 文件到备份目录
 * 备份路径: ~/.wechat-link-agent/backups/wla-backup-YYYYMMDD_HHMMSS.db
 */
export async function createBackup(): Promise<string> {
  const { mkdir } = await import('node:fs/promises')
  const backupDir = join(DATA_DIR, 'backups')
  await mkdir(backupDir, { recursive: true })

  const now = new Date()
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
  const backupPath = join(backupDir, `wla-backup-${timestamp}.db`)

  // 先持久化当前状态
  saveDb()

  // 复制文件
  const { copyFile } = await import('node:fs/promises')
  await copyFile(DB_PATH, backupPath)

  logger.info('Database backup created', { path: backupPath })
  return backupPath
}

/**
 * 从备份文件恢复数据库
 * 将备份文件复制回主数据库路径，重新加载
 */
export async function restoreFromBackup(backupPath: string): Promise<void> {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }

  // 关闭当前连接
  if (db) {
    db.close()
    db = null
  }

  // 复制备份到主路径
  const { copyFile } = await import('node:fs/promises')
  await copyFile(backupPath, DB_PATH)

  // 重新初始化
  await getDb()

  logger.info('Database restored from backup', { path: backupPath })
}

/**
 * 获取备份文件列表
 */
export function listBackups(): Array<{ filename: string; path: string; size: number; createdAt: Date }> {
  const backupDir = join(DATA_DIR, 'backups')
  if (!existsSync(backupDir)) return []

  return readdirSync(backupDir)
    .filter((f: string) => f.endsWith('.db'))
    .map((f: string) => {
      const filePath = join(backupDir, f)
      const stat = statSync(filePath)
      return {
        filename: f,
        path: filePath,
        size: stat.size,
        createdAt: stat.birthtime,
      }
    })
    .sort((a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * 获取单个配置值
 * 从 app_config 表读取指定 key 的 value（统一返回字符串，由调用方做类型转换）
 */
export function getConfig(key: string): string | null {
  if (!db) return null
  // 使用预编译语句 + 参数绑定，避免 SQL 注入风险
  const stmt = db.prepare('SELECT value FROM app_config WHERE key = ?')
  const row = stmt.get([key])
  stmt.free()
  if (!row) return null
  return String(row[0])
}

/**
 * 设置单个配置值
 * 写入 app_config 表（INSERT OR REPLACE），并自动持久化到磁盘
 */
export function setConfig(key: string, value: string): void {
  if (!db) return
  // 使用子查询保留已有的 name 字段值，避免 INSERT OR REPLACE 覆盖为默认空串
  // 使用参数化查询，避免 SQL 注入风险
  db.run(
    'INSERT OR REPLACE INTO app_config (key, name, value) VALUES (?, COALESCE((SELECT name FROM app_config WHERE key = ?), ""), ?)',
    [key, key, value]
  )
  saveDb()
}

/**
 * 获取所有配置
 * 返回 key-value 对象，由调用方按需取用
 */
export function getAllConfig(): Record<string, string> {
  if (!db) return {}
  const result = db.exec('SELECT key, value FROM app_config')
  if (!result[0]) return {}
  const config: Record<string, string> = {}
  for (const row of result[0].values) {
    config[String(row[0])] = String(row[1])
  }
  return config
}
