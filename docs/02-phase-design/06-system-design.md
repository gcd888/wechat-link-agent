# 系统设计 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 系统设计 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-05-01 |
| 关联文档 | [高层架构设计](./05-high-level-architecture.md)、[ADR 集](./07-adr.md)、[数据字典](./08-data-dictionary.md) |

---

## 1. 限界上下文划分

基于领域驱动设计（DDD），微连系统划分为 7 个限界上下文：

```
┌─────────────────────────────────────────────────────────────┐
│                     微连限界上下文地图                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Agent 管理    │  │  会话管理     │  │  消息处理     │      │
│  │ (Agent BC)   │  │ (Session BC) │  │ (Message BC) │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐      │
│  │  微信集成     │  │  配置管理     │  │  数据同步     │      │
│  │ (WeChat BC)  │  │ (Config BC)  │  │  (Sync BC)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐                                          │
│  │  安全加密     │  ← 横切关注点，为所有 BC 提供加密服务       │
│  │ (Security BC)│                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 各限界上下文详情

| 上下文 | 聚合根 | 核心实体 | 代码位置 | 数据库表 |
|--------|--------|----------|----------|----------|
| Agent 管理 | AgentManager | Agent, AgentRegistry, Provider | `src/agent/` | agent_registry, agents, agent_install_commands, agent_commands |
| 会话管理 | SessionManager | Session | `src/session.ts` | sessions |
| 消息处理 | MessageService | Message | `src/session.ts` | messages |
| 微信集成 | WeChatMonitor | WeChatAccount, WeChatMessage | `src/wechat/` | accounts |
| 配置管理 | ConfigService | AppConfig | `src/database/db.ts` | app_config, sync_config |
| 数据同步 | SyncManager | SyncConfig | `src/sync.ts`, `src/sync/webdav.ts` | sync_config |
| 安全加密 | CryptoService | MasterPassword, EncryptedKey | `src/wechat/crypto.ts` | llm_providers (加密字段) |

### 1.2 上下文映射

| 上游 | 下游 | 关系类型 | 通信方式 |
|------|------|----------|----------|
| Agent 管理 | 消息处理 | 消费者-供应商 | 函数调用（主进程内） |
| 微信集成 | 消息处理 | 消费者-供应商 | 事件回调 |
| 消息处理 | 会话管理 | 依赖 | 函数调用 |
| 配置管理 | 所有上下文 | 共享内核 | 数据库读取 |
| 安全加密 | Agent 管理, 微信集成 | 横切服务 | 函数调用 |
| 数据同步 | 配置管理, 会话管理 | 防腐层 | 文件系统操作 |

---

## 2. 数据库表与领域模型映射

### 2.1 实体关系总览

```
agent_registry (1)─────(1) agents (1)─────(N) sessions (1)─────(N) messages
     │                      │
     │ (1:N)                │ (N:1)
     │                      │
agent_install_commands    llm_providers (1)─────(N) llm_models
agent_commands

app_config (独立)     sync_config (独立)     accounts (独立)

store_categories (1)─────(N) store_items

provider_templates (独立，模板数据)
```

### 2.2 表与领域模型对应

| 数据库表 | 领域模型 | 所属上下文 | 说明 |
|----------|----------|------------|------|
| `agent_registry` | AgentRegistryEntry | Agent 管理 | 静态种子数据，定义所有已知 Agent CLI |
| `agent_install_commands` | InstallCommand | Agent 管理 | 按平台存储安装/卸载命令 |
| `agents` | Agent | Agent 管理 | 运行时实例，PATH 扫描动态填充 |
| `agent_commands` | AgentSlashCommand | Agent 管理 | 各 Agent 支持的斜杠命令 |
| `sessions` | Session | 会话管理 | 对话会话，关联 Agent |
| `messages` | Message | 消息处理 | 聊天消息，关联 Session |
| `accounts` | WeChatAccount | 微信集成 | 微信 iLink Bot 认证凭证 |
| `app_config` | AppConfig | 配置管理 | 应用配置 key-value 存储 |
| `sync_config` | SyncConfig | 数据同步 | WebDAV 同步配置 |
| `llm_providers` | LLMProvider | 安全加密 | LLM 供应商（API Key 加密存储） |
| `llm_models` | LLMModel | 安全加密 | LLM 模型配置 |
| `provider_templates` | ProviderTemplate | 配置管理 | 供应商模板（预置数据） |
| `store_categories` | StoreCategory | 配置管理 | 商城分类 |
| `store_items` | StoreItem | 配置管理 | 商城商品 |

---

## 3. IPC 契约总览

### 3.1 通信架构

```
渲染进程 (Renderer)
    │
    │  window.electronAPI.xxx()  ←→  ipcRenderer.invoke()
    │
    ▼ IPC Bridge (Preload contextBridge)
    │
    │  ipcMain.handle()
    │
