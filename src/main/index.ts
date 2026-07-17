/**
 * Electron 主进程入口
 *
 * 负责:
 *   - 窗口创建与管理
 *   - 托盘图标
 *   - IPC 通信注册
 *   - 数据库初始化
 *   - 微信模块启动
 *   - 守护进程模式（关闭窗口后台运行）
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, shell, nativeTheme } from 'electron'
import { join } from 'node:path'
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { logger } from '../logger.js'
import { getDb, closeDb, saveDb, createBackup, listBackups, restoreFromBackup, getConfig, setConfig, getAllConfig } from '../database/db.js'
import { agentManager } from '../agent/manager.js'
import { scanAll, getRegistry } from '../agent/scanner.js'
import { sessionManager } from '../session.js'
import { webdavSync } from '../sync/webdav.js'
import type { SyncConfig } from '../sync/webdav.js'
import type { AgentConfig, AgentMessage } from '../agent/types.js'
import { syncManager } from '../sync.js'
import { initialize } from '../main.js'
import {
  hasMasterPassword, setMasterPassword, unlockWithPassword, tryRestoreFromDeviceTrust,
  isUnlocked, lock, changeMasterPassword, clearMasterPassword,
  encryptApiKey, decryptApiKey,
} from '../crypto/encryption.js'
import {
  getAgentLLMConfig, applyLLMConfigToAgent, updateAgentLLMConfig, applyAllLLMConfigs,
} from '../agent/config-applier.js'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const isQuitting = { value: false }

// ── 创建主窗口 ────────────────────────────────────────────
function createWindow(): BrowserWindow {
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const iconPath = isDev
    ? join(__dirname, '../renderer/public/assets/brand/logo.png')
    : join(__dirname, '../dist/assets/brand/logo.png')
  const winIcon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    title: '微连',
    icon: winIcon,
    show: false,
    autoHideMenuBar: true,
    // 设置窗口背景色，防止启动时白屏闪烁（与深色主题背景一致）
    backgroundColor: '#141414',
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })
  win.setMenuBarVisibility(false)

  // 开发模式加载 dev server，生产模式加载打包文件
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    logger.info('Main window shown')
  })

  // 关闭窗口时隐藏到托盘而不是退出
  win.on('close', (event) => {
    if (getConfig('minimizeToTray') === 'true' && !isQuitting.value) {
      event.preventDefault()
      win.hide()
    }
  })

  return win
}

// ── 创建托盘 ──────────────────────────────────────────────
function createTray(): Tray {
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const iconPath = isDev
    ? join(__dirname, '../renderer/public/assets/brand/logo.png')
    : join(__dirname, '../dist/assets/brand/logo.png')
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  const trayIcon = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { label: '退出', click: () => { isQuitting.value = true; app.quit() } },
  ])

  trayIcon.setToolTip('微连 - WeChat Link Agent')
  trayIcon.setContextMenu(contextMenu)
  trayIcon.on('double-click', () => mainWindow?.show())

  logger.info('Tray created')
  return trayIcon
}

// ── 应用启动 ──────────────────────────────────────────────
app.whenReady().then(async () => {
  logger.info('Application starting...')

  // 清理过期日志文件（保留 30 天）
  logger.cleanup()
  logger.info('Log cleanup completed')

  // 跟随系统主题（渲染进程启动后会根据用户选择同步覆盖）
  nativeTheme.themeSource = 'system'

  await initialize()
  logger.info('Database initialized')

  // 先清空 agents 表 → 扫描 PATH → 插入已发现的 Agent
  // 同步执行：窗口打开前 agent 数据就已就绪
  await agentManager.syncFromScan()
  logger.info('Agent scan and sync completed')

  await agentManager.init()
  logger.info('Agent manager initialized')

  // 应用启动时尝试从设备信任缓存恢复密码（若用户之前勾选了「信任此设备」）
  tryRestoreFromDeviceTrust()

  registerIpcHandlers()

  mainWindow = createWindow()
  tray = createTray()

  // 设置 syncManager 的主窗口引用
  syncManager.setMainWindow(mainWindow)

  // 尝试从已保存的账号恢复微信连接
  const restored = await syncManager.restoreFromSavedAccount()
  if (restored) {
    logger.info('WeChat connection restored')
  }

// 尝试从数据库恢复 WebDAV 同步配置（使重启后配置不丢失）
try {
const savedConfig = await webdavSync.loadConfigFromDb()
if (savedConfig) {
webdavSync.reconfigure(savedConfig)
logger.info('WebDAV sync config restored from database', { autoSync: savedConfig.autoSync, interval: savedConfig.autoSyncInterval })
}
} catch (err) {
    logger.error('Failed to restore WebDAV config', { error: err instanceof Error ? err.message : String(err) })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

// ── 应用退出 ──────────────────────────────────────────────
app.on('before-quit', async () => {
  await syncManager.disconnect()
  closeDb()
  logger.info('Application quitting')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/** 清理提权执行过程中产生的临时文件 */
function cleanupTempFiles(...files: string[]): void {
  for (const f of files) {
    try { unlinkSync(f) } catch { /* 文件不存在或已被删除，忽略 */ }
  }
}

