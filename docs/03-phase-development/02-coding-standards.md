# 编码规范文档 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 编码规范文档 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 概述

本文档定义了微连项目的编码规范，确保代码风格统一、可维护性强。

### 1.1 适用范围

- TypeScript / JavaScript
- React 组件
- Node.js 模块
- 数据库 SQL

### 1.2 核心原则

- **可读性优先**：代码应像文档一样清晰
- **类型安全**：充分利用 TypeScript 类型系统
- **一致性**：遵循 ESLint + Prettier 配置
- **中文注释**：核心逻辑必须有中文注释

---

## 2. 命名规范

### 2.1 文件命名

```
✅ 推荐
- agent-manager.ts         # kebab-case
- useAgentStore.ts         # camelCase (hooks)
- AgentList.tsx            # PascalCase (组件)
- types.ts                 # 复数形式（类型定义）

❌ 避免
- AgentManager.ts          # 主进程模块用 kebab-case
- agentList.tsx            # 组件用 PascalCase
- type.ts                  # 用 types.ts
```

### 2.2 变量命名

```typescript
// 常量：UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3
const DB_PATH = '/path/to/db'

// 变量/函数：camelCase
let currentAgentId = 1
function sendMessage() { }

// 类/接口/类型：PascalCase
class AgentManager { }
interface AgentConfig { }
type AgentStatus = 'online' | 'offline'

// 私有属性：下划线前缀
class MyClass {
  private _internalData: any
}
```

### 2.3 数据库命名

```sql
-- 表名：snake_case
CREATE TABLE agent_registry (...);
CREATE TABLE llm_providers (...);

-- 字段名：snake_case
CREATE TABLE agents (
  id INTEGER PRIMARY KEY,
  agent_name TEXT,
  created_at TEXT
);

-- 索引：idx_表名_字段名
CREATE INDEX idx_agents_provider ON agents(provider_type);
```

---

## 3. 代码格式

### 3.1 缩进与空格

```typescript
// 使用 2 空格缩进
function example() {
  if (condition) {
    doSomething()
  }
}

// 对象/数组：花括号后空格
const obj = { key: 'value' }
const arr = [1, 2, 3]

// 函数参数：逗号后空格
function func(a, b, c) { }
```

### 3.2 分号

```typescript
// 语句末尾必须有分号
const a = 1;
function foo() { };
```

### 3.3 引号

```typescript
// 优先使用单引号（字符串）
const str = 'hello';

// JSON 或 JSX 属性使用双引号
const json = '{"key": "value"}';
<div className="container" />
```

---

## 4. TypeScript 规范

### 4.1 类型定义

```typescript
// ✅ 使用 interface 定义对象结构
interface AgentConfig {
  id: number;
  name: string;
  providerType: 'claude' | 'opencode' | 'generic';
}

// ✅ 使用 type 定义联合类型或别名
type AgentStatus = 'online' | 'offline' | 'processing';

// ✅ 使用 enum 定义枚举（必要时）
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  ERROR = 'error'
}

// ❌ 避免 any，使用 unknown 或具体类型
function parse(data: unknown): Result {
  // ...
}
```

### 4.2 函数签名

```typescript
// ✅ 明确参数类型和返回类型
function sendMessage(
  text: string,
  sessionId?: number
): Promise<{ success: boolean; error?: string }> {
  // ...
}

// ✅ 使用接口定义复杂参数
interface MessageInput {
  text: string;
  sessionId?: number;
  files?: File[];
}

function sendMessage(input: MessageInput): Promise<void> {
  // ...
}
```

### 4.3 泛型

```typescript
// ✅ 泛型参数使用 T、U、V 等大写字母
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

// ✅ 使用约束
function process<T extends { id: number }>(item: T): T {
  return item;
}
```

---

## 5. React 规范

### 5.1 组件定义

```typescript
// ✅ 函数组件 + TypeScript
interface Props {
  title: string;
  onClick?: () => void;
}

export function Button({ title, onClick }: Props) {
  return <button onClick={onClick}>{title}</button>;
}

// ✅ 使用 React.FC（旧式，不推荐）
// export const Button: React.FC<Props> = ({ title }) => { }
```

### 5.2 Hooks 使用

```typescript
// ✅ 自定义 Hook 以 use 开头
export function useAgentList() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    loadAgents().then(setAgents);
  }, []);

  return agents;
}

// ✅ 依赖数组包含所有外部依赖
useEffect(() => {
  document.title = title;
}, [title]); // ✅ 依赖明确

// ❌ 缺少依赖
useEffect(() => {
  document.title = title;
}); // ❌
```

### 5.3 事件处理

```typescript
// ✅ 事件处理函数以 on 开头
export function ChatPage() {
  const onSendMessage = async (text: string) => {
    await sendMessage(text);
  };

  return <Input onSend={onSendMessage} />;
}
```

### 5.4 条件渲染

