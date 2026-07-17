# IPC 接口设计文档 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | IPC 接口设计文档 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 通信概述

### 1.1 通信模式

采用 **Request-Response 模式**：

- **渲染进程 → 主进程**：`window.electronAPI.xxx()` → `ipcRenderer.invoke()`
- **主进程 → 渲染进程**：`ipcMain.handle()` → 返回数据
- **主进程推送事件**：`webContents.send()` → `window.electronAPI.onXxx()`

### 1.2 通道命名规范

```
{模块}:{操作}

示例：
- agent:list      # 获取 Agent 列表
- message:send    # 发送消息
- wechat:startLogin # 开始微信登录
```

### 1.3 数据格式

- **请求参数**：JSON 对象
- **响应数据**：`{ success: boolean, data?: any, error?: string }`

---

## 2. Agent 管理接口

### 2.1 agent:list

获取所有 Agent 列表

```typescript
// 请求
ipcRenderer.invoke('agent:list')

// 响应
{
  success: true,
  data: [
    {
      id: 1,
      name: 'claude',
      command: 'claude',
      cliPath: '/usr/local/bin/claude',
      icon: 'claude.svg',
      providerType: 'claude',
      status: 'online',
      enabled: true,
      isDefault: true
    }
  ]
}
```

### 2.2 agent:getCurrent

获取当前 Agent

```typescript
// 请求
ipcRenderer.invoke('agent:getCurrent')

// 响应
{
  success: true,
  data: {
    id: 1,
    name: 'claude',
    // ... 同上
  }
}
```

### 2.3 agent:add

添加新 Agent

```typescript
// 请求
ipcRenderer.invoke('agent:add', {
  name: 'my-agent',
  command: 'my-agent',
  cliPath: '/usr/local/bin/my-agent',
  icon: 'agent.svg',
  args: '',
  cwd: '/home/user/projects',
  model: 'default',
  providerType: 'generic'
})

// 响应
{ success: true, data: { id: 2 } }
```

### 2.4 agent:remove

删除 Agent

```typescript
// 请求
ipcRenderer.invoke('agent:remove', 1)

// 响应
{ success: true }
```

### 2.5 agent:update

更新 Agent 配置

```typescript
// 请求
ipcRenderer.invoke('agent:update', 1, {
  name: 'claude-updated',
  model: 'claude-3.5-sonnet'
})

// 响应
{ success: true }
```

### 2.6 agent:switch

切换当前 Agent

```typescript
// 请求
ipcRenderer.invoke('agent:switch', 'claude')

// 响应
{ success: true }
```

### 2.7 agent:scan

扫描 PATH 发现新 Agent

```typescript
// 请求
ipcRenderer.invoke('agent:scan')

// 响应
{
  success: true,
  data: [
    { command: 'claude', path: '/usr/local/bin/claude' },
    { command: 'opencode', path: '/usr/local/bin/opencode' }
  ]
}
```

### 2.8 agent:rescan

重新扫描并同步 Agent 列表

```typescript
// 请求
ipcRenderer.invoke('agent:rescan')

// 响应
{ success: true, data: [...] } // 返回更新后的列表
```

### 2.9 agent:getStatus

获取 Agent 运行时状态

```typescript
// 请求
ipcRenderer.invoke('agent:getStatus')

// 响应
{
  success: true,
  data: {
    current: { id: 1, name: 'claude', status: 'online' },
    agents: [
      { id: 1, name: 'claude', status: 'online' },
      { id: 2, name: 'opencode', status: 'offline' }
    ]
  }
}
```

---

## 3. 消息接口

### 3.1 message:send

发送消息给 Agent（流式响应）

```typescript
// 请求
ipcRenderer.invoke('message:send', 'Hello', sessionId, files)

// 参数
- text: string          // 消息内容
- sessionId?: number    // 会话 ID（可选，默认使用当前会话）
- files?: Array<{       // 附件文件（可选）
  path: string
  name: string
}>

// 响应（流式）
主进程通过事件推送流式输出：
webContents.send('message:agentOutput', {
  content: 'Hello',    // 增量文本
  type: 'delta',       // 类型: 'delta' | 'error' | 'done'
  sessionId: 1,
  agentName: 'claude'
})

// 最终响应
{
  success: true,
  data: {
    content: '完整回复内容',
    sessionId: 1
  }
}
```

### 3.2 message:getHistory

