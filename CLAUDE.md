# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start electron-vite dev (hot-reload renderer)
npm run build        # Build for production (electron-vite build)
npm run prod         # Build + package with electron-builder
npm run typecheck    # tsc --noEmit (type check only)
npm run preview      # electron-vite preview
```

## Project Structure

```
├── src/                        # Electron 主进程
│   ├── main/index.ts           # 窗口/托盘/IPC 注册、应用启动入口
│   ├── preload/index.ts        # preload 脚本（contextBridge）
│   ├── agent/                  # Agent 管理核心
│   │   ├── manager.ts          # CRUD、状态管理、消息发送、PATH 扫描同步
│   │   ├── scanner.ts          # 扫描 PATH 发现 CLI 工具、注册表读取
│   │   ├── provider.ts         # Provider 注册/创建工厂
│   │   ├── types.ts            # AgentInfo/AgentConfig/AgentRegistryEntry
│   │   └── providers/          # 各 CLI 的 Provider 实现
│   │       ├── claude.ts       # Claude Code provider
│   │       ├── opencode.ts     # OpenCode provider
│   │       ├── codebuddy.ts    # CodeBuddy provider
│   │       └── generic.ts      # 通用 provider
│   ├── wechat/                 # 微信 iLink Bot API 集成
│   │   ├── api.ts              # HTTP 客户端
│   │   ├── login.ts            # 扫码登录流程
│   │   ├── monitor.ts          # 消息长轮询
│   │   ├── send.ts             # 回复消息
│   │   ├── media.ts            # 图片/文件上传
│   │   ├── accounts.ts         # 账号绑定管理
│   │   ├── crypto.ts           # 加解密
│   │   ├── sync-buf.ts         # 消息同步 buffer
│   │   └── cdn.ts              # 文件 CDN 上传
│   ├── commands/router.ts      # 微信端命令路由 (/help, /agent, /clear 等)
│   ├── database/db.ts          # SQLite (sql.js) 连接、持久化、备份恢复
│   ├── session.ts              # 对话会话管理
│   ├── sync.ts                 # 主进程同步入口
│   ├── sync/webdav.ts          # WebDAV 云同步实现
│   ├── utils/spawn.ts          # 子进程启动工具
│   ├── utils/split-message.ts  # 长消息拆分
│   └── utils/tool-noise-filter.ts  # 工具调用日志过滤
│
├── renderer/                   # Electron 渲染进程（React）
│   ├── App.tsx                 # 根组件 - 三栏布局
│   ├── main.tsx                # React 入口
│   ├── index.html              # HTML 模板
│   ├── electron.d.ts           # window.electronAPI 类型声明
│   ├── stores/                 # Zustand 状态管理
│   │   ├── ui-store.ts         # 导航/主题/语言/面板宽度
│   │   ├── agent-store.ts      # Agent 列表/当前 Agent
│   │   └── chat-store.ts       # 消息列表/发送/流式输出
│   ├── components/
│   │   ├── NavSidebar/         # 第一栏：导航栏（60px）
│   │   ├── ListPanel/          # 第二栏：列表（聊天/Agent/商城/设置）
│   │   ├── ChatPage/           # 第三栏：聊天界面
│   │   ├── AgentManager/       # 第三栏：Agent 管理详情
│   │   ├── StorePage/          # 第三栏：商城页
│   │   ├── Settings/           # 第三栏：设置页
│   │   └── shared/AgentAvatar  # Agent 头像组件
│   ├── i18n/i18n.ts            # 国际化（i18next，zh-CN/zh-TW/en）
│   └── styles/global.css       # 全局样式 + CSS 变量（深色/浅色主题）
│
├── build/                      # 打包资源（图标等）
│   └── logo.png              # 应用图标（PNG）
├── electron-builder.yml        # 打包配置
├── vite.config.ts              # Vite 配置
└── package.json
```

## Architecture Notes

### 三栏布局
- **第一栏**: `NavSidebar` — 固定 60px 宽，主功能导航 + 微信状态
- **第二栏**: `ListPanel` — CSS variable 驱动宽度（200-500px，可拖拽），根据 `navActive` 渲染不同列表：聊天 Agent 列表 / Agent 管理列表 / 商城分组列表 / 设置项列表。拖拽通过 DOM 操作 CSS 变量实现，不触发 React 重渲染
- **第三栏**: `content-area` — flex:1，根据 `navActive` 和 `selectedItem` 渲染对应页面

### 状态管理 (Zustand)
- `useUIStore` — `navActive`, `selectedItem`, `theme`, `language`, `wechatConnected`, `panelWidth`
  - `setNavActive(nav, selected?)` — 切换导航时自动清空 selectedItem，可传第二个参数指定选中项
- `useAgentStore` — Agent CRUD、当前 Agent、注册表、扫描结果
- `useChatStore` — 消息列表、发送状态、流式输出

### 数据库 (sql.js)
- 文件路径: `~/.wechat-link-agent/wla.db`
- 每次启动执行 `schema.sql`（CREATE IF NOT EXISTS）和 `seed.sql`（INSERT OR IGNORE）
- `store_items` 表无 UNIQUE 约束（seed 插入前会 DELETE 清空）
- 通过 `getDb()` / `saveDb()` 管理

### Agent 系统
- 启动时 `syncFromScan()` 清空 agents 表 → 扫 PATH → 插入已发现的 CLI
- `agent_registry` 是静态种子数据，`agents` 由 PATH 扫描动态填充
- Provider 模式: `claude | opencode | codebuddy | generic`

### IPC 通信
- 主进程在 `main/index.ts` 注册所有 `ipcMain.handle`
- preload 通过 `contextBridge` 暴露 `window.electronAPI`
- 类型定义在 `renderer/electron.d.ts`

### 国际化
- i18next + react-i18next，支持 zh-CN / zh-TW / en
- `useT()` hook 带 fallback 值（`t('key', '默认值')`）
- 语言检测: 浏览器偏好 → localStorage

### 样式
- CSS 变量驱动主题（`data-theme="dark" | "light"`）
- Tailwind CSS + 自定义全局样式
- 组件全部使用内联 style 对象和 className 组合

## 微信集成
- 基于 iLink Bot API
- 扫码登录 → 长轮询接收消息 → 命令路由 → 调用 Agent → 回复
