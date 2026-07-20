# 架构决策记录 (ADR) - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 架构决策记录 (Architecture Decision Records) |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-05-01 |
| 关联文档 | [高层架构设计](./05-high-level-architecture.md)、[系统设计](./06-system-design.md) |

---

## 概述

本文档记录微连项目中的关键架构决策（ADR），以现有代码为事实基准，将技术选型和设计决策固化为可追溯的记录。

### ADR 格式

每条 ADR 包含：状态、日期、背景、决策、影响。

---

## ADR-001: Electron + React 技术选型

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-01 |

**背景**：微连需要跨平台桌面应用，同时管理本地子进程（Agent CLI）和 HTTP 连接（微信 API）。需要丰富的 UI 交互和流式输出渲染。

**决策**：采用 Electron 33 + React 18 + TypeScript 技术栈。

**影响**：
- 优势：跨平台一致、Node.js 生态完整、React 组件化开发效率高
- 代价：应用体积较大（~150MB）、内存占用偏高（~300MB）
- 替代方案（Tauri）当时生态不够成熟，放弃

---

## ADR-002: SQLite (sql.js) 内存数据库

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-15 |

**背景**：需要本地数据持久化（会话、消息、配置），同时要求零安装依赖、跨平台兼容。

**决策**：使用 sql.js（SQLite WebAssembly 编译版），数据库在内存中运行，关键操作后写入磁盘文件。

**影响**：
- 优势：无需安装原生 SQLite、跨平台一致、读写速度快
- 代价：全量数据加载到内存、持久化需手动调用 `saveDb()`
- 数据库文件路径：`~/.wechat-link-agent/wla.db`

---

## ADR-003: Zustand 状态管理

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-15 |

**背景**：React 渲染进程需要管理 UI 状态（导航、主题）、Agent 状态（列表、当前 Agent）和聊天状态（消息、流式输出）。

**决策**：使用 Zustand 5 而非 Redux/Context API。

**影响**：
- 优势：API 简洁（无 boilerplate）、性能好（选择性订阅）、包体积小
- 三个 Store 分离：`useUIStore`、`useAgentStore`、`useChatStore`
- 面板拖拽通过 DOM 操作 CSS 变量实现，不触发 React 重渲染

---

## ADR-004: Provider 模式 Agent 架构

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-20 |

**背景**：不同 AI Agent CLI（Claude Code、OpenCode、CodeBuddy 等）的调用方式和输出格式各不相同，需要统一接口。

**决策**：采用 Provider 模式，定义 `AgentProvider` 接口，每个 CLI 对应一个 Provider 实现。

**影响**：
- 新增 Agent 只需创建 Provider 文件 + 注册 + 添加种子数据
- Provider 类型：`claude | opencode | codebuddy | codex | mimo | trae | generic`
- `generic` Provider 直接返回原始输出，作为兜底
- Provider 负责解析流式输出格式（SSE / 纯文本 / JSON）

---

## ADR-005: iLink Bot API 微信集成

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-20 |

**背景**：微信没有官方开放接口供第三方机器人使用。需要通过第三方服务实现消息收发。

**决策**：集成 iLink Bot API，通过 HTTP 长轮询接收消息，HTTP POST 发送回复。

**影响**：
- 依赖第三方服务稳定性，存在接口变更风险
- 需要用户自行获取 iLink Bot 访问令牌
- bot_token 使用 Electron safeStorage 加密存储
- 长轮询采用指数退避策略（失败后逐步延长间隔）

---

## ADR-006: AES-GCM 加密方案

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-05-01 |

**背景**：用户 API Key 等敏感信息需要本地加密存储，防止数据库文件泄露导致密钥暴露。

**决策**：采用 AES-256-GCM 对称加密，加密密钥通过 PBKDF2 从用户主密码派生。

**影响**：
- 加密参数：PBKDF2 100,000 次迭代、SHA-256、32 字节密钥
- 每次加密生成随机 IV（16 字节）和 Auth Tag
- 设备信任：可选保存派生密钥到 `~/.wechat-link-agent/.trust` 文件
- 忘记主密码 = 丢失所有加密数据（无法恢复）