获取消息历史

```typescript
// 请求
ipcRenderer.invoke('message:getHistory', 'claude', 50, sessionId)

// 参数
- agentName: string     // Agent 名称
- limit?: number        // 限制数量（可选）
- sessionId?: number    // 会话 ID（可选，优先使用）

// 响应
{
  success: true,
  data: [
    {
      id: 1,
      sessionId: 1,
      agentName: 'claude',
      role: 'user',
      content: 'Hello',
      source: 'desktop',
      timestamp: 1704902400000
    },
    {
      id: 2,
      sessionId: 1,
      agentName: 'claude',
      role: 'assistant',
      content: 'Hi there!',
      source: 'desktop',
      timestamp: 1704902401000
    }
  ]
}
```

### 3.3 message:clear

清空会话消息

```typescript
// 请求
ipcRenderer.invoke('message:clear', 'claude', sessionId)

// 响应
{ success: true }
```

### 3.4 message:getChatAgents

获取有聊天记录的 Agent

```typescript
// 请求
ipcRenderer.invoke('message:getChatAgents')

// 响应
{
  success: true,
  data: [
    { id: 1, name: 'claude', messageCount: 50 },
    { id: 2, name: 'opencode', messageCount: 10 }
  ]
}
```

### 3.5 message:deleteAgentChats

删除 Agent 的所有聊天记录

```typescript
// 请求
ipcRenderer.invoke('message:deleteAgentChats', 1)

// 响应
{ success: true }
```

### 3.6 message:exportSession

导出会话为 Markdown

```typescript
// 请求
ipcRenderer.invoke('message:exportSession', 1)

// 响应
{
  success: true,
  data: { filePath: '/path/to/session.md' }
}
```

### 3.7 message:exportAgentChats

导出 Agent 所有会话为 Markdown

```typescript
// 请求
ipcRenderer.invoke('message:exportAgentChats', 1, 'claude')

// 响应
{
  success: true,
  data: { filePath: '/path/to/claude-chats.md' }
}
```

### 3.8 message:search

搜索消息

```typescript
// 请求
ipcRenderer.invoke('message:search', 'keyword')

// 响应
{
  success: true,
  data: [...] // 匹配的消息列表
}
```

---

## 4. 会话接口

### 4.1 session:list

获取 Agent 的所有会话

```typescript
// 请求
ipcRenderer.invoke('session:list', 1)

// 响应
{
  success: true,
  data: [
    {
      id: 1,
      agentId: 1,
      title: '新会话',
      preview: '最后一条消息...',
      updatedAt: '2024-01-10 10:00:00'
    }
  ]
}
```

### 4.2 session:create

创建新会话

```typescript
// 请求
ipcRenderer.invoke('session:create', 1, '自定义标题')

// 响应
{
  success: true,
  data: { id: 2, title: '自定义标题' }
}
```

### 4.3 session:delete

删除会话

```typescript
// 请求
ipcRenderer.invoke('session:delete', 1)

// 响应
{ success: true }
```

### 4.4 session:rename

重命名会话

```typescript
// 请求
ipcRenderer.invoke('session:rename', 1, '新标题')

// 响应
{ success: true }
```

### 4.5 session:switch

切换当前会话

```typescript
// 请求
ipcRenderer.invoke('session:switch', 1)

// 响应
{ success: true }
```

### 4.6 session:getMessages

获取会话消息

```typescript
// 请求
ipcRenderer.invoke('session:getMessages', 1, 50)

// 响应
{ success: true, data: [...] } // 消息列表
```

### 4.7 session:updateCwd

更新会话工作目录

```typescript
// 请求
ipcRenderer.invoke('session:updateCwd', 1, '/path/to/project')

// 响应
{ success: true }
```

---

## 5. 微信接口

### 5.1 wechat:getStatus

获取微信连接状态

```typescript
// 请求
ipcRenderer.invoke('wechat:getStatus')

// 响应
{
  success: true,
  data: {
    connected: true,
    qrCodeUrl: null,
    accountId: 'xxx'
  }
}
```

### 5.2 wechat:startLogin

开始微信扫码登录

```typescript
// 请求
ipcRenderer.invoke('wechat:startLogin')

// 响应
{
  success: true,
  data: {
    qrcodeUrl: 'https://...',
    qrcodeId: 'xxx'
  }
}
```

### 5.3 wechat:waitForScan

