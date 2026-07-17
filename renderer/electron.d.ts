/**
 * Electron API 类型声明
 * 为渲染进程中通过 window.electronAPI 访问的 API 提供类型支持
 */

/** Agent 配置信息（运行时聚合类型：agents 表 + agent_registry JOIN） */
interface AgentConfig {
  id?: number                          /** 自增主键 */
  name: string                         /** 显示名称（来自 agent_registry） */
  command: string                      /** CLI 命令，如 "claude"（关联 agent_registry.command） */
  cliPath: string                      /** CLI 可执行文件全路径（agents 表） */
  icon: string            // SVG 图标文件名或路径（来自 agent_registry）
  args: string                         /** 启动参数（agents 表，为空时回退到 registry.default_args） */
  cwd: string                          /** 工作目录（agents 表） */
  model: string                        /** 模型名称（agents 表，为空时回退到 registry.default_model） */
  enabled: boolean                     /** 是否启用（agents 表） */
  isDefault: boolean                   /** 是否为默认 Agent（agents 表） */
  providerType: string                 /** Provider 类型（来自 agent_registry）: claude|opencode|codebuddy|codex|mimo|trae|generic */
  vendorEn?: string         // 所属厂商（英文，来自 agent_registry）
  vendorZh?: string         // 所属厂商（中文简体，来自 agent_registry）
  vendorTw?: string         // 所属厂商（中文繁体，来自 agent_registry）
  createdAt?: string                   /** 创建时间 */
  updatedAt?: string                   /** 最后更新时间 */
}

/** Agent 运行时状态 */
type AgentStatus = 'online' | 'offline' | 'processing'

/** Agent 运行时信息（包含状态） */
interface AgentInfo extends AgentConfig {
  status: AgentStatus  /** 运行时状态 */
  lastUsed?: number                    /** 最后使用时间戳 */
  error?: string                       /** 错误信息 */
}

/** Agent 注册表条目（对应 agent_registry 表） */
interface AgentRegistryEntry {
  command: string                      /** CLI 命令 */
  name: string                         /** 显示名称 */
  providerType: string                 /** Provider 类型 */
  icon?: string           // SVG 图标文件名
  installCommands: AgentInstallCommand[]  // 按平台的安装命令
  defaultArgs?: string                 /** 默认启动参数 */
  defaultModel?: string                /** 默认模型名称 */
  vendorEn?: string         // 所属厂商（英文）
  vendorZh?: string         // 所属厂商（中文简体）
  vendorTw?: string         // 所属厂商（中文繁体）
  flag?: string             /** 标签，逗号分隔，如 "企业用户,个人不可用" */
  status: number              /** 启用状态: 0=关闭 1=开启 */
  platforms: string[]                  /** 支持平台列表 */
}

/** Agent 安装命令（按平台区分） */
interface AgentInstallCommand {
  platform: string       // win32 | darwin | linux
  installHint: string                 /** 安装提示文本 */
  installCommand: string               /** 安装命令 */
  uninstallCommand?: string            /** 卸载命令（为空表示不支持一键卸载） */
}

/** 聊天消息（渲染进程侧类型） */
interface AgentMessage {
  id: number                           /** 消息 ID */
  sessionId: number                    /** 所属会话 ID */
  agentName: string                    /** Agent 名称 */
  role: 'user' | 'assistant' | 'system'  /** 消息角色 */
  content: string                      /** 消息内容 */
  source: 'desktop' | 'wechat'        /** 来源: 桌面/微信 */
  timestamp: number                    /** 时间戳（毫秒） */
}

/** 会话信息（渲染进程侧类型） */
interface SessionInfo {
  id: number                           /** 会话 ID */
  agentId: number                      /** 所属 Agent ID */
  title: string                        /** 会话标题 */
  sdkSessionId?: string                /** Agent CLI 侧的 session_id */
  createdAt: string                    /** 创建时间 */
  updatedAt: string                    /** 最后更新时间 */
}

