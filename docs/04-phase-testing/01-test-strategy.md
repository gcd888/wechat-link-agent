# 测试策略与计划 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 测试策略与计划 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 测试概述

### 1.1 测试目标

- 确保核心功能正常运行
- 验证多平台兼容性
- 保证数据安全和稳定性
- 提升用户体验

### 1.2 测试范围

| 模块 | 测试类型 | 优先级 |
|------|----------|--------|
| Agent 管理 | 功能测试 | P0 |
| 微信集成 | 功能测试 | P0 |
| 会话管理 | 功能测试 | P0 |
| 数据存储 | 集成测试 | P1 |
| UI 交互 | 界面测试 | P1 |
| 加密模块 | 安全测试 | P1 |

---

## 2. 测试策略

### 2.1 测试层级

```
┌─────────────────────────────────────┐
│         E2E 测试 (Playwright)        │  端到端用户流程
├─────────────────────────────────────┤
│         集成测试 (Vitest)            │  模块间交互
├─────────────────────────────────────┤
│         单元测试 (Vitest)            │  独立函数测试
└─────────────────────────────────────┘
```

### 2.2 测试优先级

| 优先级 | 定义 | 测试范围 |
|--------|------|----------|
| P0 | 核心功能 | Agent 发送消息、微信登录、数据持久化 |
| P1 | 重要功能 | 会话管理、配置保存、WebDAV 同步 |
| P2 | 辅助功能 | UI 细节、错误提示、性能优化 |

---

## 3. 单元测试

### 3.1 测试工具

- **框架**: Vitest
- **覆盖率**: c8
- **Mock**: vi.fn()

### 3.2 测试示例

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
    expect(results.length).toBeGreaterThan(0)
  })

  it('应过滤不存在的 Agent', async () => {
    vi.mock('node:fs/promises', () => ({
      exists: vi.fn(() => Promise.resolve(false))
    }))

    const results = await scanAll()

    expect(results.length).toBe(0)
  })
})
```

### 3.3 覆盖率要求

- **语句覆盖率**: ≥ 80%
- **分支覆盖率**: ≥ 70%
- **函数覆盖率**: ≥ 85%

### 3.4 运行测试

```bash
# 运行所有测试
npm test

# 运行特定文件
npm test scanner.test.ts

# 生成覆盖率报告
npm run test:coverage
```

---

## 4. 集成测试

### 4.1 测试范围

- Agent Manager 与数据库交互
- 微信模块与 API 交互
- 加密模块的端到端流程

### 4.2 测试示例

```typescript
// src/database/__tests__/db-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, saveDb } from '../db'

describe('数据库集成测试', () => {
  beforeEach(() => {
    // 初始化测试数据库
  })

  afterEach(() => {
    // 清理测试数据
  })

  it('应正确保存和读取配置', async () => {
    const db = await getDb()
    db.run("INSERT INTO config (key, value) VALUES ('theme', 'dark')")
    saveDb()

    const result = db.exec("SELECT value FROM config WHERE key = 'theme'")
    expect(result[0].values[0][0]).toBe('dark')
  })
})
```

---

## 5. E2E 测试

### 5.1 测试工具

- **框架**: Playwright
- **场景**: 用户实际操作流程

### 5.2 测试场景

#### 5.2.1 Agent 安装与切换

```typescript
// tests/e2e/agent-flow.spec.ts
import { test, expect } from '@playwright/test'

test('安装并切换 Agent', async ({ page }) => {
  // 1. 启动应用
  await page.goto('http://localhost:3000')

  // 2. 进入 Agent 管理页面
  await page.click('[data-testid="nav-agent"]')

  // 3. 点击安装按钮
  await page.click('[data-testid="install-claude"]')

  // 4. 等待安装完成
  await expect(page.locator('[data-testid="install-success"]')).toBeVisible()

  // 5. 切换到 Claude Agent
  await page.click('[data-testid="agent-claude"]')

  // 6. 验证当前 Agent
  const currentAgent = await page.textContent('[data-testid="current-agent"]')
  expect(currentAgent).toBe('claude')
})
```

#### 5.2.2 发送消息流程

```typescript
test('发送消息并接收回复', async ({ page }) => {
  // 1. 进入聊天页面
  await page.goto('http://localhost:3000')
  await page.click('[data-testid="nav-chat"]')

  // 2. 输入消息
  await page.fill('[data-testid="message-input"]', 'Hello, world!')

  // 3. 发送
  await page.click('[data-testid="send-button"]')

  // 4. 等待回复
  await expect(page.locator('[data-testid="message-assistant"]')).toBeVisible()

  // 5. 验证消息内容
  const reply = await page.textContent('[data-testid="message-assistant"]')
  expect(reply.length).toBeGreaterThan(0)
})
```

### 5.3 运行 E2E 测试

```bash
# 启动开发服务器
npm run dev