等待扫码结果

```typescript
// 请求
ipcRenderer.invoke('wechat:waitForScan', 'qrcodeId')

// 响应
{ success: true } // 扫码成功
// { success: false, error: '已取消' }
```

### 5.4 wechat:disconnect

断开微信连接

```typescript
// 请求
ipcRenderer.invoke('wechat:disconnect')

// 响应
{ success: true }
```

---

## 6. 同步接口

### 6.1 sync:getStatus

获取同步状态

```typescript
// 请求
ipcRenderer.invoke('sync:getStatus')

// 响应
{
  success: true,
  data: {
    configured: true,
    lastSync: '2024-01-10 10:00:00'
  }
}
```

### 6.2 sync:saveConfig

保存 WebDAV 配置

```typescript
// 请求
ipcRenderer.invoke('sync:saveConfig', {
  url: 'https://dav.example.com',
  username: 'user',
  password: 'pass',
  autoSync: true,
  interval: 300
})

// 响应
{ success: true }
```

### 6.3 sync:getConfig

获取同步配置

```typescript
// 请求
ipcRenderer.invoke('sync:getConfig')

// 响应
{
  success: true,
  data: { url: '...', username: 'user', ... }
}
```

### 6.4 sync:test

测试 WebDAV 连接

```typescript
// 请求
ipcRenderer.invoke('sync:test')

// 响应
{ success: true }
// { success: false, error: '连接失败' }
```

### 6.5 sync:upload

上传到 WebDAV

```typescript
// 请求
ipcRenderer.invoke('sync:upload')

// 响应
{ success: true }
```

### 6.6 sync:download

从 WebDAV 下载

```typescript
// 请求
ipcRenderer.invoke('sync:download')

// 响应
{ success: true }
```

---

## 7. 备份接口

### 7.1 backup:create

创建备份

```typescript
// 请求
ipcRenderer.invoke('backup:create')

// 响应
{
  success: true,
  data: { path: '/path/to/backup.db' }
}
```

### 7.2 backup:list

列出备份

```typescript
// 请求
ipcRenderer.invoke('backup:list')

// 响应
{
  success: true,
  data: [
    { path: '/path/1.db', size: 1024, date: '2024-01-10' },
    { path: '/path/2.db', size: 1024, date: '2024-01-09' }
  ]
}
```

### 7.3 backup:restore

恢复备份

```typescript
// 请求
ipcRenderer.invoke('backup:restore', '/path/to/backup.db')

// 响应
{ success: true }
```

---

## 8. 配置接口

### 8.1 config:get

获取配置

```typescript
// 请求
ipcRenderer.invoke('config:get')

// 响应
{
  success: true,
  data: {
    theme: 'dark',
    language: 'zh-CN',
    workingDirectory: '/home/user',
    systemPrompt: '',
    launchOnStartup: true,
    minimizeToTray: true
  }
}
```

### 8.2 config:update

更新配置

```typescript
// 请求
ipcRenderer.invoke('config:update', {
  theme: 'light',
  language: 'en'
})

// 响应
{
  success: true,
  data: { theme: 'light', language: 'en', ... }
}
```

---

## 9. 应用接口

### 9.1 app:getVersion

获取应用版本

```typescript
// 请求
ipcRenderer.invoke('app:getVersion')

// 响应
{ success: true, data: '0.1.0' }
```

### 9.2 app:getPlatform

获取平台信息

```typescript
// 请求
ipcRenderer.invoke('app:getPlatform')

// 响应
{ success: true, data: 'win32' }
```

### 9.3 app:quit

退出应用

```typescript
// 请求
ipcRenderer.invoke('app:quit')
```

### 9.4 app:execCommand

执行 shell 命令

```typescript
// 请求
ipcRenderer.invoke('app:execCommand', 'npm install -g claude', {
  elevated: true  // Windows UAC 提权
})

// 响应
{ success: true }
// { success: false, error: '错误信息' }
```

### 9.5 app:openExternal

在浏览器打开 URL

```typescript
// 请求
ipcRenderer.invoke('app:openExternal', 'https://example.com')

// 响应
{ success: true }
```

### 9.6 app:openTerminalForLogin

打开终端引导登录

```typescript
// 请求
ipcRenderer.invoke('app:openTerminalForLogin', '请输入登录命令', 'claude')

// 响应
{ success: true }
```

---

## 10. 事件推送

