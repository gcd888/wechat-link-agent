# 术语表 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 术语表 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-05-01 |
| 关联文档 | [高层架构设计](./05-high-level-architecture.md)、[系统设计](./06-system-design.md) |

---

## 1. 核心术语

| 术语 | 英文 | 含义 |
|------|------|------|
| 微连 | WeChat Link Agent (WLA) | 项目名称，微信万能 Agent 遥控器 |
| Agent | Agent | AI 编程助手 CLI 工具（如 Claude Code、OpenCode） |
| Provider | Provider | Agent 的适配器实现，封装不同 CLI 的调用和输出解析逻辑 |
| 会话 | Session | 用户与 Agent 之间的一次对话上下文 |
| 消息 | Message | 会话中的一条聊天记录，角色为 user/assistant/system |
| 主进程 | Main Process | Electron 主进程，负责窗口管理、IPC、数据库、子进程 |
| 渲染进程 | Renderer Process | Electron 渲染进程，运行 React 应用，负责 UI 渲染 |
| IPC | Inter-Process Communication | 主进程与渲染进程间的进程间通信 |
| Preload | Preload Script | 预加载脚本，通过 contextBridge 暴露 electronAPI |

---

## 2. 微信集成术语

| 术语 | 英文 | 含义 |
|------|------|------|
| iLink Bot | iLink Bot | 第三方微信机器人 API 服务 |
| 长轮询 | Long Polling | 微信消息接收机制，服务端保持连接直到有消息或超时 |
| 扫码登录 | QR Login | 通过微信扫描二维码完成身份认证 |
| bot_token | Bot Token | iLink Bot API 的访问令牌 |
| 命令路由 | Command Router | 微信消息中斜杠命令（/agent、/clear 等）的路由处理 |
| safeStorage | Safe Storage | Electron 提供的系统级安全存储（用于加密 bot_token 和 WebDAV 密码） |

---

## 3. 安全术语

| 术语 | 英文 | 含义 |
|------|------|------|
| 主密码 | Master Password | 用户设置的密码，用于通过 PBKDF2 派生加密密钥 |
| PBKDF2 | PBKDF2 | Password-Based Key Derivation Function 2，密钥派生算法 |
| AES-GCM | AES-256-GCM | 高级加密标准 - 伽罗瓦/计数器模式，用于 API Key 加密 |
| IV | Initialization Vector | 初始化向量，每次加密生成随机值 |
| Auth Tag | Authentication Tag | GCM 模式的认证标签，用于验证密文完整性 |
| 设备信任 | Device Trust | 可选功能，将派生密钥缓存到本地文件，免重复输入密码 |
| 加密密钥 | Encryption Key | 从主密码派生的 32 字节密钥，仅存内存，退出清除 |

---

## 4. 架构术语

| 术语 | 英文 | 含义 |
|------|------|------|
| Zustand | Zustand | React 状态管理库，微连使用三个独立 Store |
| sql.js | sql.js | SQLite 的 WebAssembly 编译版，在浏览器/Node.js 中运行 |
| electron-vite | electron-vite | Electron 专用 Vite 构建工具 |
| electron-builder | electron-builder | Electron 应用打包工具 |
| 热重载 | HMR (Hot Module Replacement) | 开发时代码修改自动刷新，不重启应用 |
| contextBridge | Context Bridge | Electron 安全机制，在隔离的上下文间暴露 API |

---

## 5. 数据库术语

| 术语 | 英文 | 含义 |
|------|------|------|
| 种子数据 | Seed Data | 应用初始化时插入的预置数据（agent_registry、store_items 等） |
| Schema | Schema | 数据库表结构定义（schema.sql） |
| 持久化 | Persistence | 内存数据库写入磁盘文件的过程 |
| 级联删除 | CASCADE Delete | 外键关联的级联删除策略（如删除 Session 自动删除其 Messages） |
| CHECK 约束 | CHECK Constraint | 字段值约束（如 role 只能为 user/assistant/system） |

---

## 6. 开发流程术语

| 术语 | 英文 | 含义 |
|------|------|------|
| Conventional Commits | Conventional Commits | 提交消息规范（feat/fix/docs/style/refactor/test/chore） |
| SemVer | Semantic Versioning | 语义化版本号（MAJOR.MINOR.PATCH） |
| CI | Continuous Integration | 持续集成，PR 自动检查类型和构建 |
| CD | Continuous Delivery | 持续交付，tag 推送自动构建发布 |
| PR | Pull Request | 代码合并请求 |
| Code Review | Code Review | 代码审查 |

---

## 7. 文档关联

| 文档 | 关系 |
|------|------|
| [高层架构设计](./05-high-level-architecture.md) | 业务边界与 MVP 范围 |
| [系统设计](./06-system-design.md) | 限界上下文与模块映射 |
| [ADR 集](./07-adr.md) | 架构决策记录 |
| [编码规范](../03-phase-development/02-coding-standards.md) | 代码规范与 Git 策略 |

---

*最后更新：2026-07-20*