# 在另一个终端运行 E2E 测试
npm run test:e2e
```

---

## 6. 手动测试计划

### 6.1 功能测试清单

#### 6.1.1 Agent 管理

| 测试项 | 操作 | 预期结果 | 优先级 |
|--------|------|----------|--------|
| 扫描 PATH | 点击「重新扫描」 | 显示所有已安装的 Agent | P0 |
| 添加 Agent | 填写配置并保存 | Agent 出现在列表中 | P0 |
| 删除 Agent | 点击删除按钮 | Agent 从列表移除 | P1 |
| 切换 Agent | 点击 Agent 项 | 当前 Agent 变更 | P0 |

#### 6.1.2 消息发送

| 测试项 | 操作 | 预期结果 | 优先级 |
|--------|------|----------|--------|
| 发送纯文本 | 输入文本并回车 | 消息显示在列表，收到回复 | P0 |
| 发送长文本 | 输入 >1000 字符 | 完整发送和显示 | P1 |
| 流式输出 | 观察回复过程 | 逐字显示，无卡顿 | P0 |
| 网络中断 | 断网后发送 | 显示错误提示 | P1 |

#### 6.1.3 微信集成

| 测试项 | 操作 | 预期结果 | 优先级 |
|--------|------|----------|--------|
| 扫码登录 | 扫描二维码 | 登录成功，显示连接状态 | P0 |
| 微信发送消息 | 微信发送消息 | 桌面端收到并回复 | P0 |
| 断线重连 | 断开网络后恢复 | 自动重连成功 | P1 |

#### 6.1.4 会话管理

| 测试项 | 操作 | 预期结果 | 优先级 |
|--------|------|----------|--------|
| 创建会话 | 点击「新会话」 | 创建成功，自动切换 | P0 |
| 删除会话 | 点击删除按钮 | 会话移除，消息清空 | P1 |
| 重命名会话 | 修改标题 | 标题更新成功 | P1 |
| 导出会话 | 点击导出按钮 | 下载 Markdown 文件 | P1 |

#### 6.1.5 配置管理

| 测试项 | 操作 | 预期结果 | 优先级 |
|--------|------|----------|--------|
| 切换主题 | 选择浅色/深色 | 主题立即切换 | P0 |
| 切换语言 | 选择英文 | 所有文本变为英文 | P1 |
| 设置密码 | 输入密码并保存 | 密码保护生效 | P0 |
| WebDAV 同步 | 配置并测试连接 | 连接测试成功 | P1 |

### 6.2 兼容性测试

| 平台 | 测试项 | 预期结果 |
|------|--------|----------|
| Windows 10 | 安装、运行、消息发送 | 正常 |
| Windows 11 | 安装、运行、消息发送 | 正常 |
| macOS 12 | 安装、运行、消息发送 | 正常 |
| macOS 14 | 安装、运行、消息发送 | 正常 |
| Ubuntu 20.04 | 安装、运行、消息发送 | 正常 |
| Ubuntu 22.04 | 安装、运行、消息发送 | 正常 |

---

## 7. 性能测试

### 7.1 测试指标

| 指标 | 目标值 |
|------|--------|
| 应用启动时间 | < 3 秒 |
| 消息发送延迟 | < 1 秒 |
| 流式输出延迟 | < 500ms |
| 内存占用 | < 500MB |
| CPU 占用 | < 10%（空闲时） |

### 7.2 压力测试

```typescript
// 性能测试示例
test.concurrent('并发发送 10 条消息', async () => {
  const promises = []
  for (let i = 0; i < 10; i++) {
    promises.push(sendMessage(`Test message ${i}`))
  }

  const start = Date.now()
  await Promise.all(promises)
  const duration = Date.now() - start

  expect(duration).toBeLessThan(5000) // 5 秒内完成
})
```

---

## 8. 安全测试

### 8.1 测试项

| 测试项 | 操作 | 预期结果 |
|--------|------|----------|
| API Key 加密 | 保存 API Key | 数据库中存储为密文 |
| 密码保护 | 未解锁查看 API Key | 提示输入密码 |
| SQL 注入 | 输入 `' OR '1'='1` | 无异常，安全过滤 |
| XSS 攻击 | 输入 `<script>alert(1)</script>` | 转义显示，不执行 |

### 8.2 加密验证

```typescript
test('API Key 应加密存储', async () => {
  const apiKey = 'sk-test-key'
  const encrypted = encryptApiKey(apiKey)

  expect(encrypted.ciphertext).not.toBe(apiKey)
  expect(encrypted.iv).toBeDefined()
  expect(encrypted.tag).toBeDefined()
})
```

---

## 9. 测试执行计划

### 9.1 测试轮次

| 轮次 | 时间 | 测试内容 | 责任人 |
|------|------|----------|--------|
| 第一轮 | 开发完成后 | P0 功能测试 | 开发者 |
| 第二轮 | 功能完善后 | P1 功能 + 兼容性测试 | 开发者 |
| 第三轮 | 发布前 | E2E + 性能 + 安全测试 | 测试负责人 |

### 9.2 冒烟测试

每次发布前执行：

```bash
# 快速验证核心功能
npm run test:smoke
```

包含：
- Agent 切换
- 消息发送
- 数据持久化
- 微信连接

---

## 10. 缺陷管理

### 10.1 缺陷等级

| 等级 | 定义 | 示例 |
|------|------|------|
| P0 | 崩溃或核心功能不可用 | 应用启动失败、消息无法发送 |
| P1 | 重要功能异常 | 会话丢失、数据损坏 |
| P2 | 次要功能异常 | UI 错位、提示不准确 |
| P3 | 体验问题 | 字体大小不合适、动画不流畅 |

### 10.2 缺陷报告模板

```markdown
## 缺陷标题

### 环境信息
- 操作系统: Windows 11
- 应用版本: 0.1.0

### 复现步骤
1. 打开应用
2. 进入 Agent 管理页面
3. 点击删除按钮

### 预期结果
Agent 从列表移除

### 实际结果
应用崩溃

### 附件
- 截图: error.png
- 日志: app-error.log
```

---

## 11. 持续集成

### 11.1 CI 配置

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run test:e2e
```

### 11.2 测试触发条件

- Push 到 `main` 分支
- 创建 Pull Request
- 定时任务（每日凌晨）

---

*所有测试完成后需生成测试报告并存档*