### 10.1 agent:statusChange

Agent 状态变化

```typescript
// 主进程推送
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

### 10.2 message:agentOutput

Agent 流式输出

```typescript
// 主进程推送
mainWindow.webContents.send('message:agentOutput', {
  content: 'Hello',
  type: 'delta',
  sessionId: 1,
  agentName: 'claude'
})
```

---

## 11. 类型定义

### 11.1 前端调用类型

```typescript
// renderer/electron.d.ts
interface ElectronAPI {
  // Agent
  agent: {
    list: () => Promise<AgentInfo[]>
    getCurrent: () => Promise<AgentInfo | null>
    add: (config: AgentConfig) => Promise<number>
    remove: (id: number) => Promise<boolean>
    update: (id: number, updates: Partial<AgentConfig>) => Promise<boolean>
    switch: (name: string) => Promise<boolean>
    scan: () => Promise<AgentScanResult[]>
    rescan: () => Promise<AgentInfo[]>
    getStatus: () => Promise<AgentStatusInfo>
  }

  // 消息
  message: {
    send: (text: string, sessionId?: number, files?: File[]) => Promise<MessageSendResult>
    getHistory: (agentName: string, limit?: number, sessionId?: number) => Promise<Message[]>
    clear: (agentName: string, sessionId?: number) => Promise<boolean>
    // ...
  }

  // 事件监听
  onAgentStatusChange: (callback: (data: StatusChangeEvent) => void) => void
  onAgentOutput: (callback: (data: OutputEvent) => void) => void
}
```

---

## 12. 扩展接口（补充）

以下接口在实际代码中已实现，作为上述接口的补充。

### 12.1 Agent 扩展接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `agent:getRegistry` | - | `AgentRegistryEntry[]` | 获取 Agent 注册表（所有已知 Agent） |
| `agent:getCommands` | agentCommand: string | `AgentCommand[]` | 获取指定 Agent 支持的斜杠命令 |
| `agent:getLLMConfig` | agentId: number | `{ provider, models, config }` | 获取 Agent 关联的 LLM 配置 |
| `agent:updateLLMConfig` | `{ agentId, providerId, modelConfig }` | `{ success }` | 更新 Agent 的 LLM 配置 |
| `agent:applyLLMConfig` | agentId: number | `{ success }` | 将 LLM 配置应用到指定 Agent |
| `agent:applyAllLLMConfigs` | - | `{ success }` | 批量应用所有 Agent 的 LLM 配置 |

### 12.2 消息扩展接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `message:getStats` | - | `{ total, byAgent }` | 获取消息统计信息 |
| `message:getClawBotHistory` | - | `Message[]` | 获取 ClawBot 历史消息 |
| `message:sendClawBot` | text: string | `{ success }` | 发送消息给 ClawBot |

### 12.3 商城接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `store:list` | - | `StoreItem[]` | 获取商城商品列表 |
| `store:categories` | - | `StoreCategory[]` | 获取商城分类列表 |

### 12.4 同步扩展接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `sync:fetchRemoteInfo` | - | `{ exists, size, lastModified }` | 获取远程 WebDAV 文件信息 |

### 12.5 备份扩展接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `backup:delete` | backupPath: string | `{ success }` | 删除指定备份文件 |

### 12.6 环境检测接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `env:check` | - | `EnvCheckResult[]` | 检测系统环境（Node.js、npm、Git 等） |

### 12.7 主密码接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `masterPassword:has` | - | `boolean` | 是否已设置主密码 |
| `masterPassword:isUnlocked` | - | `boolean` | 主密码是否已解锁 |
| `masterPassword:set` | password, trustDevice | `boolean` | 设置主密码 |
| `masterPassword:unlock` | password, trustDevice? | `boolean` | 解锁主密码 |
| `masterPassword:tryRestore` | - | `boolean` | 尝试从设备信任恢复 |
| `masterPassword:lock` | - | `void` | 锁定主密码 |
| `masterPassword:change` | oldPassword, newPassword, trustDevice | `boolean` | 修改主密码 |
| `masterPassword:clear` | - | `void` | 清除主密码（会清除所有加密数据） |

### 12.8 对话框接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `dialog:pickDirectory` | - | `string \| null` | 弹出目录选择器，返回选中路径或 null（取消） |
| `dialog:openFiles` | - | `string[]` | 弹出文件选择器（多选），返回文件路径数组 |

### 12.9 主题设置接口

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `theme:set` | theme: `'dark' \| 'light' \| 'system'` | `{ success, resolvedTheme }` | 设置主题并同步系统标题栏颜色，返回实际解析后的主题 |

### 12.10 LLM 供应商管理接口

LLM 供应商管理用于"工具箱"功能，支持多供应商的 API Key 加密存储和模型管理。

#### 12.10.1 provider:list

获取所有 LLM 供应商列表

```typescript
// 请求
ipcRenderer.invoke('provider:list')

