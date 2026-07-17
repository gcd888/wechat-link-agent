# 详细设计说明书 (LLD) - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 详细设计说明书 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. Agent 管理模块详细设计

### 1.1 Agent 扫描机制

#### 1.1.1 扫描流程

```typescript
// src/agent/scanner.ts
export async function scanAll(): Promise<AgentScanResult[]> {
  const results: AgentScanResult[] = []

  // 1. 读取注册表（静态种子数据）
  const registry = await getRegistry()

  // 2. 扫描 PATH 环境变量
  const pathDirs = process.env.PATH?.split(delimiter) || []

  for (const dir of pathDirs) {
    for (const entry of registry) {
      const cliPath = join(dir, entry.command)
      if (await exists(cliPath)) {
        results.push({
          command: entry.command,
          path: cliPath,
          registryEntry: entry
        })
      }
    }
  }

  return results
}
```

#### 1.1.2 PATH 扫描策略

- **优先级**：系统 PATH > 用户 PATH
- **去重**：同一命令取第一个找到的路径
- **跨平台**：自动识别 `:` (Unix) 和 `;` (Windows) 分隔符

### 1.2 Agent 消息发送流程

#### 1.2.1 流式输出处理

```typescript
// src/agent/manager.ts
export async function* send(input: QueryInput): AsyncGenerator<AgentOutput> {
  const agent = this.getCurrent()
  const provider = this.createProvider(agent)

  try {
    // 1. 启动子进程
    const child = spawn(agent.cliPath, agent.args.split(' '), {
      cwd: input.cwd || agent.cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // 2. 发送输入
    child.stdin.write(JSON.stringify(input))
    child.stdin.end()

    // 3. 读取 stdout 并解析流式输出
    for await (const chunk of child.stdout) {
      const text = chunk.toString()

      // 根据 Provider 类型解析
      const delta = provider.parseOutput(text)

      if (delta) {
        yield { type: 'text', delta }
      }
    }

    // 4. 等待进程结束
    await new Promise((resolve) => child.on('close', resolve))

    yield { type: 'done', fullText: accumulatedText }

  } catch (error) {
    yield { type: 'error', message: error.message }
  }
}
```

#### 1.2.2 Provider 解析逻辑

```typescript
// src/agent/providers/claude.ts
export class ClaudeProvider implements AgentProvider {
  parseOutput(text: string): string | null {
    // Claude 输出格式：SSE 事件流
    // data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}

    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        if (data.delta?.text) {
          return data.delta.text
        }
      }
    }
    return null
  }
}

// src/agent/providers/generic.ts
export class GenericProvider implements AgentProvider {
  parseOutput(text: string): string | null {
    // 通用模式：直接返回所有文本
    return text
  }
}
```

### 1.3 Agent 状态管理

```typescript
// src/agent/manager.ts
export class AgentManager {
  private agents: Map<number, AgentInfo> = new Map()
  private currentAgentId: number | null = null
  private statusChangeCallbacks: Array<(id, name, status) => void> = []

  setStatus(agentId: number, status: AgentStatus) {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = status
      this.notifyStatusChange(agentId, agent.name, status)
    }
  }

  private notifyStatusChange(agentId: number, agentName: string, status: AgentStatus) {
    for (const callback of this.statusChangeCallbacks) {
      callback(agentId, agentName, status)
    }
  }

  onStatusChange(callback: (id, name, status) => void) {
    this.statusChangeCallbacks.push(callback)
  }
}
```

---

## 2. 微信集成模块详细设计

### 2.1 扫码登录流程

```typescript
// src/wechat/login.ts
export async function startQrLogin(): Promise<QrLoginInfo> {
  // 1. 获取二维码
  const qrcodeUrl = await api.getQrCode()

  // 2. 保存二维码 ID（用于轮询）
  const qrcodeId = generateQrId()

  return { qrcodeUrl, qrcodeId }
}

export async function waitForQrScan(qrcodeId: string): Promise<boolean> {
  const maxWait = 5 * 60 * 1000 // 5 分钟
  const startTime = Date.now()

  while (Date.now() - startTime < maxWait) {
    // 1. 轮询检查扫码状态
    const status = await api.checkQrStatus(qrcodeId)

    if (status === 'scanned') {
      // 2. 确认登录
      await api.confirmLogin(qrcodeId)
      return true
    } else if (status === 'expired') {
      throw new Error('二维码已过期')
    }

    // 3. 等待 2 秒后重试
    await sleep(2000)
  }

  throw new Error('登录超时')
}
```

### 2.2 消息长轮询机制