/** 会话预览信息（用于列表展示） */
interface SessionPreview {
  id: number                           /** 会话 ID */
  agentId: number                      /** 所属 Agent ID */
  title: string                        /** 会话标题 */
  cwd?: string                         /** 会话级工作目录 */
  sdkSessionId?: string                /** Agent CLI 侧的 session_id */
  createdAt: string                    /** 创建时间 */
  updatedAt: string                    /** 最后更新时间 */
  messageCount: number                 /** 消息总数 */
  lastMessage?: string                 /** 最后一条消息摘要 */
  lastMessageTime?: number             /** 最后一条消息时间戳 */
}

/** WebDAV 云同步配置 */
interface WebDAVConfig {
  enabled: boolean                     /** 是否启用 */
  syncType: 'webdav'                   /** 同步类型 */
  baseUrl: string                      /** WebDAV 服务器地址 */
  username: string                     /** 用户名 */
  password: string                     /** 密码 */
  remoteRoot: string                   /** 远程根目录 */
  profile: string                      /** 配置名称 */
  autoSync: boolean                    /** 是否自动同步 */
  autoSyncInterval: number             /** 自动同步间隔（分钟）: 5/10/15/30/60 */
}

/** 云同步状态 */
interface SyncStatus {
  lastSyncAt: number | null            /** 最后同步时间戳 */
  lastError: string | null             /** 最后错误信息 */
  isSyncing: boolean                   /** 是否正在同步中 */
}

/** 应用配置 */
interface AppConfig {
  language: string                     /** 语言设置 */
  theme: string                        /** 主题: dark|light|system */
  workingDirectory: string             /** 工作目录 */
  systemPrompt: string                 /** 系统提示词 */
  launchOnStartup: boolean             /** 开机自启 */
  minimizeToTray: boolean              /** 关闭时最小化到托盘 */
}

/** 商城商品 */
interface StoreItem {
  id: number                           /** 商品 ID */
  name: string                         /** 商品名称 */
  category: string                     /** 分类标识 */
  provider?: string                    /** 提供方 */
  description: string                  /** 商品描述 */
  link: string                         /** 商品链接 */
  logoUrl?: string                     /** Logo URL */
  isPartner?: boolean                  /** 是否为合作伙伴 */
  commission?: string                  /** 佣金信息 */
  tag?: string                    // 标签：官方 / 第三方 / 中转站 等
  icon?: string                   // 图标文件名
  sortOrder?: number                  /** 排序权重 */
}

/** 商城分类 */
interface StoreCategory {
  categoryKey: string                  /** 分类标识 */
  nameZh: string                       /** 中文名称（简体） */
  nameTw: string                       /** 中文名称（繁体） */
  nameEn: string                       /** 英文名称 */
  icon?: string                   // 图标名称，如 "Plug", "Bot", "Star"
}

/** Agent 斜杠命令 */
interface AgentCommand {
  slash: string                        /** 命令文本，如 "/init" */
  descriptionEn: string                /** 英文描述 */
  descriptionZh: string                /** 中文描述（简体） */
  descriptionTw: string                /** 中文描述（繁体） */
  source?: 'builtin' | 'skill' | 'plugin'  /** 来源: 内置/技能/插件 */
  alias?: string                       /** 别名（逗号分隔） */
}

/** LLM 供应商（工具箱列表项） */
interface LlmProvider {
  id: number                           /** 供应商 ID */
  name: string                         /** 供应商名称 */
  description: string                  /** 供应商描述 */
  website: string                      /** 供应商官网 */
  logoUrl: string                      /** Logo 图片地址 */
  baseUris: Array<{ protocol: string; url: string }>  /** API 地址列表 */
  createdAt: string                    /** 创建时间 */
  updatedAt: string                    /** 更新时间 */
}

/** LLM 供应商详情（含模型和 API Key） */
interface LlmProviderDetail extends LlmProvider {
  apiKey: string                       /** 明文 API Key（已解锁时）或空字符串 */
  hasApiKey: boolean                   /** 是否已配置 API Key */
  models: Array<{ id?: number; displayName: string; modelName: string }>  /** 模型列表 */
}

/** LLM 模型 */
interface LlmModel {
  id?: number                           /** 模型 ID */
  displayName: string                  /** 显示名称 */
  modelName: string                    /** 实际请求模型名 */
}

