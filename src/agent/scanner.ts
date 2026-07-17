/**
 * Agent 自动发现模块
 *
 * 从数据库 agent_registry 表读取所有受支持 Agent 列表，
 * 扫描 PATH 环境变量自动检测已安装的 CLI 工具。
 *
 * 重要：所有子进程调用均使用异步 exec，避免阻塞 Electron 主进程事件循环。
 * 如果使用 execSync，会导致扫描期间所有 IPC 处理器被阻塞，渲染进程 UI 冻结。
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { logger } from '../logger.js'
import { preferCmdOnWindows } from '../utils/spawn.js'
import type { AgentRegistryEntry, AgentConfig } from './types.js'

/** 异步 exec，不阻塞事件循环 */
const execAsync = promisify(exec)

/**
 * Windows 上从注册表刷新 PATH 环境变量
 * Electron 进程启动时的 PATH 可能是旧的（安装新 CLI 后 PATH 更新未传播到已运行进程）。
 * 通过读取系统级和用户级注册表的 PATH 值，合并后更新 process.env.PATH。
 *
 * 异步实现：使用 promisify(exec) 替代 execSync，避免阻塞事件循环。
 */
async function refreshPathOnWindows(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    // 读取系统级 PATH（HKLM\System\CurrentControlSet\Control\Session Manager\Environment）
    const { stdout: sysPathRaw } = await execAsync(
      'powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'Machine\')"',
      { encoding: 'utf-8', timeout: 5000 }
    )
    // 读取用户级 PATH
    const { stdout: userPathRaw } = await execAsync(
      'powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\', \'User\')"',
      { encoding: 'utf-8', timeout: 5000 }
    )
    // 合并系统级 + 用户级 PATH（系统级在前，确保系统级优先）
    const merged = [sysPathRaw.trim(), userPathRaw.trim()].filter(Boolean).join(';')
    if (merged && merged !== process.env.PATH) {
      process.env.PATH = merged
      logger.debug('PATH refreshed from Windows Registry', { oldLen: process.env.PATH?.length || 0, newLen: merged.length })
    }
  } catch (e) {
    logger.debug('Failed to refresh PATH from Windows Registry', { error: String(e) })
  }
}

/**
 * Windows 上常见的用户级 CLI 安装目录
 * 部分 CLI 工具（如 trae）安装到这些目录但可能不在进程 PATH 中
 */