// 响应
[
  {
    id: 1,
    name: 'OpenAI',
    description: 'GPT 系列模型',
    website: 'https://openai.com',
    baseUris: [{ protocol: 'openai', url: 'https://api.openai.com' }],
    logoUrl: '',
    createdAt: '2024-01-10 10:00:00',
    updatedAt: '2024-01-10 10:00:00'
  }
]
```

#### 12.10.2 provider:get

获取单个供应商详情（含模型列表和解密后的 API Key）

```typescript
// 请求
ipcRenderer.invoke('provider:get', 1)

// 响应
{
  id: 1,
  name: 'OpenAI',
  description: 'GPT 系列模型',
  website: 'https://openai.com',
  baseUris: [{ protocol: 'openai', url: 'https://api.openai.com' }],
  logoUrl: '',
  apiKey: 'sk-xxx',      // 明文（主密码已解锁时）或空字符串
  hasApiKey: true,        // 是否已配置 API Key
  models: [
    { id: 1, displayName: 'GPT-4o', modelName: 'gpt-4o' },
    { id: 2, displayName: 'GPT-4o mini', modelName: 'gpt-4o-mini' }
  ]
}
```

#### 12.10.3 provider:create

新增供应商

```typescript
// 请求
ipcRenderer.invoke('provider:create', {
  name: 'OpenAI',
  description: 'GPT 系列模型',
  website: 'https://openai.com',
  logoUrl: '',
  baseUris: [{ protocol: 'openai', url: 'https://api.openai.com' }],
  apiKey: 'sk-xxx',
  models: [
    { displayName: 'GPT-4o', modelName: 'gpt-4o' }
  ]
})

// 响应
{ success: true, id: 1 }
```

#### 12.10.4 provider:update

更新供应商

```typescript
// 请求
ipcRenderer.invoke('provider:update', 1, {
  name: 'OpenAI',
  description: 'GPT 系列模型',
  website: 'https://openai.com',
  logoUrl: '',
  baseUris: [{ protocol: 'openai', url: 'https://api.openai.com' }],
  apiKey: 'sk-new',  // 不传则不更新 API Key
  models: [
    { id: 1, displayName: 'GPT-4o', modelName: 'gpt-4o' },
    { displayName: 'GPT-5', modelName: 'gpt-5' }
  ]
})

// 响应
{ success: true }
```

#### 12.10.5 provider:delete

删除供应商

```typescript
// 请求
ipcRenderer.invoke('provider:delete', 1)

// 响应
{ success: true }
```

#### 12.10.6 provider:test

测试 API 连接（支持 OpenAI / Anthropic / Gemini 协议）

```typescript
// 请求
ipcRenderer.invoke('provider:test', {
  protocol: 'openai',           // 'openai' | 'anthropic' | 'gemini'
  baseUrl: 'https://api.openai.com',
  apiKey: 'sk-xxx',
  modelName: 'gpt-4o'
})

// 响应
{ success: true, message: '连接成功' }
// { success: false, error: 'HTTP 401: ...' }
```

### 12.11 供应商模板接口

#### 12.11.1 providerTemplate:search

搜索供应商模板（按关键词模糊匹配名称，空关键词返回全部）

```typescript
// 请求
ipcRenderer.invoke('providerTemplate:search', 'openai')
// 或空关键词返回全部
ipcRenderer.invoke('providerTemplate:search', '')

// 响应
[
  {
    id: 1,
    name: 'OpenAI',
    logoUrl: '',
    website: 'https://openai.com',
    description: 'GPT 系列模型',
    baseUris: [{ protocol: 'openai', url: 'https://api.openai.com' }]
  }
]
```

---

*本文档定义了所有 IPC 通信接口，确保前后端数据交换规范统一。完整通道列表以 `src/main/index.ts` 中的 `ipcMain.handle` 注册为准。*