---

## ADR-007: WebDAV 云同步策略

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-05-01 |

**背景**：用户可能有多台电脑，需要在不同设备间同步会话历史和配置。

**决策**：采用 WebDAV 协议同步整个数据库文件，而非增量同步单条记录。

**影响**：
- 优势：实现简单（上传/下载整个 .db 文件）、一致性保证
- 代价：全量传输、无冲突合并（后上传覆盖先上传）
- 下载前自动创建本地备份，防止数据丢失
- 支持坚果云、自建 WebDAV 等标准服务

---

## ADR-008: IPC 通信架构

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-15 |

**背景**：Electron 主进程与渲染进程需要大量数据交换，包括 CRUD 操作和流式输出推送。

**决策**：采用 Request-Response 模式（`ipcMain.handle` + `ipcRenderer.invoke`），流式输出通过 `webContents.send` 事件推送。

**影响**：
- 通道命名规范：`{模块}:{操作}`（如 `agent:list`、`message:send`）
- Preload 通过 `contextBridge` 暴露 `window.electronAPI`
- 所有 IPC 返回统一格式：`{ success: boolean, data?, error? }`
- 流式输出通过 `message:agentOutput` 事件增量推送

---

## ADR-009: 简化版 Git Flow 分支模型

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-06-01 |

**背景**：项目初期为单人开发，不需要完整的 Git Flow（develop/release/hotfix 分支），但仍需保持主分支稳定。

**决策**：采用简化版 Git Flow：`master`（稳定发布）+ `dev`（开发集成）+ `feature/*`（功能分支）。

**影响**：
- `master` 分支保护，仅通过 PR 合并
- `dev` 分支为日常开发集成
- 功能分支从 `dev` 检出，完成后 PR 回 `dev`
- 发布时 `dev` → `master`，打 tag 触发自动构建
- 不使用完整的 Git Flow（无 develop/release/hotfix 分支）

---

## ADR-010: Conventional Commits 提交规范

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-06-01 |

**背景**：需要规范的提交历史，便于生成 CHANGELOG 和版本管理。

**决策**：遵循 Conventional Commits 规范。

**影响**：
- 格式：`type(scope): description`
- 类型：`feat | fix | docs | style | refactor | test | chore`
- PR 标题同样遵循此规范
- CI 检查在 PR 合并前自动运行类型检查和构建验证

---

## ADR-011: CI/CD 双平台发布策略

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-06-15 |

**背景**：国内用户访问 GitHub 较慢，需要同时发布到 GitHub 和 Gitee 两个平台。

**决策**：采用 GitHub Actions 自动化构建发布，推送 tag 触发三平台打包 + 双平台 Release。

**影响**：
- 三个工作流：CI 检查（`ci.yml`）、构建发布（`build.yml`）、代码同步（`sync-to-gitee.yml`）
- 推送 `v*` tag 自动触发三平台（Windows/macOS/Linux）并行构建
- 构建产物上传到 GitHub Releases + Gitee Releases
- 日常 push 自动同步代码到 Gitee 镜像

---

## ADR-012: i18next 国际化方案

| 字段 | 内容 |
|------|------|
| 状态 | 接受 |
| 日期 | 2026-04-15 |

**背景**：应用需要支持简体中文、繁体中文和英文三种语言。

**决策**：使用 i18next + react-i18next 实现国际化。

**影响**：
- 自定义 `useT()` hook，支持 fallback 值：`t('key', '默认值')`
- 语言检测：浏览器偏好 → localStorage 持久化
- 商城分类和 Agent 斜杠命令支持多语言（`name_zh` / `name_tw` / `name_en`）
- 主题切换时同步更新系统标题栏颜色

---

## 关联文档

| 文档 | 关系 |
|------|------|
| [高层架构设计](./05-high-level-architecture.md) | 业务边界 |
| [系统设计](./06-system-design.md) | 限界上下文与模块映射 |
| [编码规范](../03-phase-development/02-coding-standards.md) | Git 分支策略与提交规范 |
| [贡献指南](../03-phase-development/04-contributing.md) | PR 流程与 CI 门禁 |

---

*最后更新：2026-07-20*
