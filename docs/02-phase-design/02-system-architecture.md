# 系统架构设计文档 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 系统架构设计文档 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 架构概述

### 1.1 架构类型

采用 **Electron 主进程 + 渲染进程分离架构**，通过 IPC（进程间通信）实现数据交换。

### 1.2 技术栈

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 33 |
| 前端框架 | React 18 + TypeScript |
| 状态管理 | Zustand 5 |
| UI 组件 | Radix UI + Tailwind CSS |
| 数据库 | SQLite (sql.js) |
| 国际化 | i18next + react-i18next |
| 构建工具 | Vite + electron-vite |

---

## 2. 总体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        渲染进程 (Renderer)                   │
│  ┌────────────┬────────────┬────────────┬────────────────┐ │
│  │ NavSidebar │ ListPanel  │ ChatPage   │  Other Pages   │ │
│  │            │            │            │  (AgentManager │ │
│  │            │            │            │   StorePage)   │ │
│  └────────────┴────────────┴────────────┴────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Zustand Stores (状态管理)                  │ │
│  │  • useUIStore    • useAgentStore   • useChatStore      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Preload Script (Context Bridge)               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↕ IPC
┌─────────────────────────────────────────────────────────────┐
│                         主进程 (Main)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              IPC Handlers (300+ 行)                    │ │
│  │  • agent:*      • message:*      • session:*           │ │
│  │  • wechat:*     • sync:*         • config:*            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────┬──────────────────┬──────────────────┐ │
│  │  Agent Manager   │  Session Manager │   Sync Manager   │ │
│  │  (CRUD + 发送)   │  (会话 + 消息)   │  (微信集成)      │ │
│  └──────────────────┴──────────────────┴──────────────────┘ │
│                                                              │
│  ┌──────────────────┬──────────────────┬──────────────────┐ │
│  │   Database       │   WebDAV Sync    │   Crypto         │ │
│  │   (SQLite)       │   (云同步)       │   (加密)         │ │
│  └──────────────────┴──────────────────┴──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                        外部依赖                              │
│  ┌──────────────┬──────────────┬──────────────┐            │
│  │  Agent CLI   │  iLink API   │  WebDAV      │            │
│  │  (Claude/    │  (微信 Bot)  │  (云存储)    │            │
│  │   OpenCode)  │              │              │            │
│  └──────────────┴──────────────┴──────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 模块划分

### 3.1 主进程模块

#### 3.1.1 入口模块 (`src/main/index.ts`)

**职责**：
- 创建主窗口和托盘
- 注册所有 IPC 处理器
- 应用生命周期管理
- 数据库初始化
- Agent 扫描同步

**核心流程**：
```
app.whenReady()
  └─> initialize() (数据库)
  └─> agentManager.syncFromScan() (扫描 PATH)
  └─> agentManager.init() (初始化 Agent)
  └─> registerIpcHandlers() (注册 IPC)
  └─> createWindow() + createTray() (UI 初始化)
```

#### 3.1.2 Agent 管理模块 (`src/agent/`)

```
src/agent/
├── manager.ts          # Agent CRUD + 状态管理 + 消息发送
├── scanner.ts          # PATH 扫描 + 注册表读取
├── provider.ts         # Provider 工厂
├── types.ts            # 类型定义
└── providers/          # 具体实现
    ├── claude.ts       # Claude Code Provider
    ├── opencode.ts     # OpenCode Provider
    ├── codebuddy.ts    # CodeBuddy Provider
    └── generic.ts      # 通用 Provider
```

**核心职责**：
- `manager.ts`：Agent 的增删改查、状态切换、消息发送流式处理
- `scanner.ts`：扫描系统 PATH 发现 CLI 工具，读取注册表
- `provider.ts`：根据 ProviderType 创建对应的 Provider 实例
- `providers/`：各 CLI 的流式输出解析和调用逻辑

#### 3.1.3 微信集成模块 (`src/wechat/`)

```
src/wechat/
├── api.ts              # HTTP 客户端
├── login.ts            # 扫码登录
├── monitor.ts          # 消息长轮询
├── send.ts             # 回复消息
├── media.ts            # 图片/文件上传
├── accounts.ts         # 账号管理
├── crypto.ts           # 加解密
└── cdn.ts              # CDN 上传
```

**核心职责**：
- 集成 iLink Bot API 实现微信机器人
- 扫码登录流程
- 长轮询接收消息
- 命令路由 (`/agent`, `/clear`, `/help`)
- 调用 Agent 并流式回复

#### 3.1.4 会话管理模块 (`src/session.ts`)

**职责**：
- 会话 CRUD 操作
- 消息存储和检索
- 会话工作目录管理
- 消息导出（Markdown）
- 消息统计

#### 3.1.5 数据库模块 (`src/database/`)

```
src/database/
├── db.ts               # SQLite 连接 + 持久化 + 备份恢复
├── schema.sql          # 表结构定义
└── seed.sql            # 种子数据
```

**职责**：
- SQLite 连接管理
- 数据持久化
- 备份和恢复
- 配置读写

#### 3.1.6 同步模块 (`src/sync.ts`, `src/sync/webdav.ts`)

**职责**：
- 微信消息同步入口
- WebDAV 云同步实现
- 配置持久化

#### 3.1.7 加密模块 (`src/crypto/`)

**职责**：
- 主密码管理
- API Key AES-GCM 加密
- 设备信任缓存

### 3.2 渲染进程模块

#### 3.2.1 状态管理 (`renderer/stores/`)