const WIN_EXTRA_PATHS = [
  join(homedir(), '.local', 'bin'),
  join(homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
  join(homedir(), '.cargo', 'bin'),
]

/**
 * 在常见用户级目录中查找 CLI 命令（Windows 回退搜索）
 * 当 `where` 命令找不到时，检查这些目录中是否存在对应的 .exe/.cmd/.bat 文件
 */
function detectInExtraPaths(command: string): string | null {
  if (process.platform !== 'win32') return null
  const extensions = ['.exe', '.cmd', '.bat', '.ps1']
  for (const dir of WIN_EXTRA_PATHS) {
    for (const ext of extensions) {
      const fullPath = join(dir, command + ext)
      if (existsSync(fullPath)) {
        return fullPath
      }
    }
  }
  return null
}

/**
 * 从数据库获取 Agent 注册表
 * 种子数据存放在 agent_registry 表中，
 * 并额外查询 agent_install_commands 表获取按平台的安装命令。
 */
export async function getRegistry(): Promise<AgentRegistryEntry[]> {
  // 延时 import 避免模块初始化时的循环依赖
  const { getDb } = await import('../database/db.js')
  const db = await getDb()

  // 读取 agent_registry
  const result = db.exec('SELECT * FROM agent_registry ORDER BY sort_order')
  if (!result[0]) return []

  // 读取 agent_install_commands（按平台）
  const cmdResult = db.exec('SELECT agent_command, platform, install_hint, install_command, uninstall_command FROM agent_install_commands ORDER BY agent_command, platform')
  const installMap = new Map<string, Array<{ platform: string; installHint: string; installCommand: string; uninstallCommand: string }>>()
  if (cmdResult[0]) {
    const cmdCol = (name: string, cols: string[], row: any[]) => {
      const idx = cols.indexOf(name)
      return idx >= 0 ? row[idx] : null
    }
    const cmdCols = cmdResult[0].columns
    for (const row of cmdResult[0].values) {
      const agentCmd = String(cmdCol('agent_command', cmdCols, row) || '')
      if (!agentCmd) continue
      if (!installMap.has(agentCmd)) installMap.set(agentCmd, [])
      installMap.get(agentCmd)!.push({
        platform: String(cmdCol('platform', cmdCols, row) || ''),
        installHint: String(cmdCol('install_hint', cmdCols, row) || ''),
        installCommand: String(cmdCol('install_command', cmdCols, row) || ''),
        uninstallCommand: String(cmdCol('uninstall_command', cmdCols, row) || ''),
      })
    }
  }

  return result[0].values.map((row: any[]) => {
    const col = (name: string) => {
      const idx = result[0].columns.indexOf(name)
      return idx >= 0 ? row[idx] : null
    }
    const platformsRaw = String(col('platforms') || '')
    const command = String(col('command') || '')
    return {
      id: Number(col('id')) || undefined,
      command: command,
      name: String(col('name') || ''),
      providerType: (String(col('provider_type') || 'generic')) as any,
      icon: (col('icon') as string) || undefined,
      installCommands: installMap.get(command) || [],
      defaultArgs: (col('default_args') as string) || undefined,
      defaultModel: (col('default_model') as string) || undefined,
      vendorEn: (col('vendor_en') as string) || '',
      vendorZh: (col('vendor_zh') as string) || '',
      vendorTw: (col('vendor_tw') as string) || '',
      flag: (col('flag') as string) || '',
      status: Number(col('status')) || 0,
      platforms: platformsRaw ? platformsRaw.split(',').map((s: string) => s.trim()) : [],
    }
  })
}

/**
 * 检测指定 CLI 命令是否在 PATH 中
 * Windows 上额外从注册表刷新 PATH，并回退搜索常见用户级安装目录
 *
 * 异步实现：使用 promisify(exec) 替代 execSync，避免阻塞事件循环。
 * 注意：refreshPathOnWindows 已移至 scanAll 中统一调用一次，此处不再重复调用。
 */
async function detectOnPath(command: string): Promise<string | null> {
  try {
    const isWin = process.platform === 'win32'
    const cmd = isWin ? `where ${command}` : `which ${command}`
    const { stdout } = await execAsync(cmd, { encoding: 'utf-8', timeout: 3000 })
    const allPaths = stdout.trim().replace(/\r/g, '').split('\n').filter(Boolean)
    if (allPaths.length === 0) return null
    // Windows 上 `where` 可能返回多个路径（如无扩展名脚本 + .cmd），
    // 优先选择 .cmd 文件因为 spawn 可以直接执行
    return preferCmdOnWindows(allPaths)
  } catch {
    // `where`/`which` 找不到时，在 Windows 上回退搜索常见用户级目录
    const extra = detectInExtraPaths(command)
    if (extra) {
      logger.debug('CLI found in extra paths (not in PATH)', { command, path: extra })
      return extra
    }
    return null
  }
}

/**
 * 检测 CLI 工具的版本
 *
 * 异步实现：使用 promisify(exec) 替代 execSync，避免阻塞事件循环。
 */
async function detectVersion(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${command} --version`, {
      encoding: 'utf-8',
      timeout: 3000,
    })
    return stdout.trim().split('\n')[0] || null
  } catch {
    return null
  }
}

/** 单个 CLI 的检测结果 */
interface SingleScanResult {
  entry: AgentRegistryEntry
  path: string | null
  version: string | null
}

/**
 * 并发检测单个 CLI 是否存在
 *
 * 异步实现：detectOnPath 和 detectVersion 均为异步，
 * Promise.all 可真正并发执行，不会阻塞事件循环。
 */
async function detectOne(entry: AgentRegistryEntry): Promise<SingleScanResult> {
  const cmdPath = await detectOnPath(entry.command)
  if (cmdPath) {
    const version = await detectVersion(cmdPath)
    return { entry, path: cmdPath, version }
  }
  return { entry, path: null, version: null }
}

/** 扫描结果缓存 */
let scanCache: { result: ScanResult; timestamp: number } | null = null
const SCAN_CACHE_TTL = 60_000

/** 清除扫描缓存（安装新 CLI 后需要重新扫描时调用） */
export function clearScanCache(): void {
  scanCache = null
}

export interface ScanResult {
  found: Array<{ entry: AgentRegistryEntry; path: string; version: string | null }>
  notFound: AgentRegistryEntry[]
}

/**
 * 并发扫描 PATH 中所有已安装的 AI Agent CLI
 *
 * 异步实现：
 *   1. Windows 上先刷新 PATH（整个扫描只调用一次，而非每个命令都调用）
 *   2. 使用 Promise.all 真正并发检测所有 CLI
 *   3. 所有子进程调用均使用异步 exec，不阻塞事件循环
 */
export async function scanAll(): Promise<ScanResult> {
  if (scanCache && Date.now() - scanCache.timestamp < SCAN_CACHE_TTL) {
    return scanCache.result
  }
  // 缓存过期或被清除，执行全新扫描

  logger.info('Starting concurrent agent scan...')

  // Windows 上先刷新 PATH（整个扫描只调用一次，而非每个命令都调用）
  // 这避免了原来在 detectOnPath 中每个命令都刷新一次的性能问题
  await refreshPathOnWindows()

  const registry = await getRegistry()
  const results = await Promise.all(registry.map(detectOne))

  const found = results
    .filter((r): r is SingleScanResult & { path: string } => r.path !== null)
    .map((r) => ({ entry: r.entry, path: r.path, version: r.version }))

  const notFound = results
    .filter((r) => r.path === null)
    .map((r) => r.entry)

  const result: ScanResult = { found, notFound }

  scanCache = { result, timestamp: Date.now() }

  logger.info('Agent scan completed', { found: found.length, notFound: notFound.length })
  return result
}

/**
 * 将注册表条目转为 Agent 配置
 */
export function entryToConfig(entry: AgentRegistryEntry, path: string): AgentConfig {
  return {
    id: entry.id,  // 来自 registry 的稳定 ID，后续 agents.id 使用此值
    name: entry.name,
    command: entry.command,
    cliPath: path,
    icon: entry.icon || '',
    args: entry.defaultArgs || '',
    cwd: '',
    model: entry.defaultModel || '',
    enabled: true,
    isDefault: false,
    providerType: entry.providerType,
    vendorEn: entry.vendorEn || '',
    vendorZh: entry.vendorZh || '',
    vendorTw: entry.vendorTw || '',
  }
}
