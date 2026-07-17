/**
 * Preload 脚本
 *
 * 通过 contextBridge 暴露类型安全的 API 到渲染进程。
 * 所有 IPC 通信都经过此桥接层，确保安全性。
 *
 * 渲染进程通过 window.electronAPI 访问这些方法。
 */

import { contextBridge, ipcRenderer } from 'electron'

/**
 * 暴露给渲染进程的 API
 */
const electronAPI = {
  // ── Agent 管理 ──
  agent: {
    list: () => ipcRenderer.invoke('agent:list'),
    getCurrent: () => ipcRenderer.invoke('agent:getCurrent'),
    add: (config: any) => ipcRenderer.invoke('agent:add', config),
    remove: (id: number) => ipcRenderer.invoke('agent:remove', id),
    update: (id: number, updates: any) => ipcRenderer.invoke('agent:update', id, updates),
    switch: (name: string) => ipcRenderer.invoke('agent:switch', name),
    scan: () => ipcRenderer.invoke('agent:scan'),
    rescan: () => ipcRenderer.invoke('agent:rescan'),
    getRegistry: () => ipcRenderer.invoke('agent:getRegistry'),
    getCommands: (agentCommand: string) => ipcRenderer.invoke('agent:getCommands', agentCommand),
    // 获取 Agent 运行时状态（当前 Agent + 所有 Agent 状态汇总）
    getStatus: () => ipcRenderer.invoke('agent:getStatus'),
    // 监听 Agent 状态变更事件（processing ↔ online）
    onStatusChange: (callback: (data: { agentId: number; agentName: string; status: string }) => void) => {
      ipcRenderer.on('agent:statusChange', (_event, data) => callback(data))
    },
    // 移除状态变更监听器
    removeStatusChangeListener: () => {
      ipcRenderer.removeAllListeners('agent:statusChange')
    },
    // ── LLM 配置管理 ──
    // 获取 Agent 关联的 LLM 配置（供应商信息 + 模型配置）
    getLLMConfig: (agentId: number) => ipcRenderer.invoke('agent:getLLMConfig', agentId),
    // 更新 Agent 的 LLM 配置（关联供应商 + 模型配置，可选立即应用）
    updateLLMConfig: (data: {
      agentId: number
      llmProviderId: number | null
      modelConfig: { model: string; temperature?: number; maxTokens?: number } | null
      applyImmediately?: boolean
    }) => ipcRenderer.invoke('agent:updateLLMConfig', data),
    // 手动触发将 LLM 配置应用到 CLI 工具配置文件
    applyLLMConfig: (agentId: number) => ipcRenderer.invoke('agent:applyLLMConfig', agentId),
    // 批量应用所有已绑定 LLM 的 Agent 配置
    applyAllLLMConfigs: () => ipcRenderer.invoke('agent:applyAllLLMConfigs'),
  },

  // ── 消息 ──
  message: {
    send: (text: string, sessionId?: number, files?: Array<{ path: string; name: string }>) => ipcRenderer.invoke('message:send', text, sessionId, files),
    getHistory: (agentName: string, limit?: number, sessionId?: number) =>
      ipcRenderer.invoke('message:getHistory', agentName, limit, sessionId),
    clear: (agentName: string, sessionId?: number) => ipcRenderer.invoke('message:clear', agentName, sessionId),
    search: (keyword: string) => ipcRenderer.invoke('message:search', keyword),
    // 消息统计（总数 + 按 Agent 分组）
    getStats: () => ipcRenderer.invoke('message:getStats'),
    getChatAgents: () => ipcRenderer.invoke('message:getChatAgents'),
    getClawBotHistory: () => ipcRenderer.invoke('message:getClawBotHistory'),
    sendClawBot: (text: string) => ipcRenderer.invoke('message:sendClawBot', text),
    // 删除 Agent 的所有聊天记录（所有会话 + 消息）
    deleteAgentChats: (agentId: number) => ipcRenderer.invoke('message:deleteAgentChats', agentId),
    // 导出单个会话为 Markdown
    exportSession: (sessionId: number) => ipcRenderer.invoke('message:exportSession', sessionId),
    // 导出 Agent 所有对话为 Markdown
    exportAgentChats: (agentId: number, agentName: string) => ipcRenderer.invoke('message:exportAgentChats', agentId, agentName),
    onAgentOutput: (callback: (data: { content: string; type: string; sessionId: number }) => void) => {
      ipcRenderer.on('message:agentOutput', (_event, data) => callback(data))
    },
    removeAgentOutputListener: () => {
      ipcRenderer.removeAllListeners('message:agentOutput')
    },
  },

  // ── 会话管理 ──
  session: {
    list: (agentId: number) => ipcRenderer.invoke('session:list', agentId),
    create: (agentId: number, title?: string) => ipcRenderer.invoke('session:create', agentId, title),
    delete: (sessionId: number) => ipcRenderer.invoke('session:delete', sessionId),
    rename: (sessionId: number, title: string) => ipcRenderer.invoke('session:rename', sessionId, title),
    switch: (sessionId: number) => ipcRenderer.invoke('session:switch', sessionId),
    getMessages: (sessionId: number, limit?: number) => ipcRenderer.invoke('session:getMessages', sessionId, limit),
    updateCwd: (sessionId: number, cwd: string) => ipcRenderer.invoke('session:updateCwd', sessionId, cwd),
  },

  // ── 商城 ──
  store: {
    list: () => ipcRenderer.invoke('store:list'),
    categories: () => ipcRenderer.invoke('store:categories'),
  },

  // ── 微信 ──
  wechat: {
    getStatus: () => ipcRenderer.invoke('wechat:getStatus'),
    startLogin: () => ipcRenderer.invoke('wechat:startLogin'),
    waitForScan: (qrcodeId: string) => ipcRenderer.invoke('wechat:waitForScan', qrcodeId),
    disconnect: () => ipcRenderer.invoke('wechat:disconnect'),
    onSessionExpired: (callback: () => void) => {
      ipcRenderer.on('wechat:sessionExpired', () => callback())
    },
    removeSessionExpiredListener: () => {
      ipcRenderer.removeAllListeners('wechat:sessionExpired')
    },
    onNewMessage: (callback: (data: any) => void) => {
      ipcRenderer.on('message:newMessage', (_event, data) => callback(data))
    },
    removeNewMessageListener: () => {
      ipcRenderer.removeAllListeners('message:newMessage')
    },
    // 监听微信消息推送失败事件
    onSendError: (callback: (data: { error: string }) => void) => {
      ipcRenderer.on('message:sendError', (_event, data) => callback(data))
    },
    removeSendErrorListener: () => {
      ipcRenderer.removeAllListeners('message:sendError')
    },
    // 监听扫码状态变更（wait/scaned/expired/regenerated/confirmed）
    onScanStatus: (callback: (data: any) => void) => {
      ipcRenderer.on('wechat:scanStatus', (_event, data) => callback(data))
    },
    removeScanStatusListener: () => {
      ipcRenderer.removeAllListeners('wechat:scanStatus')
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('wechat:sessionExpired')
      ipcRenderer.removeAllListeners('message:newMessage')
      ipcRenderer.removeAllListeners('message:sendError')
      ipcRenderer.removeAllListeners('wechat:scanStatus')
    },
  },

  // ── WebDAV 同步 ──
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    // 读取已保存的同步配置（用于前端回显）
    getConfig: () => ipcRenderer.invoke('sync:getConfig'),
    saveConfig: (config: any) => ipcRenderer.invoke('sync:saveConfig', config),
    test: () => ipcRenderer.invoke('sync:test'),
    upload: () => ipcRenderer.invoke('sync:upload'),
    download: () => ipcRenderer.invoke('sync:download'),
    fetchRemoteInfo: () => ipcRenderer.invoke('sync:fetchRemoteInfo'),
  },

  // ── 备份 ──
