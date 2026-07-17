/**
 * 微连 — 业务入口
 *
 * 应用启动时的初始化流程:
 *   1. 初始化数据库（建表 + migration）
 *   2. 加载配置
 *   3. 初始化 Agent 管理器
 *   4. 自动扫描 PATH 中的 CLI 工具
 *   5. 初始化商城种子数据
 *   6. 注册所有 Provider
 *
 * 支持运行模式:
 *   - setup:   扫码绑定微信（TODO: 待实现）
 *   - daemon:  守护进程模式（后台运行）
 *   - (默认):  桌面 GUI 模式（Electron 启动）
 */

import { getDb } from './database/db.js'
import { logger } from './logger.js'

/**
 * 应用初始化
 * 供 Electron main.ts 调用
 */
export async function initialize(): Promise<void> {
  logger.info('Initializing WeChat Link Agent...')

  // 1. 初始化数据库（建表 + 种子数据一步完成）
  await getDb()

  logger.info('Initialization completed')
}

/**
 * 在 Electron 中调用此函数完成初始化
 * 需要在 app.whenReady() 中执行
 */
// initialize().catch((err) => {
//   logger.error('Failed to initialize', { error: String(err) })
//   process.exit(1)
// })