/** Agent 关联的 LLM 配置信息 */
interface AgentLLMConfigInfo {
  agentId: number                      /** Agent ID */
  command: string                      /** CLI 命令 */
  name: string                         /** Agent 名称 */
  providerType: string                 /** Provider 类型 */
  llmProviderId: number | null         /** 关联的 LLM 供应商 ID */
  modelConfig: {
    model: string                      /** 模型名称 */
    temperature?: number               /** 温度参数 */
    maxTokens?: number                 /** 最大 token 数 */
  } | null                             /** 模型配置 */
  provider: {
    id: number                         /** 供应商 ID */
    name: string                       /** 供应商名称 */
    baseUris: Array<{ protocol: string; url: string }>  /** API 地址列表 */
    apiKey: string                     /** 解密后的 API Key */
    models: Array<{ displayName: string; modelName: string }>  /** 模型列表 */
  } | null                             /** 供应商信息 */
}

/** 配置应用结果 */
interface ApplyLLMConfigResult {
  success: boolean                     /** 是否成功 */
  configPath?: string                  /** 写入的配置文件路径 */
  error?: string                       /** 失败原因 */
}

/** 供应商模板（预置数据，用于快速填充表单） */
interface ProviderTemplate {
  id: number                           /** 模板 ID */
  name: string                         /** 供应商名称 */
  logoUrl: string                      /** Logo 图片地址 */
  website: string                      /** 供应商官网 */
  description: string                  /** 供应商描述 */
  baseUris: Array<{ protocol: string; url: string }>  /** API 地址列表 */
}

/**
 * 微信扫码状态事件（与 src/wechat/login.ts 中的 QrScanStatus 对齐）
 * - wait: 等待扫码
 * - scaned: 已扫码，等待手机确认（UI 应在二维码上叠加"请在手机上确认绑定"遮罩）
 * - expired: 二维码已过期（autoRegenerate 启用时会随后推送 regenerated）
 * - regenerated: 已自动重新生成二维码，UI 应用新 qrcodeUrl 替换显示
 * - confirmed: 扫码确认成功
 */
type QrScanStatus =
  | { status: 'wait' }
  | { status: 'scaned' }
  | { status: 'expired' }
  | { status: 'regenerated'; qrcodeUrl: string; qrcodeId: string }
  | { status: 'confirmed'; account: { accountId: string; userId: string } }

