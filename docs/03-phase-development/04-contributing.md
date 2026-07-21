# 贡献指南 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 贡献指南 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-07-20 |
| 关联文档 | [编码规范](./02-coding-standards.md)、[README 贡献章节](../../README.md#-贡献) |

---

## 1. 概述

感谢你对微连项目的关注！本文档是 Doc-as-Code 实践的一部分，将 PR 评审标准、CI 门禁规则、分支模型统一固化为可追溯文档。

无论你是修复一个 typo 还是添加一个新 Provider，都欢迎提交 Pull Request。请按照以下流程参与贡献。

---

## 2. 分支模型

本项目采用**简化版 Git Flow**，遵循 [SemVer 语义化版本](https://semver.org/lang/zh-CN/) 规范。

### 2.1 分支职责

| 分支 | 作用 | 生命周期 | 谁来提交 |
|------|------|---------|---------|
| `master` | 生产发布分支，始终可发布 | 永久 | 🔒 受保护，只通过 PR/合并进入 |
| `dev` | 开发集成分支，下一个版本的开发线 | 永久 | ✅ **协作者往这里提 PR** |
| `feature/*` | 单个功能开发 | 临时 | 完成后合并到 dev |
| `hotfix/*` | 紧急 bug 修复 | 临时 | 合并到 master + dev 后删除 |

### 2.2 分支保护规则

仓库管理员应在 GitHub / Gitee 中配置以下分支保护规则：

**`master` 分支（严格保护）：**

| 规则 | 说明 |
|------|------|
| ☑ 禁止 force push | 防止历史被覆盖 |
| ☑ 禁止删除 | 防止误删主分支 |
| ☑ 合并需 PR 审查 | 至少 1 个 approval |
| ☑ CI 检查必须通过 | typecheck + 构建验证 |
| ☑ 分支必须是最新的 | 合并前需 rebase 到目标分支最新 |
| ☑ 限制推送权限 | 仅仓库 Owner 可直接 push |

**`dev` 分支（适度保护）：**

| 规则 | 说明 |
|------|------|
| ☑ 禁止 force push | 防止历史被覆盖 |
| ☑ 禁止删除 | 防止误删开发分支 |
| ☑ CI 检查必须通过 | PR 自动触发类型检查 + 构建验证 |
| ☐ 合并需 PR 审查 | 可选，信任的核心贡献者可直接 push |

---

## 3. 贡献流程

### 3.1 完整流程图

```
Fork 仓库
  │
  ▼
克隆 Fork 到本地 → 切到 dev 分支
  │
  ▼
从 dev 拉出 feature/xxx 分支
  │
  ▼
开发 + 本地测试（npm run typecheck）
  │
  ▼
提交代码（遵循 Conventional Commits）
  │
  ▼
推送到你的 Fork
  │
  ▼
在 GitHub 上发起 PR → 目标分支选 dev
  │
  ▼
CI 自动检查（类型检查 + 构建验证）
  │
  ├── 检查失败 → 修改代码重新 push
  │
  └── 检查通过 → 等待维护者 Review
                   │
                   ├── Request Changes → 修改后重新 push
                   │
                   └── Approved → Squash Merge 到 dev
                                   │
                                   ▼
                              删除 feature 分支
```

### 3.2 详细步骤

#### Step 1: Fork & Clone

```bash
# 1. 在 GitHub 上点击 Fork 按钮，将仓库 Fork 到你的账号

# 2. 克隆你的 Fork（替换 YOUR_USERNAME）
git clone https://github.com/YOUR_USERNAME/wechat-link-agent.git
cd wechat-link-agent

# 3. 添加上游仓库（用于同步最新代码）
git remote add upstream https://github.com/gcd888/wechat-link-agent.git
```

#### Step 2: 创建功能分支

```bash
# 切到 dev 分支并同步最新代码
git checkout dev
git pull upstream dev

# 从 dev 拉出功能分支
git checkout -b feature/your-feature-name

# 命名示例：
# feature/agent-scanner      — Agent 扫描功能
# feature/wechat-media       — 微信媒体上传
# fix/dark-theme-button      — 修复深色主题按钮
```

#### Step 3: 开发 & 提交

```bash
# 开发完成后，运行类型检查
npm run typecheck

# 提交代码（遵循 Conventional Commits）
git add -A
git commit -m "feat(agent): 添加 Claude Provider 流式输出支持"
```

#### Step 4: 推送 & 发起 PR

```bash
# 推送到你的 Fork
git push origin feature/your-feature-name

# 在 GitHub 上发起 Pull Request：
# - 源分支：你的 Fork / feature/your-feature-name
# - 目标分支：gcd888/wechat-link-agent / dev
```

> ⚠️ **重要**：PR 目标分支必须选 `dev`。提交到 `master` 的 PR 将被直接关闭。

#### Step 5: 同步上游更新

如果上游 dev 有新提交，在开发期间需要同步：

```bash
git checkout dev
git pull upstream dev
git checkout feature/your-feature-name
git rebase dev  # 将你的提交 rebase 到最新 dev 之上
git push origin feature/your-feature-name --force-with-lease
```

---

## 4. CI 门禁规则

### 4.1 自动触发条件

| 触发事件 | 工作流 | 检查内容 |
|---------|--------|---------|
| PR → dev | `ci.yml` | TypeScript 类型检查 + 构建验证 |
| PR → master | `ci.yml` | TypeScript 类型检查 + 构建验证 |
| push → dev | `ci.yml` | TypeScript 类型检查 + 构建验证 |
| push tag v* | `build.yml` | 三平台打包 + 发布 Release |

### 4.2 CI 检查流程

```
PR 提交
  │
  ▼
检出代码 → 安装依赖（--legacy-peer-deps）
  │
  ▼
npm run typecheck（tsc --noEmit）
  │
  ├── ❌ 失败 → PR 显示红色 ❌ → 修改后重新 push
  │
  ▼
npx electron-vite build（构建验证）
  │
  ├── ❌ 失败 → PR 显示红色 ❌ → 修改后重新 push
  │
  ▼
✅ 全部通过 → PR 显示绿色 ✅ → 等待人工 Review
```

### 4.3 CI 与发布的关系

```
CI（ci.yml）               发布（build.yml）
─────────────              ──────────────────
PR 时自动触发               push tag 时自动触发
只做检查，不打包             三平台打包 + 发布 Release
快速反馈（~2 分钟）          完整构建（~15 分钟）
```

---

## 5. Code Review 标准

### 5.1 自动检查（CI 拦截）

以下问题会被 CI 自动拦截，无需人工检查：

- ❌ TypeScript 类型错误
- ❌ 构建编译失败

### 5.2 人工 Review 检查清单

维护者在 Review PR 时，按以下清单逐项检查：

#### 代码质量

- [ ] 代码符合[编码规范](./02-coding-standards.md)
- [ ] TypeScript 类型正确，无 `any`
- [ ] 核心逻辑有中文注释
- [ ] 无 `console.log` 残留
- [ ] 无硬编码路径 / API Key / 密钥
- [ ] 错误处理完善（try-catch / 类型守卫）

#### 架构一致性

- [ ] 不破坏现有 IPC 接口
- [ ] 不破坏数据库 Schema（如修改需提供迁移方案）
- [ ] 新增 Provider 按 `AgentProvider` 接口实现并注册到工厂
- [ ] 新增依赖为 MIT/Apache/BSD 等宽松协议（禁止 GPL）
- [ ] 新增依赖不与现有技术栈冲突

#### 提交质量

- [ ] 提交信息遵循 Conventional Commits 规范
- [ ] 一个 PR 只做一件事（不混合无关功能）
- [ ] 无 `// TODO` 临时标记残留（除非有明确计划）

### 5.3 Review 结果处理

| 维护者操作 | 含义 | 贡献者需要做 |
|-----------|------|------------|
| **Comment** | 有小问题但不需要阻塞 | 可选择性修改，回复确认 |
| **Request Changes** | 有必须修改的问题 | 修改后重新 push，PR 自动重新触发 CI |
| **Approve** | 代码通过 Review | 等待合并即可 |
| **Close** | 不接受此 PR | 可在 Issues 中讨论替代方案 |

---

## 6. 提交信息规范

### 6.1 格式

```
<type>(<scope>): <subject>
```

### 6.2 类型（type）

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(agent): 添加 Claude Provider 支持` |
| `fix` | Bug 修复 | `fix(ui): 修复深色主题下按钮颜色问题` |
| `docs` | 文档更新 | `docs: 更新 API 接口文档` |
| `style` | 代码格式 | `style: 格式化代码` |
| `refactor` | 重构 | `refactor(session): 优化会话加载性能` |
| `test` | 测试 | `test: 添加 Agent 扫描单元测试` |
| `chore` | 构建/依赖 | `chore: 升级 electron 到 33.2.0` |

### 6.3 范围（scope）

常用 scope：`agent`、`wechat`、`ui`、`session`、`database`、`sync`、`crypto`、`commands`

### 6.4 合并策略

| 策略 | 使用场景 |
|------|---------|
| **Squash and Merge** ⭐ 首选 | 将 PR 的多个提交压缩为一个干净提交 |
| **Rebase and Merge** | 提交历史规范时，保留每个 commit |
| **Create Merge Commit** | 大型功能分支，需保留拓扑记录 |

---

## 7. 开发环境

### 7.1 前置要求

- **Node.js** v18+（推荐 v20）
- **npm** v9+
- **操作系统**：Windows 10+ / macOS 12+ / Linux (Ubuntu 20.04+)

### 7.2 常用命令

```bash
npm run dev          # 开发模式（热重载）
npm run typecheck    # TypeScript 类型检查
npm run build        # 构建生产产物
npm run prod         # 构建 + 打包安装包
```

### 7.3 新增 Agent Provider

1. 在 `src/agent/providers/` 创建新文件
2. 实现 `AgentProvider` 接口
3. 在 `src/agent/provider.ts` 中注册
4. 在 `agent_registry` 种子数据中添加配置

详见 [编码规范文档](./02-coding-standards.md) 和 [详细设计说明书](./01-lld.md)。

---

## 8. 常见问题

### Q: PR 的 CI 检查失败了怎么办？

A: 点击 CI 检查结果中的 "Details" 查看失败日志，常见原因：
- TypeScript 类型错误 → 运行 `npm run typecheck` 本地复现
- 构建失败 → 运行 `npx electron-vite build` 本地复现
- 依赖安装失败 → 确认使用了 `--legacy-peer-deps`

### Q: 我的 PR 被要求修改，怎么更新？

A: 在同一个 feature 分支上继续修改并 commit，然后 `git push origin feature/xxx`。PR 会自动更新并重新触发 CI。

### Q: 可以直接 push 到 dev 吗？

A: 如果你是仓库 Owner / 核心贡献者且 dev 未开启 "需 PR 审查" 规则，可以直接 push。但建议仍通过 PR 流程，让 CI 自动检查。

### Q: 紧急 hotfix 怎么走？

A: 从 `master` 拉出 `hotfix/vX.Y.Z` 分支，修复后 PR 到 master + dev。详见 README 中的 [发布流程](../../README.md#-分支模型与版本规范)。

---

## 9. 行为准则

- 🤝 **友善尊重**：对所有贡献者保持友善和尊重
- 🎯 **聚焦问题**：Review 时对事不对人，聚焦代码质量
- 📖 **文档同步**：功能变更时同步更新相关文档
- 🔒 **安全第一**：发现安全漏洞请私下联系维护者，不要在公开 Issue 中披露

---

*最后更新：2026-07-20*