```typescript
// useUIStore - UI 状态
interface UIStore {
  navActive: 'chat' | 'agent' | 'store' | 'settings'
  selectedItem: string | null
  theme: 'dark' | 'light' | 'system'
  language: 'zh-CN' | 'zh-TW' | 'en'
  panelWidth: number
  wechatConnected: boolean
}

// useAgentStore - Agent 状态
interface AgentStore {
  agents: AgentInfo[]
  currentAgent: AgentInfo | null
  registry: AgentRegistryEntry[]
  scanResults: AgentScanResult[]
}

// useChatStore - 聊天状态
interface ChatStore {
  sessions: Session[]
  currentSessionId: number | null
  messages: Message[]
  sending: boolean
  streamOutput: string
}
```

#### 3.2.2 组件树 (`renderer/components/`)

```
App.tsx
├── NavSidebar/          # 导航栏
│   ├── ChatIcon
│   ├── AgentIcon
│   ├── StoreIcon
│   └── SettingsIcon
├── ListPanel/           # 列表面板
│   ├── ChatList
│   ├── AgentList
│   ├── StoreList
│   └── SettingsList
├── ChatPage/            # 聊天页面
│   ├── MessageList
│   ├── InputArea
│   └── SessionToolbar
├── AgentManager/        # Agent 管理
│   ├── AgentForm
│   ├── AgentList
│   └── InstallGuide
├── StorePage/           # 商城页面
│   ├── CategoryList
│   └── ToolCard
└── Settings/            # 设置页面
    ├── ThemeSelector
    ├── LanguageSelector
    └── SyncConfig
```

---

## 4. IPC 通信设计

### 4.1 通信模式

采用 **Request-Response 模式**（主进程 `ipcMain.handle` + 渲染进程 `ipcRenderer.invoke`）

### 4.2 通道命名规范

```
{模块}:{操作}
示例：
- agent:list       # 获取 Agent 列表
- message:send     # 发送消息
- wechat:startLogin # 开始微信登录
- sync:upload      # 上传同步
```

### 4.3 数据流

```
渲染进程
  └─> window.electronAPI.agent.list()
      └─> ipcRenderer.invoke('agent:list')
          └─> 主进程 ipcMain.handle('agent:list')
              └─> 返回 JSON 数据
                  └─> 渲染进程接收
```

### 4.4 事件推送

主进程通过 `webContents.send` 向渲染进程推送事件：

```typescript
mainWindow.webContents.send('agent:statusChange', {
  agentId: 1,
  agentName: 'claude',
  status: 'processing'
})

// 渲染进程监听
window.electronAPI.onAgentStatusChange((data) => {
  console.log('Agent 状态变化:', data)
})
```

---

## 5. 数据流设计

### 5.1 Agent 切换流程

```
1. 用户点击 Agent 列表项
2. 渲染进程调用 agent:switch
3. 主进程更新 AgentManager 当前 Agent
4. 主进程通知渲染进程（事件推送）
5. 渲染进程更新 useAgentStore
6. 渲染进程加载该 Agent 的会话列表
7. 渲染进程创建/切换到最新会话
```

### 5.2 消息发送流程

```
1. 用户输入消息 + 回车
2. 渲染进程调用 message:send
3. 主进程获取当前 Agent
4. 主进程创建/切换会话
5. 主进程保存用户消息到数据库
6. 主进程调用 AgentManager.send()
7. 主进程流式接收 Agent 输出
8. 主进程逐字推送到渲染进程（事件推送）
9. 渲染进程逐字显示
10. 主进程保存完整回复到数据库
```

### 5.3 微信消息处理流程

```
1. 微信用户发送消息到机器人
2. iLink API 推送到长轮询
3. 主进程接收到消息
4. 主进程解析命令（/agent, /clear 等）
5. 主进程调用 AgentManager.send()
6. 主进程流式回复微信
7. 主进程保存消息到数据库（source='wechat'）
```

---

## 6. 安全设计

### 6.1 加密策略

- **算法**：AES-GCM（Authenticated Encryption）
- **密钥派生**：PBKDF2（主密码 → 加密密钥）
- **加密对象**：API Key、设备信任缓存
- **密钥存储**：内存中，应用退出清除

### 6.2 权限控制

- 主密码保护：查看/修改 API Key 需要先解锁
- 托盘操作：托盘菜单仅显示基本功能
- 文件访问：使用 Electron dialog 选择文件

### 6.3 数据隔离

- 每个独立会话拥有独立的消息记录
- Agent 配置与会话数据分离
- 敏感信息加密存储

---

## 7. 性能优化

### 7.1 数据库优化

- 使用 sql.js 内存数据库，快速读写
- 定期保存到磁盘（每次关键操作后）
- 建立索引：`sessions.agent_id`, `messages.session_id`

### 7.2 流式输出

- Agent 输出逐字推送，减少延迟
- 渲染进程使用 React 渲染优化（React.memo）

### 7.3 资源管理

- 子进程超时控制（5 分钟）
- 长轮询指数退避（连接失败后）
- 托盘最小化减少内存占用

---

## 8. 扩展性设计

### 8.1 Provider 扩展

新增 Agent Provider 只需：

1. 在 `src/agent/providers/` 创建新文件
2. 实现 `AgentProvider` 接口
3. 在 `provider.ts` 中注册
4. 在 `agent_registry` 表中添加配置

### 8.2 插件系统（规划中）

- 支持第三方开发 Agent 插件
- 插件目录：`~/.wechat-link-agent/plugins/`
- 插件清单：`plugin.json`

---

## 9. 部署架构

### 9.1 打包配置

使用 electron-builder 打包：

```yaml
# electron-builder.yml
appId: com.wechatlinkagent.app
productName: WLA
directories:
  output: release
files:
  - dist/**
  - node_modules/**/*
```

### 9.2 支持平台

- Windows: NSIS 安装包 + 便携版
- macOS: DMG + APP
- Linux: AppImage + DEB

---

*本文档为核心架构规范，详细技术细节请参考各模块源代码*