/** Electron IPC API 接口（通过 window.electronAPI 访问） */
interface ElectronAPI {
  agent: {
    list: () => Promise<AgentInfo[]>
    getCurrent: () => Promise<AgentInfo | null>
    add: (config: AgentConfig) => Promise<AgentInfo>
    remove: (id: number) => Promise<boolean>
    update: (id: number, updates: Partial<AgentConfig>) => Promise<boolean>
    switch: (name: string) => Promise<boolean>
    scan: () => Promise<{ found: Array<{ entry: AgentRegistryEntry; path: string; version: string | null }>; notFound: AgentRegistryEntry[] }>
    rescan: () => Promise<AgentInfo[]>
    getRegistry: () => Promise<AgentRegistryEntry[]>
    getCommands: (agentCommand: string) => Promise<AgentCommand[]>
    /** 获取 Agent 运行时状态（当前 Agent + 所有 Agent 状态汇总） */
    getStatus: () => Promise<{ current: AgentInfo | null; all: AgentInfo[] }>
    /** 监听 Agent 状态变更事件（processing ↔ online） */
    onStatusChange: (callback: (data: { agentId: number; agentName: string; status: AgentStatus }) => void) => void
    /** 移除状态变更监听器 */
    removeStatusChangeListener: () => void
    // ── LLM 配置管理 ──
    /** 获取 Agent 关联的 LLM 配置 */
    getLLMConfig: (agentId: number) => Promise<AgentLLMConfigInfo | null>
    /** 更新 Agent 的 LLM 配置（关联供应商 + 模型配置） */
    updateLLMConfig: (data: {
      agentId: number
      llmProviderId: number | null
      modelConfig: { model: string; temperature?: number; maxTokens?: number } | null
      applyImmediately?: boolean
    }) => Promise<{ success: boolean; applyResult?: ApplyLLMConfigResult; error?: string }>
    /** 手动触发将 LLM 配置应用到 CLI 工具配置文件 */
    applyLLMConfig: (agentId: number) => Promise<ApplyLLMConfigResult>
    /** 批量应用所有已绑定 LLM 的 Agent 配置 */
    applyAllLLMConfigs: () => Promise<{ total: number; success: number; failed: number; error?: string }>
  }
  message: {
    send: (text: string, sessionId?: number, files?: Array<{ path: string; name: string }>) => Promise<{ success: boolean; content?: string; error?: string }>
    getHistory: (agentName: string, limit?: number, sessionId?: number) => Promise<AgentMessage[]>
    clear: (agentName: string, sessionId?: number) => Promise<boolean>
    search: (keyword: string) => Promise<AgentMessage[]>
    /** 消息统计（总数 + 按 Agent 分组） */
    getStats: () => Promise<{ total: number; byAgent: Record<string, number> }>
    getChatAgents: () => Promise<AgentInfo[]>
    getClawBotHistory: () => Promise<AgentMessage[]>
    sendClawBot: (text: string) => Promise<{ success: boolean; content?: string; error?: string }>
    /** 删除 Agent 的所有聊天记录（所有会话 + 消息） */
    deleteAgentChats: (agentId: number) => Promise<boolean>
    /** 导出单个会话为 Markdown 文件 */
    exportSession: (sessionId: number) => Promise<{ success: boolean; filePath?: string; error?: string }>
    /** 导出 Agent 所有对话为 Markdown 文件 */
    exportAgentChats: (agentId: number, agentName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    onAgentOutput: (callback: (data: { content: string; type: string; sessionId: number; agentName?: string }) => void) => void
    removeAgentOutputListener: () => void
  }
  session: {
    /** 获取 Agent 的所有会话（带预览信息） */
    list: (agentId: number) => Promise<SessionPreview[]>
    /** 创建新会话 */
    create: (agentId: number, title?: string) => Promise<SessionInfo>
    /** 删除会话（消息自动级联删除） */
    delete: (sessionId: number) => Promise<boolean>
    /** 重命名会话 */
    rename: (sessionId: number, title: string) => Promise<boolean>
    /** 切换当前会话 */
    switch: (sessionId: number) => Promise<boolean>
    /** 按 sessionId 加载消息 */
    getMessages: (sessionId: number, limit?: number) => Promise<AgentMessage[]>
    /** 更新会话工作目录 */
    updateCwd: (sessionId: number, cwd: string) => Promise<boolean>
  }
  store: {
    list: () => Promise<StoreItem[]>
    categories: () => Promise<StoreCategory[]>
  }
  /** 对话框操作 */
  dialog: {
    pickDirectory: () => Promise<string | null>
    openFiles: () => Promise<string[]>
  }
  wechat: {
    getStatus: () => Promise<{ connected: boolean; accountId?: string; userId?: string }>
    startLogin: () => Promise<{ success: boolean; qrcodeUrl?: string; qrcodeId?: string; error?: string }>
    waitForScan: (qrcodeId: string) => Promise<{ success: boolean; error?: string }>
    disconnect: () => Promise<{ success: boolean }>
    onSessionExpired: (callback: () => void) => void
    removeSessionExpiredListener: () => void
    onNewMessage: (callback: (data: any) => void) => void
    removeNewMessageListener: () => void
    /** 监听微信消息推送失败事件 */
    onSendError: (callback: (data: { error: string }) => void) => void
    removeSendErrorListener: () => void
    /** 监听扫码状态变更（wait/scaned/expired/regenerated/confirmed） */
    onScanStatus: (callback: (data: QrScanStatus) => void) => void
    removeScanStatusListener: () => void
    removeListeners: () => void
  }
  sync: {
    getStatus: () => Promise<SyncStatus>
    /** 读取已保存的同步配置（用于前端回显） */
    getConfig: () => Promise<WebDAVConfig | null>
    saveConfig: (config: WebDAVConfig) => Promise<{ success: boolean }>
    test: () => Promise<{ success: boolean; message?: string }>
    upload: () => Promise<boolean>
    download: () => Promise<boolean>
    fetchRemoteInfo: () => Promise<any>
  }
backup: {
create: () => Promise<string>
list: () => Promise<Array<{ filename: string; path: string; size: number; createdAt: Date }>>
restore: (backupPath: string) => Promise<boolean>
delete: (backupPath: string) => Promise<boolean>
}
  config: {
    get: () => Promise<AppConfig>
    update: (updates: Partial<AppConfig>) => Promise<AppConfig>
    pickDirectory: () => Promise<string | null>
  }
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
    quit: () => Promise<void>
    execCommand: (command: string, options?: { elevated?: boolean }) => Promise<{ success: boolean; error?: string }>
    openExternal: (url: string) => Promise<{ success: boolean }>
    /** 打开终端并显示登录提示（安装后引导用户登录/配置 API） */
    openTerminalForLogin: (hint: string, agentCommand: string) => Promise<{ success: boolean; error?: string }>
  }
  env: {
    check: () => Promise<Array<{ tool: string; installed: boolean; version?: string; installUrl?: string; installCmd?: string }>>
  }
  theme: {
    /** 设置应用主题（同步系统标题栏颜色），返回实际解析后的主题 */
    set: (theme: string) => Promise<{ success: boolean; resolvedTheme?: string }>
  }
  /** 窗口管理 */
  window: {
    /** 显示窗口并聚焦 */
    show: () => Promise<void>
    /** 隐藏窗口到托盘 */
    hide: () => Promise<void>
    /** 查询窗口是否可见 */
    isVisible: () => Promise<boolean>
  }
  /** 密码管理（API Key 加密） */
  masterPassword: {
    /** 检查是否已设置密码 */
    has: () => Promise<boolean>
    /** 检查当前是否已解锁（派生密钥在内存中） */
    isUnlocked: () => Promise<boolean>
    /** 设置密码（首次设置或重置），trustDevice 为是否信任此设备 */
    set: (password: string, trustDevice: boolean) => Promise<boolean>
    /** 用密码解锁，trustDevice 为是否记住密码（true=保存设备信任，false=清除，undefined=不变） */
    unlock: (password: string, trustDevice?: boolean) => Promise<boolean>
    /** 尝试从设备信任缓存恢复（应用启动时自动调用） */
    tryRestore: () => Promise<boolean>
    /** 锁定（清除内存中的派生密钥） */
    lock: () => Promise<boolean>
    /** 更改密码 */
    change: (oldPassword: string, newPassword: string, trustDevice: boolean) => Promise<{ success: boolean; error?: string }>
    /** 清除密码和设备信任数据（重置） */
    clear: () => Promise<boolean>
  }
  /** LLM 供应商管理（工具箱） */
  provider: {
    /** 获取所有供应商列表 */
    list: () => Promise<LlmProvider[]>
    /** 获取供应商详情（含模型列表和解密后的 API Key） */
    get: (id: number) => Promise<LlmProviderDetail | null>
    /** 新增供应商 */
    create: (data: {
      name: string
      description: string
      website: string
      logoUrl: string
      baseUris: Array<{ protocol: string; url: string }>
      apiKey: string
      models: Array<{ displayName: string; modelName: string }>
    }) => Promise<{ success: boolean; id?: number; error?: string }>
    /** 更新供应商 */
    update: (id: number, data: {
      name: string
      description: string
      website: string
      logoUrl: string
      baseUris: Array<{ protocol: string; url: string }>
      apiKey?: string
      models: Array<{ displayName: string; modelName: string }>
    }) => Promise<{ success: boolean; error?: string }>
    /** 删除供应商 */
    delete: (id: number) => Promise<{ success: boolean; error?: string }>
    /** 测试 API 连接 */
    test: (data: { protocol: string; baseUrl: string; apiKey: string; modelName: string }) => Promise<{ success: boolean; message?: string; error?: string }>
  }
  /** 供应商模板（预置数据，用于快速填充表单） */
  providerTemplate: {
    /** 搜索供应商模板（按关键词模糊匹配，空关键词返回全部） */
    search: (keyword: string) => Promise<ProviderTemplate[]>
  }
}

interface Window {
  electronAPI: ElectronAPI
}