```typescript
// ✅ 使用 && 短路
{isLoggedIn && <WelcomePanel />}

// ✅ 使用三元表达式
{error ? <ErrorMessage /> : <ContentPanel />}

// ✅ 提取变量
const showContent = isAuthenticated && hasPermission;
{showContent && <Content />}
```

---

## 6. 注释规范

### 6.1 文件头注释

```typescript
/**
 * Agent 管理模块
 *
 * 负责:
 *   - Agent 的增删改查
 *   - Agent 状态管理
 *   - Agent 消息发送（流式）
 */

import { AgentManager } from './manager.js';
```

### 6.2 函数注释

```typescript
/**
 * 发送消息给 Agent
 *
 * @param text - 消息内容
 * @param sessionId - 会话 ID（可选，默认使用当前会话）
 * @returns Promise<{ success: boolean; content?: string; error?: string }>
 */
export async function sendMessage(
  text: string,
  sessionId?: number
): Promise<MessageResult> {
  // ...
}
```

### 6.3 行内注释

```typescript
// ✅ 简短注释
const threshold = 1024; // 1KB

// ✅ 解释复杂逻辑
// 使用 PBKDF2 派生密钥，迭代 10 万次增强安全性
const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');

// ✅ TODO 标记
// TODO: 添加重试机制
await fetch(url);
```

---

## 7. 错误处理

### 7.1 异步错误

```typescript
// ✅ 使用 try-catch
export async function sendCommand(cmd: string): Promise<void> {
  try {
    await execute(cmd);
  } catch (error) {
    logger.error('命令执行失败', { error: error instanceof Error ? error.message : String(error) });
    throw error; // 重新抛出
  }
}
```

### 7.2 类型守卫

```typescript
// ✅ 检查 Error 实例
function handleError(error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
}
```

---

## 8. 导入规范

### 8.1 导入顺序

```typescript
// 1. Node.js 内置模块
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// 2. 第三方依赖
import React from 'react';
import { createClient } from 'webdav';

// 3. 内部模块（相对路径）
import { AgentManager } from './agent/manager.js';
import { logger } from '../logger.js';
```

### 8.2 导入别名

```typescript
// ✅ 避免命名冲突
import { exists as pathExists } from 'node:fs';
import { exists as dbExists } from './db.js';

// ✅ 解构导入
import { type AgentConfig, type AgentStatus } from './types.js';
```

---

## 9. ESLint + Prettier 配置

项目已配置 `.eslintrc.json` 和 `.prettierrc`，主要规则：

### 9.1 ESLint 规则

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended"
  ],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "react/react-in-jsx-scope": "off"
  }
}
```

### 9.2 Prettier 配置

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## 10. Git 分支策略

### 10.1 分支命名

```
main/master        # 主分支（生产环境）
develop            # 开发分支
feature/xxx        # 功能分支
bugfix/xxx         # 修复分支
hotfix/xxx         # 紧急修复
```

### 10.2 提交信息

```
✅ 推荐
feat(agent): 添加 Claude Provider 支持
fix(ui): 修复深色主题下按钮颜色问题
docs: 更新 API 接口文档
style: 格式化代码
refactor(session): 优化会话加载性能
test: 添加单元测试
chore: 升级依赖版本

❌ 避免
修复bug
update
fix
```

### 10.3 Code Review 检查清单

- [ ] 代码符合本规范
- [ ] 无 ESLint 警告
- [ ] TypeScript 类型正确
- [ ] 关键逻辑有注释
- [ ] 无 console.log
- [ ] 错误处理完善
- [ ] 无硬编码路径/密钥

---

## 11. 性能规范

### 11.1 避免不必要的渲染

```typescript
// ✅ 使用 React.memo
export const MessageItem = React.memo(({ message }: Props) => {
  return <div>{message.content}</div>;
});
```

### 11.2 避免闭包陷阱

```typescript
// ❌ 每次渲染创建新函数
useEffect(() => {
  fetchData();
}, [fetchData]); // fetchData 每次都变

// ✅ 使用 useCallback
const fetchData = useCallback(async () => {
  const data = await api.get();
  setData(data);
}, []);

useEffect(() => {
  fetchData();
}, [fetchData]);
```

---

## 12. 安全规范

### 12.1 敏感信息

```typescript
// ❌ 不要硬编码密钥
const API_KEY = 'sk-xxx';

// ✅ 使用环境变量
const API_KEY = process.env.API_KEY;

// ✅ 敏感数据加密存储
const encrypted = encryptApiKey(apiKey);
```

### 12.2 SQL 注入防护

```typescript
// ❌ 字符串拼接
db.run(`SELECT * FROM agents WHERE name = '${name}'`);

// ✅ 参数化查询
db.run(`SELECT * FROM agents WHERE name = ?`, [name]);
```

---

*所有代码提交前请运行 `npm run lint` 和 `npm run typecheck`*