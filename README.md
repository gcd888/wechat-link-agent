<p align="center">
  <img src="https://img.gcd888.cc.cd/rest/WeChat-Link-Agent/logo.png" alt="微连 Logo" width="120" />
</p>

<h1 align="center">微连 (WeChat Link Agent)</h1>

<p align="center">
  <strong>微信万能 Agent 遥控器 — 在微信里切换和调用电脑上的各种 AI Agent CLI</strong>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-功能特性">功能特性</a> ·
  <a href="#-微信命令">微信命令</a> ·
  <a href="#-微信接入说明">微信接入</a> ·
  <a href="#-技术栈">技术栈</a> ·
  <a href="#-项目结构">项目结构</a> ·
  <a href="#-开发指南">开发指南</a> ·
  <a href="#-打包构建">打包构建</a> ·
  <a href="#-相关文档">相关文档</a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.0.1-blue" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6" />
</p>

---

## 📖 项目简介

**微连** 是一款 Electron 桌面应用，通过将微信与电脑上的 AI Agent CLI 工具（如 Claude Code、OpenCode、CodeBuddy 等）连接，让用户可以在微信中远程操控这些 AI 编程助手。

### 解决什么问题？

- **空间限制**：主流 AI 编程助手必须坐在电脑前使用，微连让你随时随地通过微信操控
- **工具分散**：不同 AI 工具各有优缺点，微连将它们聚合在一个平台，支持一键切换
- **远程场景**：外出时也能利用家里高性能电脑和已配置好的 AI 环境
- **多 Agent 协作**：支持多 Agent 串并行调度，按设计→开发→审查→部署分工协作，一句话编排完整研发流水线

### 核心价值

> **微信即遥控，万物皆可连**

让每个开发者的微信都成为 AI 编程助手的远程控制台。

---

## ✨ 功能特性

### 🤖 Agent 管理

- **自动扫描**：启动时自动扫描系统 PATH，发现已安装的 CLI 工具
- **一键切换**：在微信中通过 `/claude`、`/opencode` 等命令快速切换 Agent
- **多 Agent 调度**：支持串并行调度、分批/汇总返回，按角色分工协作
- **安装引导**：提供一键安装脚本（npm / pnpm / brew）
- **Provider 扩展**：内置 Claude / OpenCode / CodeBuddy / 通用 Provider，可自定义扩展

### 💬 微信集成

- **扫码登录**：基于 iLink Bot API，扫码即连
- **实时通信**：长轮询接收消息，Agent 流式输出实时推送
- **多媒体支持**：支持图片、文件上传
- **命令路由**：丰富的斜杠命令体系（详见下方）

### 🗂️ 会话管理

- 多会话独立隔离，每个 Agent 拥有专属历史
- 消息持久化存储，支持重命名、删除
- 导出 Markdown 格式

### 🔧 配置中心

- **主题**：深色 / 浅色 / 跟随系统
- **语言**：简体中文 / 繁体中文 / 英文
- **系统集成**：托盘最小化、开机自启
- **安全**：主密码保护，API Key 加密存储

### ☁️ 数据同步

- WebDAV 云同步备份与恢复
- 本地备份 + 自动定时同步（可选）

### 🛠️ 工具箱

- LLM 供应商管理（增删改查）
- API Key 本地 AES-GCM 加密
- 模型参数配置（temperature、maxTokens 等）
- Agent 与 LLM 供应商灵活关联

### 🏪 商城

- 按分类浏览合作 AI 工具
- 工具详情、安装链接、关键词搜索

---

## 📱 微信命令

在微信中发送以 `/` 开头的命令即可控制 Agent。直接发送普通文本（不带 `/`）即可与当前 Agent 对话，无需命令前缀。

### 基础命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/wlh` | 显示帮助信息 | `/wlh` |
| `/wla` | 查看所有 Agent 状态 | `/wla` |
| `/wls` | 查看当前状态 | `/wls` |
| `/version` | 查看版本号 | `/version` |
| `/stop` | 终止当前任务 | `/stop` |

### 会话与配置命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/wlc` | 清除对话历史 | `/wlc` |
| `/history [数量]` | 查看最近 N 条消息（默认 10） | `/history 20` |
| `/model [名称]` | 切换/查看当前模型 | `/model claude-sonnet-4-20250514` |
| `/cwd [路径]` | 切换/查看工作目录 | `/cwd ~/projects/demo` |