// ── IPC 处理器注册 ───────────────────────────────────────
function registerIpcHandlers(): void {
  // ── Agent 管理 ──
  ipcMain.handle('agent:list', () => agentManager.list())
  ipcMain.handle('agent:getCurrent', () => agentManager.getCurrent())
  ipcMain.handle('agent:add', async (_event, config: AgentConfig) => agentManager.add(config))
  ipcMain.handle('agent:remove', async (_event, id: number) => agentManager.remove(id))
  ipcMain.handle('agent:update', async (_event, id: number, updates: Partial<AgentConfig>) => agentManager.update(id, updates))
  ipcMain.handle('agent:switch', async (_event, name: string) => agentManager.switchTo(name))
  ipcMain.handle('agent:scan', async () => scanAll())
  ipcMain.handle('agent:rescan', async () => {
    await agentManager.syncFromScan()
    return agentManager.list()
  })
  ipcMain.handle('agent:getRegistry', () => getRegistry())

  // 获取 Agent 运行时状态（当前 Agent + 所有 Agent 状态汇总）
  ipcMain.handle('agent:getStatus', () => agentManager.getStatus())

  // 注册状态变更回调：当 Agent 状态变化时推送到渲染进程
  agentManager.onStatusChange((agentId, agentName, status) => {
    mainWindow?.webContents.send('agent:statusChange', { agentId, agentName, status })
  })

  // ── 消息 ──
  ipcMain.handle('message:send', async (_event, text: string, sessionId?: number, files?: Array<{ path: string; name: string }>) => {
    const current = agentManager.getCurrent()
    if (!current || !current.id) {
      logger.warn('Message send failed: no agent selected')
      return { success: false, error: 'No agent selected' }
    }
    logger.info('Message send started', { agent: current.name, agentId: current.id, sessionId, textLength: text.length, hasFiles: !!files?.length })
    // 优先使用传入的 sessionId；否则使用管理器中的当前会话 ID
    let session
    const currentSessionId = sessionId || agentManager.getCurrentSessionId()
    if (currentSessionId) {
      // 使用已选定的会话
      const sessions = await sessionManager.getSessions(current.id)
      session = sessions.find(s => s.id === currentSessionId)
    }
    if (!session) {
      session = await sessionManager.getOrCreateSession(current.id, current.name)
      agentManager.setCurrentSessionId(session.id)
    }
    // 防御性检查：确保 session.id 有效
    if (!session || !session.id) {
      logger.error('Invalid session after getOrCreateSession', { agentId: current.id, sessionId: session?.id })
      session = await sessionManager.createSession(current.id, current.name)
      agentManager.setCurrentSessionId(session.id)
    }
    await sessionManager.addMessage(session.id, current.name, 'user', text, 'desktop')
    // 首次发送消息后自动更新会话标题
    await sessionManager.autoUpdateTitle(session.id)

    try {
      let fullReply = ''
      let errorMsg = ''
      // 会话级 cwd 优先，否则 fallback 到系统默认
      const effectiveCwd = session.cwd || agentManager.getEffectiveCwd(current.cwd)
      logger.info('Invoking agent send', { agent: current.name, providerType: current.providerType, cwd: effectiveCwd, sdkSessionId: session.sdkSessionId, model: current.model })
      for await (const output of agentManager.send({
        prompt: text,
        cwd: effectiveCwd,
        sessionId: session.sdkSessionId,
        model: current.model,
        files,
      })) {
        if (output.type === 'text') {
          fullReply += output.delta
          mainWindow?.webContents.send('message:agentOutput', {
            content: output.delta, type: 'delta', sessionId: session.id, agentName: current.name,
          })
        } else if (output.type === 'error') {
          // 捕获 CLI 返回的错误信息（如初始化失败、认证错误等）
          errorMsg = output.message
          logger.error('Agent output error', { agent: current.name, error: errorMsg })
        } else if (output.type === 'done') {
          fullReply = output.fullText
          if (output.sessionId) {
            logger.info('Updating SDK session ID', { sessionId: session.id, sdkSessionId: output.sessionId })
            await sessionManager.updateSdkSessionId(session.id, output.sessionId)
          }
        }
      }
      logger.info('Agent send completed', { agent: current.name, replyLength: fullReply.length, hasError: !!errorMsg })
      // 优先返回错误信息，其次返回正常回复
      if (errorMsg && !fullReply) {
        return { success: false, error: errorMsg }
      }
      if (fullReply) {
        await sessionManager.addMessage(session.id, current.name, 'assistant', fullReply, 'desktop')
      }
      return { success: true, content: fullReply, sessionId: session.id }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })

  // 获取聊天历史（支持按 agentName 或 sessionId 加载）
  ipcMain.handle('message:getHistory', async (_event, agentName: string, limit?: number, sessionId?: number) => {
    // 如果指定了 sessionId，直接按会话 ID 加载
    if (sessionId) {
      return await sessionManager.getMessages(sessionId, limit)
    }
    // 否则按 Agent 加载最新会话的消息（向后兼容）
    const agent = agentManager.getByName(agentName)
    if (!agent?.id) return []
    const sessions = await sessionManager.getSessions(agent.id)
    if (sessions.length === 0) return []
    return await sessionManager.getMessages(sessions[0].id, limit)
  })

  // 清空会话消息（支持按 agentName 或 sessionId 清空）
  ipcMain.handle('message:clear', async (_event, agentName: string, sessionId?: number) => {
    // 如果指定了 sessionId，直接清空该会话
    if (sessionId) {
      await sessionManager.clearMessages(sessionId)
      return true
    }
    // 否则清空 Agent 的最新会话（向后兼容）
    const agent = agentManager.getByName(agentName)
    if (!agent?.id) return false
    const sessions = await sessionManager.getSessions(agent.id)
    if (sessions.length > 0) {
      await sessionManager.clearMessages(sessions[0].id)
    }
    return true
  })

  ipcMain.handle('message:getChatAgents', async () => {
    // 获取有聊天记录的 Agent（至少有一条消息）
    return agentManager.listWithChats()
  })

  // 删除 Agent 的所有聊天记录（所有会话 + 消息）
  ipcMain.handle('message:deleteAgentChats', async (_event, agentId: number) => {
    const sessions = await sessionManager.getSessions(agentId)
    for (const session of sessions) {
      await sessionManager.deleteSession(session.id)
    }
    return true
  })

  // 导出会话消息为 Markdown 文件
  ipcMain.handle('message:exportSession', async (_event, sessionId: number) => {
    // 获取会话消息（不限制数量）
    const messages = await sessionManager.getMessages(sessionId, 10000)
    if (messages.length === 0) return { success: false, error: '该会话没有消息可导出' }

    // 获取会话标题（直接查 DB）
    const db = await getDb()
    const sessionResult = db.exec('SELECT id, title FROM sessions WHERE id = ?', [sessionId])
    const sessionTitle = sessionResult[0]?.values[0]?.[1] || `session-${sessionId}`

    // 构建 Markdown 内容
    let markdown = `# ${sessionTitle}\n\n`
    markdown += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n`
    markdown += `> 消息数量: ${messages.length}\n\n---\n\n`

    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleString('zh-CN')
      if (msg.role === 'user') {
        markdown += `## 🧑 用户\n\n${msg.content}\n\n`
      } else if (msg.role === 'assistant') {
        markdown += `## 🤖 Agent\n\n${msg.content}\n\n`
      } else {
        markdown += `## 📢 系统\n\n${msg.content}\n\n`
      }
      markdown += `*${time}${msg.source === 'wechat' ? ' · 微信' : ''}*\n\n---\n\n`
    }

    // 弹出保存对话框
    const safeTitle = sessionTitle.replace(/[<>:"/\\|?*]/g, '_')
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出对话为 Markdown',
      defaultPath: `${safeTitle}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '用户取消了导出' }
    }

    try {
      writeFileSync(result.filePath, markdown, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (e: any) {
      return { success: false, error: e.message || String(e) }
    }
  })

  // 导出 Agent 的所有会话消息为 Markdown 文件
  ipcMain.handle('message:exportAgentChats', async (_event, agentId: number, agentName: string) => {
    const sessions = await sessionManager.getSessions(agentId)
    if (sessions.length === 0) return { success: false, error: '该 Agent 没有聊天记录可导出' }

    // 合并所有会话的消息到一个 Markdown
    let markdown = `# ${agentName} 对话记录\n\n`
    markdown += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n`
    markdown += `> 会话数量: ${sessions.length}\n\n---\n\n`

    let totalMessages = 0
    for (const session of sessions) {
      const messages = await sessionManager.getMessages(session.id, 10000)
      if (messages.length === 0) continue
      totalMessages += messages.length

      markdown += `# 📁 ${session.title || `会话 ${session.id}`}\n\n`
      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleString('zh-CN')
        if (msg.role === 'user') {
          markdown += `## 🧑 用户\n\n${msg.content}\n\n`
        } else if (msg.role === 'assistant') {
          markdown += `## 🤖 Agent\n\n${msg.content}\n\n`
        } else {
          markdown += `## 📢 系统\n\n${msg.content}\n\n`
        }
        markdown += `*${time}${msg.source === 'wechat' ? ' · 微信' : ''}*\n\n---\n\n`
      }
    }

    if (totalMessages === 0) return { success: false, error: '该 Agent 没有消息可导出' }

    markdown = markdown.replace(`> 会话数量: ${sessions.length}\n`, `> 会话数量: ${sessions.length}\n> 消息总数: ${totalMessages}\n`)

    // 弹出保存对话框
    const safeName = agentName.replace(/[<>:"/\\|?*]/g, '_')
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出对话为 Markdown',
      defaultPath: `${safeName}-对话记录.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '用户取消了导出' }
    }

    try {
      writeFileSync(result.filePath, markdown, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (e: any) {
      return { success: false, error: e.message || String(e) }
    }
  })

  // ── 会话管理 ──
  // 获取 Agent 的所有会话（带预览信息）
  ipcMain.handle('session:list', async (_event, agentId: number) => {
    return sessionManager.getSessionsWithPreview(agentId)
  })

  // 创建新会话
  ipcMain.handle('session:create', async (_event, agentId: number, title?: string) => {
    const current = agentManager.getCurrent()
    const agentName = current?.name || ''
    const session = await sessionManager.createSession(agentId, agentName, title)
    agentManager.setCurrentSessionId(session.id)
    return session
  })

  // 删除会话（消息自动级联删除）
  ipcMain.handle('session:delete', async (_event, sessionId: number) => {
    await sessionManager.deleteSession(sessionId)
    // 如果删除的是当前会话，重置当前会话 ID
    if (agentManager.getCurrentSessionId() === sessionId) {
      agentManager.setCurrentSessionId(null)
    }
    return true
  })

  // 重命名会话
  ipcMain.handle('session:rename', async (_event, sessionId: number, title: string) => {
    await sessionManager.renameSession(sessionId, title)
    return true
  })

  // 切换当前会话
  ipcMain.handle('session:switch', async (_event, sessionId: number) => {
    agentManager.setCurrentSessionId(sessionId)
    return true
  })

  // 按 sessionId 加载消息
  ipcMain.handle('session:getMessages', async (_event, sessionId: number, limit?: number) => {
    return sessionManager.getMessages(sessionId, limit)
  })

  // 更新会话工作目录
  ipcMain.handle('session:updateCwd', async (_event, sessionId: number, cwd: string) => {
    await sessionManager.updateSessionCwd(sessionId, cwd)
    return true
  })

  // ── ClawBot（微信对话视图） ──
  ipcMain.handle('message:getClawBotHistory', async () => {
    return sessionManager.getWeChatMessages(200)
  })

  ipcMain.handle('message:sendClawBot', async (_event, text: string) => {
    return syncManager.sendFromDesktop(text)
  })

  ipcMain.handle('message:search', async (_event, keyword: string) => sessionManager.searchMessages(keyword))

// 消息统计（总数 + 按 Agent 分组）
ipcMain.handle('message:getStats', async () => sessionManager.getStats())

  // ── Agent 斜杠命令 ──
  ipcMain.handle('agent:getCommands', async (_event, agentCommand: string) => {
    const db = await getDb()
    const results = db.exec(
      `SELECT slash, description_en, description_zh, description_tw, source, alias FROM agent_commands
       WHERE agent_command = ? ORDER BY sort_order ASC`,
      [agentCommand],
    )
    if (!results[0]) return []
    return results[0].values.map((row: any) => ({
      slash: String(row[0]),
      descriptionEn: String(row[1] || ''),
      descriptionZh: String(row[2] || ''),
      descriptionTw: String(row[3] || ''),
      source: String(row[4] || 'builtin'),
      alias: String(row[5] || ''),
    }))
  })

  // ── Agent LLM 配置管理 ──

  // 获取 Agent 关联的 LLM 配置（供应商信息 + 模型配置）
  ipcMain.handle('agent:getLLMConfig', async (_event, agentId: number) => {
    try {
      const config = await getAgentLLMConfig(agentId)
      if (!config) return null

      // 如果有关联的供应商，尝试解密 API Key
      let apiKey = ''
      if (config.provider && isUnlocked()) {
        try {
          const db = await getDb()
          const encResult = db.exec(`SELECT api_key_encrypted, api_key_iv, api_key_tag FROM llm_providers WHERE id = ${config.llmProviderId}`)
          if (encResult[0] && encResult[0].values[0]) {
            const [enc, iv, tag] = encResult[0].values[0]
            if (enc && iv && tag) {
              apiKey = decryptApiKey(enc as string, iv as string, tag as string)
            }
          }
        } catch {
          // 解密失败返回空
        }
      }

      return {
        agentId: config.agentId,
        command: config.command,
        name: config.name,
        providerType: config.providerType,
        llmProviderId: config.llmProviderId,
        modelConfig: config.modelConfig,
        provider: config.provider ? {
          id: config.provider.id,
          name: config.provider.name,
          baseUris: config.provider.baseUris,
          apiKey,
          models: config.provider.models,
        } : null,
      }
    } catch (err: any) {
      logger.error('agent:getLLMConfig failed', { agentId, error: err.message })
      return null
    }
  })

  // 更新 Agent 的 LLM 配置（关联供应商 + 模型配置）
  // 前端暂不开放，但后端 API 已就绪
  ipcMain.handle('agent:updateLLMConfig', async (_event, data: {
    agentId: number
    llmProviderId: number | null
    modelConfig: { model: string; temperature?: number; maxTokens?: number } | null
    applyImmediately?: boolean
  }) => {
    try {
      const { agentId, llmProviderId, modelConfig, applyImmediately = true } = data

      // 如果需要立即应用，先获取解密后的 API Key
      let decryptedApiKey: string | undefined
      if (applyImmediately && llmProviderId && isUnlocked()) {
        try {
          const db = await getDb()
          const encResult = db.exec(`SELECT api_key_encrypted, api_key_iv, api_key_tag FROM llm_providers WHERE id = ${llmProviderId}`)
          if (encResult[0] && encResult[0].values[0]) {
            const [enc, iv, tag] = encResult[0].values[0]
            if (enc && iv && tag) {
              decryptedApiKey = decryptApiKey(enc as string, iv as string, tag as string)
            }
          }
        } catch {
          // 解密失败，仍然更新数据库但不应用配置文件
        }
      }

      const result = await updateAgentLLMConfig(
        agentId,
        llmProviderId,
        modelConfig,
        decryptedApiKey,
        applyImmediately
      )

      return result
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  // 手动触发将 LLM 配置应用到 CLI 工具配置文件
  ipcMain.handle('agent:applyLLMConfig', async (_event, agentId: number) => {
    try {
      // 获取解密后的 API Key
      let decryptedApiKey: string | undefined
      if (isUnlocked()) {
        const config = await getAgentLLMConfig(agentId)
        if (config?.llmProviderId) {
          const db = await getDb()
          const encResult = db.exec(`SELECT api_key_encrypted, api_key_iv, api_key_tag FROM llm_providers WHERE id = ${config.llmProviderId}`)
          if (encResult[0] && encResult[0].values[0]) {
            const [enc, iv, tag] = encResult[0].values[0]
            if (enc && iv && tag) {
              decryptedApiKey = decryptApiKey(enc as string, iv as string, tag as string)
            }
          }
        }
      }

      return await applyLLMConfigToAgent(agentId, decryptedApiKey)
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  // 批量应用所有已绑定 LLM 的 Agent 配置
  ipcMain.handle('agent:applyAllLLMConfigs', async () => {
    try {
      // 获取解密 API Key 的回调函数
      const getDecryptedApiKey = (providerId: number): string | undefined => {
        if (!isUnlocked()) return undefined
        try {
          // 这里使用同步方式获取，因为 config-applier 的 applyAllLLMConfigs 接受同步回调
          // 注意：getDb 是异步的，但在批量应用时我们已经在 applyLLMConfigToAgent 中单独获取 API Key
          return undefined // 实际 API Key 在 applyLLMConfigToAgent 中获取
        } catch {
          return undefined
        }
      }

      // 由于 getDb 是异步的，我们改为逐个处理
      const { getAgentsWithLLMConfig } = await import('../agent/config-applier.js')
      const agents = await getAgentsWithLLMConfig()
      let success = 0
      let failed = 0

      for (const agent of agents) {
        const result = await applyLLMConfigToAgent(agent.agentId)
        if (result.success) {
          success++
        } else {
          failed++
        }
      }

      return { total: agents.length, success, failed }
    } catch (err: any) {
      return { total: 0, success: 0, failed: 0, error: err.message }
    }
  })

  // ── 商城 ──
  ipcMain.handle('store:list', async () => {
    const db = await getDb()
    const results = db.exec(
      `SELECT * FROM store_items WHERE enabled = 1 ORDER BY category ASC, sort_order ASC`
    )
    if (!results[0]) return []
    const cols = results[0].columns
    return results[0].values.map((row: any) => {
      const col = (name: string) => { const idx = cols.indexOf(name); return idx >= 0 ? row[idx] : null }
      return {
        id: col('id'),
        name: col('name'),
        category: col('category'),
        provider: col('provider'),
        description: col('description'),
        link: col('link'),
        logoUrl: col('logo_url'),
        isPartner: Boolean(col('is_partner')),
        commission: col('commission'),
        tag: col('tag'),
        icon: col('icon'),
        sortOrder: col('sort_order'),
      }
    })
  })

  ipcMain.handle('store:categories', async () => {
    const db = await getDb()
    const results = db.exec(`SELECT * FROM store_categories ORDER BY category_key ASC`)
    if (!results[0]) return []
    const cols = results[0].columns
    return results[0].values.map((row: any) => {
      const col = (name: string) => { const idx = cols.indexOf(name); return idx >= 0 ? row[idx] : null }
      return {
        categoryKey: col('category_key'),
        nameZh: col('name_zh'),
        nameTw: col('name_tw'),
        nameEn: col('name_en'),
        icon: col('icon'),
      }
    })
  })

  // ── 微信 ──
  ipcMain.handle('wechat:getStatus', () => syncManager.getStatus())
  ipcMain.handle('wechat:startLogin', async () => {
    try {
      const info = await syncManager.startQrLogin()
      return { success: true, qrcodeUrl: info.qrcodeUrl, qrcodeId: info.qrcodeId }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })
  ipcMain.handle('wechat:waitForScan', async (_event, qrcodeId: string) => {
    try {
      const success = await syncManager.waitForQrScan(qrcodeId)
      return { success }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })
  ipcMain.handle('wechat:disconnect', async () => {
    await syncManager.disconnect()
    return { success: true }
  })

  // ── WebDAV 同步 ──
  ipcMain.handle('sync:getStatus', () => webdavSync.getStatus())
// 保存配置：同时写入内存 + 持久化到数据库 sync_config 表，并重启定时器
ipcMain.handle('sync:saveConfig', async (_event, config: SyncConfig) => {
webdavSync.reconfigure(config)
await webdavSync.saveConfigToDb(config)
return { success: true }
})
  // 读取已保存的配置（从数据库加载，用于前端回显）
  ipcMain.handle('sync:getConfig', async () => {
    return webdavSync.getConfig() || await webdavSync.loadConfigFromDb()
  })
  ipcMain.handle('sync:test', async () => webdavSync.testConnection())
  ipcMain.handle('sync:upload', async () => webdavSync.upload())
  ipcMain.handle('sync:download', async () => webdavSync.download())
  ipcMain.handle('sync:fetchRemoteInfo', async () => webdavSync.fetchRemoteInfo())

  // ── 备份 ──
  ipcMain.handle('backup:create', async () => createBackup())
  ipcMain.handle('backup:list', () => listBackups())
  // 删除备份文件
  ipcMain.handle('backup:delete', async (_event, backupPath: string) => {
    const { existsSync, unlinkSync } = await import('node:fs')
    if (!existsSync(backupPath)) return false
    unlinkSync(backupPath)
    logger.info('Backup deleted', { path: backupPath })
    return true
  })
  ipcMain.handle('backup:restore', async (_event, backupPath: string) => {
    await restoreFromBackup(backupPath)
    return true
  })

  // ── 配置 ──
  ipcMain.handle('config:get', () => {
    const raw = getAllConfig()
    // 默认工作目录：Windows/macOS → Documents，Linux → home
    const defaultWd = process.platform === 'linux'
      ? join(homedir())
      : join(homedir(), 'Documents')
    return {
      theme: raw.theme || 'system',
      language: raw.language || 'zh-CN',
      workingDirectory: raw.workingDirectory || defaultWd,
      systemPrompt: raw.systemPrompt || '',
      launchOnStartup: raw.launchOnStartup === 'true',
      minimizeToTray: raw.minimizeToTray !== 'false',  // 默认 true
    }
  })
  ipcMain.handle('config:update', (_event, updates: Record<string, unknown>) => {
    // 开机自启变更时同步到 Electron 系统设置
    if ('launchOnStartup' in updates) {
      app.setLoginItemSettings({ openAtLogin: Boolean(updates.launchOnStartup) })
    }
    // 逐条写回数据库（统一转字符串存储）
    for (const [key, value] of Object.entries(updates)) {
      setConfig(key, String(value))
    }
    // 返回更新后的完整配置
    const raw = getAllConfig()
    const defaultWd = process.platform === 'linux'
      ? join(homedir())
      : join(homedir(), 'Documents')
    return {
      theme: raw.theme || 'system',
      language: raw.language || 'zh-CN',
      workingDirectory: raw.workingDirectory || defaultWd,
      systemPrompt: raw.systemPrompt || '',
      launchOnStartup: raw.launchOnStartup === 'true',
      minimizeToTray: raw.minimizeToTray !== 'false',
    }
  })

  // ── 应用 ──
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getPlatform', () => process.platform)
  ipcMain.handle('app:quit', () => { isQuitting.value = true; app.quit() })

  // 执行 shell 命令（用于一键安装 Agent CLI）
  // 使用 spawn 异步执行，通过 shell 模式运行以兼容 Windows 的 .cmd 文件
  // options.elevated 为 true 时，在 Windows 下通过 UAC 提权执行（解决 npm 全局安装权限问题）
  ipcMain.handle('app:execCommand', async (_event, command: string, options?: { elevated?: boolean }) => {
    const isWin = process.platform === 'win32'

    // ── 管理员提权模式（仅 Windows） ──
    // 通过 PowerShell Start-Process -Verb RunAs 弹出 UAC 提示框，
    // 用户确认后以管理员身份运行安装命令。
    // 输出和退出码通过临时文件传递回主进程。
    if (options?.elevated && isWin) {
      const timestamp = Date.now()
      const batFile = join(tmpdir(), `wla-install-${timestamp}.bat`)
      const logFile = join(tmpdir(), `wla-install-${timestamp}.log`)
      const exitCodeFile = join(tmpdir(), `wla-install-${timestamp}.exitcode`)

      // 写入批处理文件：执行安装命令并将 stdout/stderr 和退出码分别写入临时文件
      // chcp 65001 确保 UTF-8 编码，call 确保正确获取 npm.cmd 的退出码
      const batContent = `@echo off\r\nchcp 65001 >nul\r\ncall ${command} > "${logFile}" 2>&1\r\necho %ERRORLEVEL% > "${exitCodeFile}"\r\n`
      writeFileSync(batFile, batContent, 'utf-8')

      return new Promise((resolve) => {
        // PowerShell 脚本：以管理员身份运行 .bat 文件并等待完成
        // 如果用户拒绝 UAC，捕获异常并输出 UAC_REJECTED 标记
        const psScript = `try { Start-Process -FilePath '${batFile.replace(/'/g, "''")}' -Verb RunAs -Wait -ErrorAction Stop; Write-Output 'OK' } catch { Write-Output 'UAC_REJECTED' }`
        const child = spawn('powershell.exe', ['-NoProfile', '-Command', psScript], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 300000, // 5 分钟超时
        })

        let psStdout = ''
        let psStderr = ''
        child.stdout?.on('data', (data: Buffer) => { psStdout += data.toString() })
        child.stderr?.on('data', (data: Buffer) => { psStderr += data.toString() })

        child.on('error', (err: Error) => {
          cleanupTempFiles(batFile, logFile, exitCodeFile)
          resolve({ success: false, error: err.message })
        })

        child.on('close', () => {
          // 用户拒绝了 UAC 提权
          if (psStdout.includes('UAC_REJECTED')) {
            cleanupTempFiles(batFile, logFile, exitCodeFile)
            resolve({ success: false, error: '用户拒绝了管理员权限请求（UAC）' })
            return
          }

          // 读取退出码
          let exitCode = 1
          try {
            if (existsSync(exitCodeFile)) {
              exitCode = parseInt(readFileSync(exitCodeFile, 'utf-8').trim(), 10)
            }
          } catch { /* 读取失败默认 exitCode=1 */ }

          // 读取命令输出日志
          let output = ''
          try {
            if (existsSync(logFile)) {
              output = readFileSync(logFile, 'utf-8')
            }
          } catch { /* 读取失败忽略 */ }

          // 清理临时文件
          cleanupTempFiles(batFile, logFile, exitCodeFile)

          if (exitCode === 0) {
            resolve({ success: true })
          } else {
            // 提取最后 10 行作为错误信息
            const errMsg = output.trim().split('\n').slice(-10).join('\n') || `Process exited with code ${exitCode}`
            resolve({ success: false, error: errMsg })
          }
        })
      })
    }

    // ── 正常模式 ──
    return new Promise((resolve) => {
      // Windows 下使用 cmd.exe /c，其他平台使用 /bin/sh -c
      const shellCmd = isWin ? 'cmd.exe' : '/bin/sh'
      const shellArgs = isWin ? ['/c', command] : ['-c', command]
      const child = spawn(shellCmd, shellArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 300000, // 5 分钟超时
        env: { ...process.env },
      })

      let stderr = ''
      let stdout = ''

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('error', (err: Error) => {
        resolve({ success: false, error: err.message })
      })

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ success: true })
        } else {
          // 提取 stderr 最后几行作为错误信息
          const errMsg = stderr.trim().split('\n').slice(-5).join('\n') || `Process exited with code ${code}`
          resolve({ success: false, error: errMsg })
        }
      })
    })
  })

  // 在默认浏览器中打开 URL
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    try { await shell.openExternal(url); return { success: true } } catch { return { success: false } }
  })

  // ── 打开终端并显示登录提示 ──
  // 安装 Agent 后引导用户在终端中执行登录命令（所有 Agent 均需登录或配置 API）
  // hint: 在终端中显示的提示文字，agentCommand: Agent 的 CLI 命令名（如 "claude"）
  ipcMain.handle('app:openTerminalForLogin', async (_event, hint: string, agentCommand: string) => {
    try {
      const { spawn } = require('node:child_process')
      const isWin = process.platform === 'win32'
      const isMac = process.platform === 'darwin'

      // 构建终端中显示的提示文字
      const hintText = hint.replace(/"/g, '\\"')

      if (isWin) {
        // Windows: 使用 cmd /k 保持窗口打开，先显示提示再等待用户输入
        // "提示文字" + 空行 + "请在下方输入登录命令，例如：{command} login" + 空行
        const cmdStr = `echo ${hintText} & echo. & echo 请在下方输入登录命令，例如：${agentCommand} login & echo.`
        spawn('cmd.exe', ['/c', `start cmd /k "${cmdStr}"`], { detached: true, windowsHide: true })
      } else if (isMac) {
        // macOS: 使用 osascript 打开 Terminal.app 并执行命令
        const script = `tell application "Terminal" to do script "echo '${hintText}'; echo; echo '请在下方输入登录命令，例如：${agentCommand} login'; echo"`
        spawn('osascript', ['-e', script], { detached: true })
      } else {
        // Linux: 尝试使用 x-terminal-emulator 或 gnome-terminal
        const cmdStr = `echo '${hintText}'; echo; echo '请在下方输入登录命令，例如：${agentCommand} login'; exec bash`
        spawn('sh', ['-c', `x-terminal-emulator -e sh -c "${cmdStr}" 2>/dev/null || gnome-terminal -- sh -c "${cmdStr}" 2>/dev/null || xterm -e sh -c "${cmdStr}"`], { detached: true })
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message || String(e) }
    }
  })

  // ── 目录选择器 ──
  ipcMain.handle('dialog:pickDirectory', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择数据存储目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── 文件选择器（多选） ──
  ipcMain.handle('dialog:openFiles', async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      title: '选择文件',
    })
    return result.canceled ? [] : result.filePaths
  })

  // ── 主题设置（同步系统标题栏颜色） ──
  ipcMain.handle('theme:set', (_event, theme: string) => {
    // 将渲染进程传来的主题同步到 nativeTheme，使系统标题栏/滚动条跟随
    if (theme === 'dark') {
      nativeTheme.themeSource = 'dark'
    } else if (theme === 'light') {
      nativeTheme.themeSource = 'light'
    } else {
      nativeTheme.themeSource = 'system'
    }
    // 返回实际解析后的主题，供渲染进程在「跟随系统」模式下获取真实系统偏好
    return { success: true, resolvedTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' }
  })

  // ── 环境检测 ──
  const ENV_TOOLS: Record<string, { installUrl: string; winget: string; brew: string; apt: string }> = {
    'Node.js': { installUrl: 'https://nodejs.org/', winget: 'winget install OpenJS.NodeJS', brew: 'brew install node', apt: 'apt-get install -y nodejs' },
    'npm': { installUrl: 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm', winget: '', brew: '', apt: '' },
    'Git': { installUrl: 'https://git-scm.com/downloads', winget: 'winget install Git.Git', brew: 'brew install git', apt: 'apt-get install -y git' },
  }

  ipcMain.handle('env:check', async () => {
    const results: Array<{ tool: string; installed: boolean; version?: string; installUrl?: string; installCmd?: string }> = []
    const plat = process.platform
    const check = (tool: string) => { const i = ENV_TOOLS[tool]; return { installUrl: i?.installUrl, installCmd: plat === 'win32' ? i?.winget : plat === 'darwin' ? i?.brew : i?.apt } }
    try {
      const { execSync } = await import('node:child_process')
      const nodeVer = execSync('node --version', { encoding: 'utf-8', timeout: 5000 }).trim()
      results.push({ tool: 'Node.js', installed: true, version: nodeVer })
    } catch {
      results.push({ tool: 'Node.js', installed: false, ...check('Node.js') })
    }
    try {
      const { execSync } = await import('node:child_process')
      const npmVer = execSync('npm --version', { encoding: 'utf-8', timeout: 5000 }).trim()
      results.push({ tool: 'npm', installed: true, version: npmVer })
    } catch {
      results.push({ tool: 'npm', installed: false, ...check('npm') })
    }
    try {
      const { execSync } = await import('node:child_process')
      const gitVer = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim()
      results.push({ tool: 'Git', installed: true, version: gitVer })
    } catch {
      results.push({ tool: 'Git', installed: false, ...check('Git') })
    }
    return results
  })

  // ── 窗口管理 ──
  // 显示主窗口并聚焦
  ipcMain.handle('window:show', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // 隐藏窗口到托盘
  ipcMain.handle('window:hide', () => {
    mainWindow?.hide()
  })

  // 查询窗口是否可见
  ipcMain.handle('window:isVisible', () => {
    return mainWindow?.isVisible() ?? false
  })

  // ── 密码管理（API Key 加密） ──

  // 检查是否已设置密码
  ipcMain.handle('masterPassword:has', () => {
    return hasMasterPassword()
  })

  // 检查当前是否已解锁
  ipcMain.handle('masterPassword:isUnlocked', () => {
    return isUnlocked()
  })

  // 设置密码（首次设置或重置）
  ipcMain.handle('masterPassword:set', (_event, password: string, trustDevice: boolean) => {
    return setMasterPassword(password, trustDevice)
  })

  // 用密码解锁（可选 trustDevice 参数控制是否记住密码）
  ipcMain.handle('masterPassword:unlock', (_event, password: string, trustDevice?: boolean) => {
    return unlockWithPassword(password, trustDevice)
  })

  // 尝试从设备信任缓存恢复（应用启动时自动调用）
  ipcMain.handle('masterPassword:tryRestore', () => {
    return tryRestoreFromDeviceTrust()
  })

  // 锁定（清除内存中的派生密钥）
  ipcMain.handle('masterPassword:lock', () => {
    lock()
    return true
  })

  // 更改密码
  ipcMain.handle('masterPassword:change', (_event, oldPassword: string, newPassword: string, trustDevice: boolean) => {
    return changeMasterPassword(oldPassword, newPassword, trustDevice)
  })

  // 清除密码（重置）
  ipcMain.handle('masterPassword:clear', () => {
    clearMasterPassword()
    return true
  })

  // ── LLM 供应商管理（工具箱） ──

  // 获取所有供应商列表
  ipcMain.handle('provider:list', async () => {
    try {
      const db = await getDb()
      const result = db.exec('SELECT id, name, description, website, base_uris, logo_url, created_at, updated_at FROM llm_providers ORDER BY id DESC')
      if (!result[0]) return []
      return result[0].values.map((row: any[]) => ({
        id: row[0],
        name: row[1],
        description: row[2],
        website: row[3],
        baseUris: JSON.parse(row[4] || '[]'),
        logoUrl: row[5] || '',
        createdAt: row[6],
        updatedAt: row[7],
      }))
    } catch {
      return []
    }
  })

  // 获取单个供应商详情（含模型列表 + 解密后的 API Key）
  ipcMain.handle('provider:get', async (_event, id: number) => {
    try {
      const db = await getDb()
      const providerResult = db.exec(`SELECT id, name, description, website, base_uris, logo_url, api_key_encrypted, api_key_iv, api_key_tag FROM llm_providers WHERE id = ${id}`)
      if (!providerResult[0] || !providerResult[0].values[0]) return null

      const row = providerResult[0].values[0]
      const modelsResult = db.exec(`SELECT id, display_name, model_name FROM llm_models WHERE provider_id = ${id} ORDER BY id`)
      const models = modelsResult[0] ? modelsResult[0].values.map((m: any[]) => ({
        id: m[0],
        displayName: m[1],
        modelName: m[2],
      })) : []

      // 尝试解密 API Key（需已解锁）
      let apiKey = ''
      if (row[5] && row[6] && row[7] && isUnlocked()) {
        try {
          apiKey = decryptApiKey(row[5], row[6], row[7])
        } catch {
          apiKey = '' // 解密失败返回空
        }
      }

      return {
        id: row[0],
        name: row[1],
        description: row[2],
        website: row[3],
        baseUris: JSON.parse(row[4] || '[]'),
        logoUrl: row[5] || '',
        apiKey, // 明文（已解锁时）或空字符串
        hasApiKey: !!row[6], // 是否已配置 API Key
        models,
      }
    } catch {
      return null
    }
  })

  // 新增供应商
  ipcMain.handle('provider:create', async (_event, data: {
    name: string
    description: string
    website: string
    logoUrl: string
    baseUris: Array<{ protocol: string; url: string }>
    apiKey: string
    models: Array<{ displayName: string; modelName: string }>
  }) => {
    try {
      const db = await getDb()
      // 加密 API Key（若有），需已解锁主密码
      let apiKeyEnc = '', apiKeyIv = '', apiKeyTag = ''
      if (data.apiKey && isUnlocked()) {
        const enc = encryptApiKey(data.apiKey)
        apiKeyEnc = enc.ciphertext
        apiKeyIv = enc.iv
        apiKeyTag = enc.tag
      }
      db.run(`INSERT INTO llm_providers (name, description, website, logo_url, base_uris, api_key_encrypted, api_key_iv, api_key_tag) VALUES ('${data.name.replace(/'/g, "''")}', '${data.description.replace(/'/g, "''")}', '${data.website.replace(/'/g, "''")}', '${(data.logoUrl || '').replace(/'/g, "''")}', '${JSON.stringify(data.baseUris)}', '${apiKeyEnc}', '${apiKeyIv}', '${apiKeyTag}')`)
      // 注意：必须在 saveDb() 之前获取 last_insert_rowid()，因为 db.export() 会重置该值
      const idResult = db.exec('SELECT last_insert_rowid()')
      const providerId = idResult[0].values[0][0]
      // 插入模型
      for (const model of data.models) {
        db.run(`INSERT INTO llm_models (provider_id, display_name, model_name) VALUES (${providerId}, '${model.displayName.replace(/'/g, "''")}', '${model.modelName.replace(/'/g, "''")}')`)
      }
      // 所有数据插入完成后统一持久化到磁盘
      saveDb()
      return { success: true, id: providerId }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  // 更新供应商
  ipcMain.handle('provider:update', async (_event, id: number, data: {
    name: string
    description: string
    website: string
    logoUrl: string
    baseUris: Array<{ protocol: string; url: string }>
    apiKey?: string // 不传则不更新 API Key
    models: Array<{ id?: number; displayName: string; modelName: string }>
  }) => {
    try {
      const db = await getDb()
      // 更新基本信息
      let sql = `UPDATE llm_providers SET name = '${data.name.replace(/'/g, "''")}', description = '${data.description.replace(/'/g, "''")}', website = '${data.website.replace(/'/g, "''")}', logo_url = '${(data.logoUrl || '').replace(/'/g, "''")}', base_uris = '${JSON.stringify(data.baseUris)}', updated_at = datetime('now','localtime')`
      // 如果传了 API Key，更新加密后的值（需已解锁）
      if (data.apiKey !== undefined && isUnlocked()) {
        if (data.apiKey === '') {
          // 空字符串表示清除 API Key
          sql += `, api_key_encrypted = '', api_key_iv = '', api_key_tag = ''`
        } else {
          const enc = encryptApiKey(data.apiKey)
          sql += `, api_key_encrypted = '${enc.ciphertext}', api_key_iv = '${enc.iv}', api_key_tag = '${enc.tag}'`
        }
      }
      sql += ` WHERE id = ${id}`
      db.run(sql)

      // 更新模型：先删除旧的，再插入新的
      db.run(`DELETE FROM llm_models WHERE provider_id = ${id}`)
      for (const model of data.models) {
        db.run(`INSERT INTO llm_models (provider_id, display_name, model_name) VALUES (${id}, '${model.displayName.replace(/'/g, "''")}', '${model.modelName.replace(/'/g, "''")}')`)
      }
      // 所有操作完成后统一持久化
      saveDb()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  // 删除供应商
  ipcMain.handle('provider:delete', async (_event, id: number) => {
    try {
      const db = await getDb()
      db.run(`DELETE FROM llm_providers WHERE id = ${id}`)
      saveDb()
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  // 测试 API 连接
  ipcMain.handle('provider:test', async (_event, data: {
    protocol: string
    baseUrl: string
    apiKey: string
    modelName: string
  }) => {
    try {
      const { protocol, baseUrl, apiKey, modelName } = data
      // 根据不同协议发送测试请求
      const url = baseUrl.replace(/\/$/, '') // 去掉末尾斜杠

      if (protocol === 'openai') {
        // OpenAI API: 发送一个简单的 chat completion 请求
        const response = await fetch(`${url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
        })
        if (response.ok) {
          return { success: true, message: '连接成功' }
        }
        const errText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` }
      } else if (protocol === 'anthropic') {
        // Anthropic API: 发送一个简单的 messages 请求
        const response = await fetch(`${url}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelName,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        })
        if (response.ok) {
          return { success: true, message: '连接成功' }
        }
        const errText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` }
      } else if (protocol === 'gemini') {
        // Gemini API: 发送一个简单的 generateContent 请求
        const response = await fetch(`${url}/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hi' }] }],
          }),
        })
        if (response.ok) {
          return { success: true, message: '连接成功' }
        }
        const errText = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` }
      }
      return { success: false, error: `不支持的协议: ${protocol}` }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) }
    }
  })

  // ── 供应商模板（工具箱） ──

  // 搜索供应商模板（按关键词模糊匹配名称，空关键词返回全部）
  ipcMain.handle('providerTemplate:search', async (_event, keyword: string) => {
    try {
      const db = await getDb()
      let result
      if (keyword && keyword.trim()) {
        const kw = keyword.trim().replace(/'/g, "''")
        result = db.exec(`SELECT id, name, logo_url, website, description, base_uris FROM provider_templates WHERE name LIKE '%${kw}%' OR description LIKE '%${kw}%' ORDER BY sort_order ASC LIMIT 20`)
      } else {
        result = db.exec(`SELECT id, name, logo_url, website, description, base_uris FROM provider_templates ORDER BY sort_order ASC LIMIT 20`)
      }
      if (!result[0]) return []
      return result[0].values.map((row: any[]) => ({
        id: row[0],
        name: row[1],
        logoUrl: row[2] || '',
        website: row[3] || '',
        description: row[4] || '',
        baseUris: JSON.parse(row[5] || '[]'),
      }))
    } catch {
      return []
    }
  })
}