主进程 (Main)
    │
    ├── Agent Manager ──→ Provider ──→ Agent CLI (子进程)
    ├── Session Manager ──→ Database (SQLite)
    ├── WeChat Monitor ──→ iLink Bot API (HTTP)
    ├── Sync Manager ──→ WebDAV (HTTP)
    └── Crypto Service ──→ safeStorage / PBKDF2
```

### 3.2 通道命名规范

```
{模块}:{操作}

agent:list       agent:switch      agent:scan       agent:rescan
message:send     message:getHistory  message:clear
session:list     session:create    session:delete   session:switch
wechat:startLogin  wechat:disconnect  wechat:getStatus
sync:upload      sync:download     sync:saveConfig  sync:test
config:get       config:update
provider:list    provider:create   provider:test    provider:delete
masterPassword:set  masterPassword:unlock  masterPassword:lock
```

### 3.3 事件推送（主进程 → 渲染进程）

| 事件通道 | 触发时机 | 数据结构 |
|----------|----------|----------|
| `agent:statusChange` | Agent 状态变化 | `{ agentId, agentName, status }` |
| `message:agentOutput` | Agent 流式输出 | `{ content, type, sessionId, agentName }` |

> 完整 IPC 接口定义请参考 [IPC 接口设计文档](./04-ipc-api.md)。

---

## 4. 部署形态

### 4.1 运行时架构

```
┌─────────────────────────────────────────────────┐
│              Electron 桌面应用                    │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │         主进程 (Node.js 环境)            │    │
│  │                                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌────────┐ │    │
│  │  │ Agent   │  │ WeChat  │  │ Sync   │ │    │
│  │  │ Manager │  │ Monitor │  │ Manager│ │    │
│  │  └────┬────┘  └────┬────┘  └───┬────┘ │    │
│  │       │            │           │       │    │
│  │  ┌────▼────────────▼───────────▼────┐ │    │
│  │  │      SQLite (sql.js 内存数据库)    │ │    │
│  │  │      文件持久化: ~/.wechat-link-   │ │    │
│  │  │      agent/wla.db                 │ │    │
│  │  └───────────────────────────────────┘ │    │
│  └─────────────────────────────────────────┘    │
│                      ↕ IPC                      │
│  ┌─────────────────────────────────────────┐    │
│  │       渲染进程 (Chromium + React)        │    │
│  │                                         │    │
│  │  Zustand Stores ──→ React Components    │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
          │                    │              │
          ▼                    ▼              ▼
    Agent CLI 子进程      iLink Bot API    WebDAV 服务器
    (本地进程)           (HTTP 长轮询)     (HTTP PUT/GET)
```

### 4.2 数据流路径

| 数据流 | 来源 | 目标 | 传输方式 |
|--------|------|------|----------|
| 用户消息 | 微信/iLink API | 主进程 → Agent CLI | HTTP 长轮询 → 子进程 stdin |
| Agent 回复 | Agent CLI stdout | 主进程 → 微信 | 子进程 stdout → HTTP POST |
| 状态推送 | 主进程 | 渲染进程 | webContents.send() |
| 数据持久化 | 主进程 | 本地文件 | SQLite → fs.writeFile() |
| 云同步 | 本地数据库 | WebDAV 服务器 | HTTP PUT |

---

## 5. 关联文档

| 文档 | 关系 |
|------|------|
| [高层架构设计](./05-high-level-architecture.md) | 业务边界与 MVP 范围 |
| [系统架构设计](./02-system-architecture.md) | 技术架构详情 |
| [数据库设计说明书 (DDL)](./03-database-ddl.md) | 完整表结构定义 |
| [IPC 接口设计](./04-ipc-api.md) | 完整 IPC 接口列表 |
| [数据字典](./08-data-dictionary.md) | 字段级说明与索引策略 |
| [ADR 集](./07-adr.md) | 架构决策记录 |

---

*最后更新：2026-07-20*