```typescript
// src/wechat/monitor.ts
export async function startMessagePolling(onMessage: (msg: WeChatMessage) => void) {
  while (true) {
    try {
      // 1. 长轮询（最多等待 30 秒）
      const messages = await api.pollMessages(30)

      // 2. 处理消息
      for (const msg of messages) {
        await handleMessage(msg, onMessage)
      }

    } catch (error) {
      logger.error('轮询失败', { error: error.message })
      // 指数退避
      await sleep(5000)
    }
  }
}

async function handleMessage(msg: WeChatMessage, onMessage: Function) {
  // 1. 命令路由
  if (msg.content.startsWith('/')) {
    const result = await router.route(msg.content)
    await api.reply(result)
    return
  }

  // 2. 调用 Agent
  const agent = agentManager.getCurrent()
  const reply = await agentManager.send({
    prompt: msg.content,
    cwd: config.workingDirectory
  })

  // 3. 流式回复
  for await (const output of reply) {
    if (output.type === 'text') {
      await api.reply(output.delta)
    }
  }
}
```

### 2.3 命令路由设计

```typescript
// src/commands/router.ts
export const router = {
  '/help': () => ({
    text: '可用命令：\n/agent - 切换 Agent\n/clear - 清空会话\n/help - 显示帮助'
  }),

  '/agent': async (args: string) => {
    const agentName = args.trim()
    await agentManager.switchTo(agentName)
    return { text: `已切换到 ${agentName}` }
  },

  '/clear': async () => {
    await sessionManager.clearCurrentSession()
    return { text: '已清空会话' }
  }
}

export async function route(content: string): Promise<string> {
  const [command, ...args] = content.split(' ')
  const handler = router[command]

  if (handler) {
    return await handler(args.join(' '))
  }

  return { text: '未知命令，输入 /help 查看帮助' }
}
```

---

## 3. 会话管理模块详细设计

### 3.1 会话创建逻辑

```typescript
// src/session.ts
export async function getOrCreateSession(agentId: number, agentName: string, title?: string) {
  // 1. 查找最新会话（空会话复用）
  const sessions = await getSessions(agentId)
  const emptySession = sessions.find(s => s.messageCount === 0)

  if (emptySession) {
    return emptySession
  }

  // 2. 创建新会话
  return await createSession(agentId, agentName, title)
}

export async function createSession(agentId: number, agentName: string, title?: string) {
  const db = await getDb()
  db.run(`
    INSERT INTO sessions (agent_id, title, created_at, updated_at)
    VALUES (?, ?, datetime('now','localtime'), datetime('now','localtime'))
  `, [agentId, title || '新会话'])

  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
  saveDb()

  return {
    id,
    agentId,
    title: title || '新会话',
    messageCount: 0,
    createdAt: new Date().toISOString()
  }
}
```

### 3.2 消息存储与检索

```typescript
// src/session.ts
export async function addMessage(
  sessionId: number,
  agentName: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  source: 'desktop' | 'wechat'
) {
  const db = await getDb()
  db.run(`
    INSERT INTO messages (session_id, agent_name, role, content, source, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [sessionId, agentName, role, content, source, Date.now()])

  // 更新会话时间
  db.run(`
    UPDATE sessions SET updated_at = datetime('now','localtime')
    WHERE id = ?
  `, [sessionId])

  saveDb()
}

export async function getMessages(sessionId: number, limit?: number) {
  const db = await getDb()
  let sql = `
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `

  if (limit) {
    sql += ` LIMIT ${limit}`
  }

  const result = db.exec(sql, [sessionId])
  // ... 解析结果
  return messages
}
```

### 3.3 自动更新会话标题

```typescript
// src/session.ts
export async function autoUpdateTitle(sessionId: number) {
  // 1. 获取会话消息数
  const messages = await getMessages(sessionId, 10)

  if (messages.length >= 2 && messages[0].role === 'user') {
    // 2. 使用首条用户消息作为标题
    let title = messages[0].content.slice(0, 50)
    if (messages[0].content.length > 50) {
      title += '...'
    }

    // 3. 更新标题
    const db = await getDb()
    db.run(`UPDATE sessions SET title = ? WHERE id = ?`, [title, sessionId])
    saveDb()
  }
}
```

---

## 4. 加密模块详细设计

### 4.1 主密码派生

```typescript
// src/crypto/encryption.ts
import { createHash, pbkdf2Sync } from 'crypto'

const SALT = 'wechat-link-agent-salt-v1'
const ITERATIONS = 100000
const KEY_LENGTH = 32

