# 开发者指南 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 开发者指南 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-07-01 |

---

## 目录

1. [项目结构](#1-项目结构)
2. [开发环境搭建](#2-开发环境搭建)
3. [核心概念](#3-核心概念)
4. [开发指南](#4-开发指南)
5. [测试指南](#5-测试指南)
6. [贡献指南](#6-贡献指南)

---

## 1. 项目结构

### 1.1 目录树

```
wechat-link-agent/
├── src/                        # 主进程代码
│   ├── main/                   # 主进程入口
│   │   └── index.ts            # 窗口/托盘/IPC 注册、应用启动
│   ├── preload/index.ts        # preload 脚本（contextBridge）
│   ├── agent/                  # Agent 管理核心
│   │   ├── manager.ts          # CRUD、状态管理、消息发送、PATH 扫描同步
│   │   ├── scanner.ts          # PATH 扫描、注册表读取
│   │   ├── provider.ts         # Provider 注册/创建工厂
│   │   ├── types.ts            # AgentInfo/AgentConfig/AgentRegistryEntry
│   │   └── providers/          # 各 CLI 的 Provider 实现
│   │       ├── claude.ts
│   │       ├── opencode.ts
│   │       ├── codebuddy.ts
│   │       └── generic.ts
│   ├── wechat/                 # 微信 iLink Bot API 集成
│   │   ├── api.ts              # HTTP 客户端
│   │   ├── login.ts            # 扫码登录
│   │   ├── monitor.ts          # 消息长轮询
│   │   ├── send.ts             # 回复消息
│   │   ├── media.ts            # 图片/文件上传
│   │   ├── accounts.ts         # 账号绑定管理
│   │   ├── crypto.ts           # 加解密
│   │   ├── sync-buf.ts         # 消息同步 buffer
│   │   └── cdn.ts              # 文件 CDN 上传
│   ├── commands/router.ts      # 微信端命令路由
│   ├── database/               # 数据库
│   │   ├── db.ts               # SQLite 连接、持久化、备份恢复
│   │   ├── schema.sql          # 表结构定义
│   │   └── seed.sql            # 种子数据
│   ├── session.ts              # 会话管理
│   ├── sync.ts                 # 主进程同步入口
│   ├── sync/webdav.ts          # WebDAV 云同步实现
│   ├── utils/
│   │   ├── spawn.ts            # 子进程启动工具
│   │   ├── split-message.ts    # 长消息拆分
│   │   └── tool-noise-filter.ts # 工具调用日志过滤
│
├── renderer/                   # 渲染进程代码
│   ├── App.tsx                 # 根组件 - 三栏布局
│   ├── main.tsx                # React 入口
│   ├── electron.d.ts           # window.electronAPI 类型声明
│   ├── components/
│   │   ├── NavSidebar/          # 导航栏（60px）
│   │   ├── ListPanel/          # 列表面板（可拖拽）
│   │   ├── ChatPage/           # 聊天界面
│   │   ├── AgentManager/       # Agent 管理详情
│   │   ├── StorePage/          # 商城页
│   │   ├── Settings/           # 设置页
│   │   └── shared/AgentAvatar  # Agent 头像组件
│   ├── stores/                 # Zustand 状态管理
│   │   ├── ui-store.ts         # 导航/主题/语言/面板宽度
│   │   ├── agent-store.ts      # Agent 列表/当前 Agent
│   │   └── chat-store.ts       # 消息列表/发送/流式输出
│   ├── i18n/i18n.ts            # 国际化（i18next）
│   └── styles/global.css       # 全局样式 + CSS 变量
│
├── docs/                       # 文档
│   ├── index.md                # 文档索引
│   ├── 01-phase-requirements/  # 需求文档
│   ├── 02-phase-design/        # 设计文档
│   ├── 03-phase-development/   # 开发文档
│   ├── 04-phase-testing/       # 测试文档
│   ├── 05-phase-operations/    # 运维文档
│   └── 06-marketing/           # 营销素材
│
├── build/                      # 构建资源（图标等）
│   └── logo.png
│
├── .github/workflows/          # CI/CD 工作流
│   ├── ci.yml                  # CI 检查
│   ├── build.yml               # 构建发布
│   └── sync-to-gitee.yml       # Gitee 镜像同步
│
├── package.json
├── electron-builder.yml
├── vite.config.ts
└── tsconfig.json
```

### 1.2 文件职责

| 文件/目录 | 职责 |
|-----------|------|
| `src/main/index.ts` | 主进程入口，注册所有 IPC 处理器 |
| `src/agent/manager.ts` | Agent CRUD、状态管理、消息发送 |
| `src/wechat/` | 微信扫码登录、消息监听、命令路由 |
| `renderer/stores/` | Zustand 状态管理 |
| `renderer/components/` | React 组件 |

---

## 2. 开发环境搭建

### 2.1 克隆仓库

```bash
git clone https://github.com/gcd888/wechat-link-agent.git
cd wechat-link-agent
```

### 2.2 安装依赖

```bash
# 使用 npm
npm install --legacy-peer-deps

# 或使用 pnpm（推荐）
pnpm install --legacy-peer-deps
```

### 2.3 启动开发服务器

```bash
npm run dev
```

应用会自动打开，支持热重载。

### 2.4 验证环境

```bash
# 类型检查
npm run typecheck

# 运行测试
npm test

# 代码检查
npm run lint
```

---

## 3. 核心概念

### 3.1 Electron 架构

- **主进程 (Main Process)**：管理窗口、托盘、IPC、数据库
- **渲染进程 (Renderer Process)**：运行 React 应用，显示 UI
- **IPC (Inter-Process Communication)**：主进程与渲染进程通信

### 3.2 IPC 通信

```typescript
// 主进程注册处理器
ipcMain.handle('agent:list', () => {
  return agentManager.list()
})

// 渲染进程调用
const agents = await window.electronAPI.agent.list()
```

### 3.3 Provider 模式

每个 AI Agent 都有一个 Provider，负责解析流式输出：

```typescript
interface AgentProvider {
  parseOutput(text: string): string | null
}

class ClaudeProvider implements AgentProvider {
  parseOutput(text: string): string | null {
    // 解析 Claude 的 SSE 格式
    const match = text.match(/data: (.+)/)
    return match ? JSON.parse(match[1]).delta.text : null
  }
}
```

### 3.4 状态管理 (Zustand)

```typescript
// agent-store.ts
export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  currentAgent: null,

  setAgents: (agents) => set({ agents }),
  setCurrentAgent: (agent) => set({ currentAgent: agent })
}))

// 组件中使用
const { agents, currentAgent } = useAgentStore()
```

---

## 4. 开发指南

### 4.1 添加新 Provider

**步骤**：

1. 创建 Provider 文件

```typescript
// src/agent/providers/myagent.ts
export class MyAgentProvider implements AgentProvider {
  parseOutput(text: string): string | null {
    // 解析该 Agent 的输出格式
    // 返回纯文本或 null
  }
}
```

2. 注册 Provider

```typescript
// src/agent/provider.ts
import { MyAgentProvider } from './providers/myagent'

export function createProvider(type: ProviderType): AgentProvider {
  switch (type) {
    case 'claude':
      return new ClaudeProvider()
    case 'myagent':
      return new MyAgentProvider()
    default:
      return new GenericProvider()
  }
}
```

3. 更新类型定义

```typescript
// src/agent/types.ts
export type ProviderType = 'claude' | 'opencode' | 'myagent' | 'generic'
```

4. 添加到注册表

```sql
-- src/database/seed.sql
INSERT INTO agent_registry (command, name, provider_type, ...)
VALUES ('myagent', 'My Agent', 'myagent', ...);
```

### 4.2 添加新 IPC 接口

**步骤**：

1. 在主进程注册处理器

```typescript
// src/main/index.ts
ipcMain.handle('my:newAction', async (_event, param: string) => {
  const result = await doSomething(param)
  return { success: true, data: result }
})
```

2. 在 Preload 暴露接口

```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  my: {
    newAction: (param: string) => ipcRenderer.invoke('my:newAction', param)
  }
})
```

3. 在类型声明中定义

```typescript
// renderer/electron.d.ts
interface ElectronAPI {
  my: {
    newAction: (param: string) => Promise<Result>
  }
}
```

### 4.3 添加新页面

**步骤**：

1. 创建组件

```typescript
// renderer/components/NewPage/index.tsx
export function NewPage() {
  return <div>新页面内容</div>
}
```

2. 添加导航项

```typescript
// renderer/components/NavSidebar/index.tsx
const navItems = [
  { id: 'chat', icon: MessageSquare },
  { id: 'agent', icon: Bot },
  { id: 'newPage', icon: Star }, // 新增
]
```

3. 路由渲染

```typescript
// renderer/App.tsx
{navActive === 'newPage' && <NewPage />}
```

### 4.4 添加数据库表

**步骤**：

1. 创建表结构

```sql
-- src/database/schema.sql
CREATE TABLE IF NOT EXISTS my_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

2. 创建数据访问函数

```typescript
// src/database/my-table.ts
export async function getMyTable() {
  const db = await getDb()
  const result = db.exec('SELECT * FROM my_table')
  // ... 解析结果
  return data
}
```

3. 注册 IPC 接口

```typescript
// src/main/index.ts
ipcMain.handle('myTable:get', async () => {
  return getMyTable()
})
```

### 4.5 添加国际化

**步骤**：

1. 添加翻译键

```typescript
// renderer/i18n/translations.ts
export const translations = {
  en: {
    newPage: {
      title: 'New Page',
      description: 'This is a new page'
    }
  },
  'zh-CN': {
    newPage: {
      title: '新页面',
      description: '这是一个新页面'
    }
  }
}
```

2. 在组件中使用

```typescript
import { useT } from '../i18n'

export function NewPage() {
  const t = useT()
  return <div>{t('newPage.title')}</div>
}
```

---

## 5. 测试指南

### 5.1 编写单元测试

```typescript
// src/agent/__tests__/scanner.test.ts
import { describe, it, expect, vi } from 'vitest'
import { scanAll } from '../scanner'

describe('Agent 扫描', () => {
  it('应返回已安装的 Agent', async () => {
    // Mock 文件系统
    vi.mock('node:fs/promises', () => ({
      exists: vi.fn(() => Promise.resolve(true))
    }))

    const results = await scanAll()
    expect(results).toBeInstanceOf(Array)
  })
})
```

### 5.2 编写集成测试

```typescript
// src/database/__tests__/db-integration.test.ts
import { describe, it, expect } from 'vitest'
import { getDb, saveDb } from '../db'

describe('数据库集成', () => {
  it('应正确保存配置', async () => {
    const db = await getDb()
    db.run("INSERT INTO app_config (key, value) VALUES ('theme', 'dark')")
    saveDb()

    const result = db.exec("SELECT value FROM app_config WHERE key = 'theme'")
    expect(result[0].values[0][0]).toBe('dark')
  })
})
```

### 5.3 运行测试

```bash
# 运行所有测试
npm test

# 运行特定文件
npm test scanner.test.ts

# 生成覆盖率报告
npm run test:coverage
```

---

## 6. 贡献指南

### 6.1 代码规范

- 使用 TypeScript
- 遵循 ESLint 规则
- 关键逻辑添加中文注释
- 函数和类型添加 JSDoc 注释

### 6.2 提交规范

```
feat(agent): 添加新的 Provider
fix(ui): 修复深色主题下按钮颜色问题
docs: 更新 API 文档
style: 格式化代码
refactor(session): 优化会话加载性能
test: 添加单元测试
chore: 升级依赖版本
```

### 6.3 Pull Request 流程

1. Fork 仓库
2. 创建功能分支

```bash
git checkout -b feature/my-feature
```

3. 提交更改

```bash
git add .
git commit -m "feat: 添加新功能"
```

4. 推送到远程

```bash
git push origin feature/my-feature
```

5. 创建 Pull Request

### 6.4 Code Review 检查清单

- [ ] 代码符合规范
- [ ] 无 ESLint 警告
- [ ] TypeScript 类型正确
- [ ] 测试通过
- [ ] 文档更新
- [ ] 无敏感信息泄露

---

## 7. 调试技巧

### 7.1 主进程调试

```typescript
// 打开 DevTools
mainWindow.webContents.openDevTools()

// 查看日志
logger.info('调试信息', { data: value })
```

### 7.2 渲染进程调试

1. 在窗口中按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS)
2. 使用 Chrome DevTools 调试

### 7.3 日志查看

日志文件位置：

- Windows: `C:\Users\{用户名}\.wechat-link-agent\logs\`
- macOS: `/Users/{用户名}/.wechat-link-agent/logs/`
- Linux: `/home/{用户名}/.wechat-link-agent/logs/`

---

## 8. 常见问题

### 8.1 IPC 调用失败

**问题**：`Error: An object could not be cloned`

**原因**：传递了不可序列化的对象（如函数、DOM 元素）

**解决**：仅传递可序列化的数据（JSON 对象）

### 8.2 渲染进程白屏

**问题**：渲染进程显示空白

**原因**：React 渲染错误

**解决**：

1. 打开 DevTools 查看错误
2. 检查控制台日志
3. 验证组件导出正确

### 8.3 数据库未初始化

**问题**：`Error: Database not initialized`

**原因**：`getDb()` 在 `initialize()` 前调用

**解决**：确保在 `app.whenReady()` 后再调用数据库操作

---

## 9. 资源链接

- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)
- [Zustand 文档](https://zustand-demo.pmnd.rs)
- [Vite 文档](https://vitejs.dev)
- [TypeScript 文档](https://www.typescriptlang.org)

---

## 10. 联系方式

- GitHub Issues: https://github.com/gcd888/wechat-link-agent/issues
- Gitee Issues: https://gitee.com/gcd888/wechat-link-agent/issues
- 微信群: 扫描应用内二维码

---

*欢迎贡献代码！*