### Agent 调度命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/<agent> <内容>` | 切换到指定 Agent 并发送 | `/claude 帮我写个排序函数` |
| `/<a> <内容1> /<b> <内容2>` | 多 Agent 并行，汇总返回 | `/claude 审查代码 /opencode 优化性能` |
| `/s /<a> <内容1> /<b> <内容2>` | 多 Agent 并行，分批返回 | `/s /claude 审查代码 /opencode 优化性能` |
| `/<a>:1 <内容1> /<b>:2 <内容2>` | 多 Agent 串行，按序号执行 | `/claude:1 写个函数 /opencode:2 优化它` |
| `/all <内容>` | 向所有 Agent 并行发送同一问题 | `/all 这段代码有什么问题` |

---

## 📡 微信接入说明

### 安全无封号风险

微连通过微信官方提供的 **iLink Bot API** 接入微信，**不使用任何逆向、Hook 或非官方协议**，因此不存在封号风险。

### 工作原理

1. **官方扫码授权**：调用微信官方接口生成二维码，用户手机扫码确认后获取 Bot Token
2. **长轮询收消息**：通过官方 `getUpdates` 接口长轮询拉取新消息（非主动监听，服务端推送模式）
3. **官方接口发消息**：通过官方 `sendMessage` 接口回复消息（支持文本、图片、语音、视频、文件）
4. **CDN 媒体传输**：媒体文件通过微信官方 CDN 上传/下载，全程 AES-128-ECB 加密

> 所有接口均基于微信官方 iLink Bot API，完整接口文档详见 [微信 iLink Bot API 接口文档](docs/02-phase-design/10-wechat-ilink-bot-api.md)。

---

## 🏗️ 技术栈

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Electron 33 + electron-builder |
| 前端 | React 18 + TypeScript 5.7 + Vite 6 |
| UI | Tailwind CSS 3 + Radix UI + Lucide Icons |
| 状态管理 | Zustand 5 |
| 数据存储 | SQLite (sql.js) + WebDAV 云同步 |
| 国际化 | i18next + react-i18next |

---

## 📂 项目结构

```
wechat-link-agent/
├── src/                        # Electron 主进程
│   ├── main/                   # 窗口/托盘/IPC 注册、应用启动入口
│   ├── preload/                # preload 脚本（contextBridge）
│   ├── agent/                  # Agent 管理核心（扫描、Provider 工厂、CLI 实现）
│   ├── wechat/                 # 微信 iLink Bot API 集成（登录/监听/发送/媒体）
│   ├── commands/               # 微信端命令路由
│   ├── database/               # SQLite 数据库（连接/Schema/种子数据）
│   ├── crypto/                 # AES-GCM 加密模块
│   ├── sync/                   # 数据同步（WebDAV）
│   └── utils/                  # 工具函数（子进程/消息拆分/日志过滤）
│
├── renderer/                   # Electron 渲染进程（React）
│   ├── App.tsx                 # 根组件 - 三栏布局
│   ├── stores/                 # Zustand 状态管理（UI / Agent / Chat）
│   ├── components/             # UI 组件（导航/列表/聊天/管理/商城/设置等）
│   ├── i18n/                   # 国际化（zh-CN / zh-TW / en）
│   └── styles/                 # 全局样式 + 主题变量
│
├── build/                      # 打包资源（图标等）
├── docs/                       # 项目文档
├── electron-builder.yml        # 打包配置
├── vite.config.ts              # Vite 配置
└── package.json
```

## 🖥️ 界面布局

<table>
  <tr>
    <th width="90" align="center">导航栏<br/><sub>60px 固定</sub></th>
    <th align="center">列表面板<br/><sub>200-500px 可拖拽</sub></th>
    <th align="center">内容区域<br/><sub>flex: 1 自适应</sub></th>
  </tr>
  <tr>
    <td align="center" valign="top">聊天</td>
    <td valign="top">会话列表</td>
    <td valign="top">聊天界面</td>
  </tr>
  <tr>
    <td align="center" valign="top">Agent 管理</td>
    <td valign="top">Agent 列表</td>
    <td valign="top">Agent 管理详情</td>
  </tr>
  <tr>
    <td align="center" valign="top">工具箱</td>
    <td valign="top">LLM 供应商列表</td>
    <td valign="top">供应商配置详情</td>
  </tr>
  <tr>
    <td align="center" valign="top">商城</td>
    <td valign="top">商城分类</td>
    <td valign="top">商城页</td>
  </tr>
  <tr>
    <td align="center" valign="top">设置</td>
    <td valign="top">设置项列表</td>
    <td valign="top">设置页</td>
  </tr>
</table>

---

## 🚀 快速开始

### 普通用户