export function deriveKey(password: string): Buffer {
  return pbkdf2Sync(password, SALT, ITERATIONS, KEY_LENGTH, 'sha256')
}

export function hashPassword(password: string): string {
  const hash = createHash('sha256').update(password).digest('hex')
  return hash
}
```

### 4.2 API Key 加密/解密

```typescript
// src/crypto/encryption.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

export interface EncryptedData {
  ciphertext: string
  iv: string
  tag: string
}

export function encryptApiKey(apiKey: string): EncryptedData {
  const key = getDerivedKey()
  const iv = randomBytes(16)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(apiKey, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag: tag
  }
}

export function decryptApiKey(ciphertext: string, iv: string, tag: string): string {
  const key = getDerivedKey()

  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  )
  decipher.setAuthTag(Buffer.from(tag, 'hex'))

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
```

### 4.3 设备信任缓存

```typescript
// src/crypto/encryption.ts
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'

const TRUST_FILE = join(homedir(), '.wechat-link-agent', '.trust')

export function saveDeviceTrust(password: string): void {
  const key = deriveKey(password)
  const trustData = {
    timestamp: Date.now(),
    key: key.toString('hex')
  }

  writeFileSync(TRUST_FILE, JSON.stringify(trustData), 'utf-8')
}

export function loadDeviceTrust(): Buffer | null {
  if (!existsSync(TRUST_FILE)) return null

  try {
    const trustData = JSON.parse(readFileSync(TRUST_FILE, 'utf-8'))
    return Buffer.from(trustData.key, 'hex')
  } catch {
    return null
  }
}

export function clearDeviceTrust(): void {
  if (existsSync(TRUST_FILE)) {
    unlinkSync(TRUST_FILE)
  }
}
```

---

## 5. WebDAV 同步模块详细设计

### 5.1 同步配置管理

```typescript
// src/sync/webdav.ts
import { createClient } from 'webdav'

export class WebDAVSync {
  private client: WebDAVClient | null = null
  private config: SyncConfig | null = null

  configure(config: SyncConfig) {
    this.config = config
    this.client = createClient(config.url, {
      username: config.username,
      password: config.password
    })
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false

    try {
      await this.client.exists('/')
      return true
    } catch {
      return false
    }
  }
}
```

### 5.2 上传/下载逻辑

```typescript
// src/sync/webdav.ts
const DB_PATH = join(homedir(), '.wechat-link-agent', 'wla.db')
const REMOTE_PATH = '/wechat-link-agent/wla.db'

export async function upload(): Promise<boolean> {
  if (!this.client) throw new Error('未配置 WebDAV')

  try {
    const dbData = await fs.readFile(DB_PATH)

    // 1. 确保远程目录存在
    await this.client.createDirectory('/wechat-link-agent', { recursive: true })

    // 2. 上传文件
    await this.client.putFileContents(REMOTE_PATH, dbData, {
      overwrite: true
    })

    return true
  } catch (error) {
    logger.error('上传失败', { error: error.message })
    return false
  }
}

export async function download(): Promise<boolean> {
  if (!this.client) throw new Error('未配置 WebDAV')

  try {
    // 1. 检查远程文件是否存在
    const exists = await this.client.exists(REMOTE_PATH)
    if (!exists) {
      throw new Error('远程文件不存在')
    }

    // 2. 下载文件
    const dbData = await this.client.getFileContents(REMOTE_PATH) as Buffer

    // 3. 备份本地文件
    await createBackup()

    // 4. 写入本地
    await fs.writeFile(DB_PATH, dbData)

    // 5. 重新加载数据库
    await reloadDatabase()

    return true
  } catch (error) {
    logger.error('下载失败', { error: error.message })
    return false
  }
}
```

---

## 6. 异常处理设计

### 6.1 子进程超时控制

```typescript
// src/utils/spawn.ts
export async function spawnWithTimeout(
  command: string,
  args: string[],
  options: SpawnOptions,
  timeoutMs: number = 5 * 60 * 1000
): Promise<SpawnResult> {
  const child = spawn(command, args, options)

  let stdout = ''
  let stderr = ''

  child.stdout?.on('data', (data) => { stdout += data })
  child.stderr?.on('data', (data) => { stderr += data })

  // 超时控制
  const timeout = setTimeout(() => {
    child.kill('SIGTERM')
  }, timeoutMs)

  return new Promise((resolve) => {
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr })
    })
  })
}
```

### 6.2 指数退避重试

```typescript
// src/utils/retry.ts
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        await sleep(delay)
      }
    }
  }

  throw lastError
}
```

---

*本文档描述了核心模块的内部实现逻辑，供开发者深入理解代码*