backup: {
create: () => ipcRenderer.invoke('backup:create'),
list: () => ipcRenderer.invoke('backup:list'),
restore: (backupPath: string) => ipcRenderer.invoke('backup:restore', backupPath),
delete: (backupPath: string) => ipcRenderer.invoke('backup:delete', backupPath),
},

  // ── 配置 ──
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (updates: any) => ipcRenderer.invoke('config:update', updates),
    pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  },

  // ── 应用 ──
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    quit: () => ipcRenderer.invoke('app:quit'),
    execCommand: (command: string, options?: { elevated?: boolean }) => ipcRenderer.invoke('app:execCommand', command, options),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    // 打开终端并显示登录提示（安装后引导用户登录/配置 API）
    openTerminalForLogin: (hint: string, agentCommand: string) => ipcRenderer.invoke('app:openTerminalForLogin', hint, agentCommand),
  },

  // ── 环境检测 ──
  env: {
    check: () => ipcRenderer.invoke('env:check'),
  },

  // ── 对话框 ──
  dialog: {
    pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  },

  // ── 主题（同步系统标题栏颜色） ──
  theme: {
    set: (theme: string) => ipcRenderer.invoke('theme:set', theme),
  },

  // ── 窗口管理 ──
  window: {
    show: () => ipcRenderer.invoke('window:show'),
    hide: () => ipcRenderer.invoke('window:hide'),
    isVisible: () => ipcRenderer.invoke('window:isVisible'),
  },

  // ── 主密码管理（API Key 加密） ──
  masterPassword: {
    has: () => ipcRenderer.invoke('masterPassword:has'),
    isUnlocked: () => ipcRenderer.invoke('masterPassword:isUnlocked'),
    set: (password: string, trustDevice: boolean) => ipcRenderer.invoke('masterPassword:set', password, trustDevice),
    unlock: (password: string, trustDevice?: boolean) => ipcRenderer.invoke('masterPassword:unlock', password, trustDevice),
    tryRestore: () => ipcRenderer.invoke('masterPassword:tryRestore'),
    lock: () => ipcRenderer.invoke('masterPassword:lock'),
    change: (oldPassword: string, newPassword: string, trustDevice: boolean) => ipcRenderer.invoke('masterPassword:change', oldPassword, newPassword, trustDevice),
    clear: () => ipcRenderer.invoke('masterPassword:clear'),
  },

  // ── LLM 供应商管理（工具箱） ──
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    get: (id: number) => ipcRenderer.invoke('provider:get', id),
    create: (data: any) => ipcRenderer.invoke('provider:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('provider:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('provider:delete', id),
    test: (data: { protocol: string; baseUrl: string; apiKey: string; modelName: string }) => ipcRenderer.invoke('provider:test', data),
  },

  // ── 供应商模板（工具箱） ──
  providerTemplate: {
    /** 搜索供应商模板（按关键词模糊匹配，空关键词返回全部） */
    search: (keyword: string) => ipcRenderer.invoke('providerTemplate:search', keyword),
  },
}

// 暴露到渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明（供渲染进程使用）
export type ElectronAPI = typeof electronAPI