1. **下载安装包**：前往 [Releases 页面](https://github.com/gcd888/wechat-link-agent/releases) 下载对应平台的安装包

   | 平台 | 格式 | 架构 |
   |------|------|------|
   | Windows | NSIS 安装包 (.exe) | x64 |
   | macOS | DMG | x64, arm64 |
   | Linux | AppImage | x64 |

2. **安装运行**：双击安装包，按提示完成安装后启动微连

3. **绑定微信**：在设置页点击「微信绑定」，用手机微信扫码完成连接

   > 📷 *截图待补充*

4. **安装 Agent CLI**（可选）：微连会自动扫描系统 PATH 中已安装的 AI Agent CLI，也可在 Agent 管理页点击安装引导

   > 📷 *截图待补充*

5. **开始对话**：在微信中直接发送消息即可与当前 Agent 对话，或使用 `/` 命令切换 Agent

   > 📷 *截图待补充*

---

### 开发者构建

适用于需要从源码构建或参与开发的用户。

#### 环境要求

- **Node.js** v18+
- **npm** v9+（或 pnpm / yarn）
- **操作系统**：Windows 10+ / macOS 12+ / Linux (Ubuntu 20.04+)

#### 从源码构建

```bash
# 1. 克隆仓库
git clone https://github.com/gcd888/wechat-link-agent.git
cd wechat-link-agent

# 2. 安装依赖
npm install

# 3. 开发模式（热重载）
npm run dev

# 4. 构建生产产物并打包
npm run prod
```

> 打包产物输出到 `release/` 目录，打包配置详见 `electron-builder.yml`。

#### 其他命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建生产产物（electron-vite build） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run preview` | 预览构建产物 |

---

## 🛠️ 开发指南

### 架构要点

- **主进程 / 渲染进程分离**：通过 IPC（`ipcMain.handle` + `ipcRenderer.invoke`）通信
- **状态管理**：使用 Zustand，三个独立 Store 各司其职（UI / Agent / Chat）
- **数据库**：SQLite (sql.js) 内存数据库，数据存储于 `~/.wechat-link-agent/wla.db`
- **Agent Provider 模式**：每种 CLI 工具实现 `AgentProvider` 接口，支持流式输出解析

### 新增 Agent Provider

1. 在 `src/agent/providers/` 创建新文件
2. 实现 `AgentProvider` 接口
3. 在 `provider.ts` 中注册
4. 在 `agent_registry` 种子数据中添加配置

详细开发规范请参考 [编码规范文档](docs/03-phase-development/02-coding-standards.md)。

---

## 🔒 安全设计

- **API Key 加密**：使用 AES-GCM 算法本地加密存储，密钥通过 PBKDF2 从主密码派生
- **主密码保护**：查看 / 修改 API Key 需先解锁主密码
- **数据隔离**：每个会话拥有独立消息记录，敏感信息加密存储
- **不上传数据**：除非用户主动开启 WebDAV 同步，数据仅存储在本地

---

## 🌍 国际化

支持三种语言，通过设置页切换：

| 语言 | 代码 |
|------|------|
| 简体中文 | `zh-CN` |
| 繁体中文 | `zh-TW` |
| English | `en` |

---

## 📚 相关文档

完整文档位于 `docs/` 目录，详见 [文档索引](docs/index.md)。

| 文档 | 说明 |
|------|------|
| [商业需求文档 (BRD)](docs/01-phase-requirements/01-brd.md) | 项目定位、市场分析、商业模式 |
| [产品需求文档 (PRD)](docs/01-phase-requirements/02-prd.md) | 功能清单、业务流程、数据字典 |
| [UI 设计规范](docs/02-phase-design/01-ui-design.md) | 色彩系统、字体、组件规范 |
| [系统架构设计](docs/02-phase-design/02-system-architecture.md) | 架构图、模块划分、技术选型 |
| [数据库设计 (DDL)](docs/02-phase-design/03-database-ddl.md) | 表结构、字段说明、索引策略 |
| [IPC 接口设计](docs/02-phase-design/04-ipc-api.md) | 主进程与渲染进程通信协议 |
| [微信 iLink Bot API](docs/02-phase-design/10-wechat-ilink-bot-api.md) | 微信平台全部 HTTP 接口（登录/消息/媒体/CDN） |
| [编码规范](docs/03-phase-development/02-coding-standards.md) | TypeScript / React 规范、Git 策略 |
| [用户操作手册](docs/05-phase-operations/01-user-manual.md) | 安装、配置、使用指南、FAQ |

---

## 🌿 分支模型与版本规范

本项目采用简化版 Git Flow 工作流，遵循 [SemVer 语义化版本](https://semver.org/lang/zh-CN/) 规范。

### 分支职责

| 分支 | 作用 | 生命周期 | 谁来提交 |
|------|------|---------|---------|
| `master` | 生产发布分支，始终可发布 | 永久 | 只通过 PR/合并进入 |
| `dev` | 开发集成分支，下一个版本的开发线 | 永久 | **协作者往这里提 PR** |
| `feature/*` | 单个功能开发 | 临时 | 完成后合并到 dev |
| `hotfix/*` | 紧急 bug 修复 | 临时 | 合并到 master + dev 后删除 |

### 版本号规则（SemVer）

```
v1.0.0  ← 首次正式发布
   ↓
v1.0.1  ← 紧急 bug 修复（hotfix，末位号递增）
v1.0.2  ← 又一个紧急 bug 修复
   ↓
v1.1.0  ← 月度常规版本（新需求，中位号递增）
v1.1.1  ← 紧急 hotfix
   ↓
v1.2.0  ← 下一个月度常规版本
   ↓
v2.0.0  ← 破坏性变更（首位号递增，很少使用）
```

- **月度常规版本**：中位号递增（`v1.1.0` → `v1.2.0`）
- **紧急 hotfix**：末位号递增（`v1.1.0` → `v1.1.1`），无 bug 则不发
- **破坏性变更**：首位号递增（`v1.x.x` → `v2.0.0`）

### 发布流程

```bash
# 月度常规版本发布
 git checkout dev && git pull origin dev   # 拉取最新开发代码
git checkout master && git merge dev --no-ff  # 合并到 master
git tag -a v1.1.0 -m "月度常规版本 v1.1.0"      # 打 tag
git push origin master                        # 推送 master
git push origin refs/tags/v1.1.0              # 推送 tag（触发自动构建）

# 紧急 hotfix
 git checkout master
git checkout -b hotfix/v1.0.1                 # 从 master 拉出临时分支
# ...修复 bug，提交...
git checkout master && git merge hotfix/v1.0.1 --no-ff
git tag -a v1.0.1 -m "紧急修复 v1.0.1"
git push origin master && git push origin refs/tags/v1.0.1
git checkout dev && git merge hotfix/v1.0.1 --no-ff && git push origin dev  # 同步到 dev
git branch -d hotfix/v1.0.1                   # 删除临时分支
```

---

## 🤝 贡献

欢迎贡献代码！请遵循以下流程：

1. Fork 本仓库
2. 切换到 `dev` 分支（`git checkout dev`）
3. 从 `dev` 拉出功能分支（`git checkout -b feature/your-feature`）
4. 提交更改（`git commit -m 'feat: add amazing feature'`）
5. 推送到你的 Fork（`git push origin feature/your-feature`）
6. 发起 Pull Request 到 `dev` 分支

> ⚠️ 请勿直接向 `master` 或 `hotfix/*` 分支提 PR，所有功能开发请合并到 `dev` 分支。
>
> 提交信息请遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

更多贡献指南请参考 [贡献说明](docs/03-phase-development/04-contributing.md)。

---

## 📄 开源协议

本项目采用 MIT 协议开源，你享有以下权利：

- ✅ **自由使用**：可免费用于个人或商业项目
- ✅ **自由修改**：可按需修改源码
- ✅ **自由分发**：可复制、分发原始或修改后的代码
- ✅ **闭源商用**：可用于闭源商业产品，无需公开源码

> ⚠️ **必须保留版权和许可声明**：在所有副本中包含原始版权声明和 MIT 许可证全文。

---

## 🔗 相关链接

<p>
  <strong>项目仓库</strong><br/>
  <a href="https://github.com/gcd888/wechat-link-agent"><img src="https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white" alt="GitHub" /></a>
  <a href="https://gitee.com/gcd888/wechat-link-agent"><img src="https://img.shields.io/badge/Gitee-C71D23?logo=gitee&logoColor=white" alt="Gitee" /></a>
</p>

<p>
  <strong>问题反馈</strong><br/>
  <a href="https://github.com/gcd888/wechat-link-agent/issues"><img src="https://img.shields.io/badge/Issues-181717?logo=github&logoColor=white" alt="GitHub Issues" /></a>
  <a href="https://gitee.com/gcd888/wechat-link-agent/issues"><img src="https://img.shields.io/badge/Issues-C71D23?logo=gitee&logoColor=white" alt="Gitee Issues" /></a>
</p>

---

> *微连 — 让你的微信变成 AI Agent 的遥控面板。*
