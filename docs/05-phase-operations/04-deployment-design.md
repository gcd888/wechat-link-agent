# 部署设计 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 部署设计 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-07-01 |
| 关联文档 | [安全设计](./05-security-design.md)、[上线发布手册](./03-release-guide.md) |

---

## 1. 部署架构

### 1.1 分发模式

微连是 **Electron 桌面应用**，采用离线安装包分发模式，用户下载安装包后本地运行，无需服务端部署。

```
开发者 ──git push──▶ GitHub 仓库
                       │
                   push tag v*
                       │
                       ▼
              ┌────────────────┐
              │ GitHub Actions  │
              │  自动构建流水线   │
              └───────┬────────┘
                      │
           ┌──────────┼──────────┐
           ▼          ▼          ▼
      Windows     macOS       Linux
      .exe        .dmg       .AppImage
           │          │          │
           └──────────┼──────────┘
                      │
           ┌──────────┼──────────┐
           ▼                     ▼
    GitHub Releases        Gitee Releases
    (海外用户下载)         (国内用户下载)
```

### 1.2 运行时依赖

| 依赖 | 说明 | 是否必须 |
|------|------|----------|
| Node.js | Agent CLI 运行时依赖（非微连本身） | 是（用户需自行安装） |
| Agent CLI | Claude Code / OpenCode 等 | 是（用户需自行安装并认证） |
| iLink Bot | 微信机器人 API 服务 | 是（用户需获取访问令牌） |
| WebDAV 服务器 | 数据云同步 | 否（可选） |

---

## 2. CI/CD 流水线

### 2.1 工作流总览

| 工作流 | 文件 | 触发条件 | 功能 |
|--------|------|----------|------|
| CI 检查 | `.github/workflows/ci.yml` | PR 到 dev/master + push 到 dev | TypeScript 类型检查 + 构建验证 |
| 构建发布 | `.github/workflows/build.yml` | push tag `v*` + 手动触发 | 三平台并行构建 + 双平台 Release |
| 代码同步 | `.github/workflows/sync-to-gitee.yml` | 任意分支 push + 手动触发 | GitHub → Gitee 镜像同步 |

### 2.2 CI 检查流程（ci.yml）

```
PR / push to dev
    │
    ▼
┌─────────────────────┐
│  ubuntu-latest       │
│  Node.js 20          │
│  npm install          │
│  --legacy-peer-deps  │
│                      │
│  1. TypeScript 检查   │
│     npm run typecheck│
│                      │
│  2. 构建验证          │
│     electron-vite    │
│     build            │
└─────────────────────┘
```

**设计要点**：
- 单平台（ubuntu）运行，快速反馈
- 并发取消：同一 PR 多次 push 只保留最新检查
- 禁用 macOS 代码签名检查（`CSC_IDENTITY_AUTO_DISCOVERY=false`）

### 2.3 构建发布流程（build.yml）

```
push tag v*
    │
    ▼
┌─────────────────────────────────────────────┐
│  阶段一：多平台并行构建                        │
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ Windows │  │  macOS  │  │  Linux  │    │
│  │  .exe   │  │  .dmg   │  │.AppImage│    │
│  └────┬────┘  └────┬────┘  └────┬────┘    │
│       └────────────┼────────────┘          │
│                    │                        │
│            上传构建产物到 Actions             │
└────────────────────┼────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼                               ▼
┌──────────────┐            ┌──────────────┐
│ 阶段二：      │            │ 阶段三：      │
│ GitHub Release│            │ Gitee Release │
│              │            │              │
│ 下载全部产物   │            │ 下载全部产物   │
│ 创建 Release  │            │ 创建 Release  │
│ 上传附件      │            │ 逐个上传附件   │
└──────────────┘            └──────────────┘
```

**设计要点**：
- `fail-fast: false`：一个平台失败不影响其他平台
- 构建命令：`electron-vite build && electron-builder --publish never`
- `--publish never`：禁止 electron-builder 自动发布，由后续 Release 作业统一处理
- Gitee 通过 REST API 创建 Release 并上传附件

### 2.4 代码同步流程（sync-to-gitee.yml）

```
任意分支 push
    │
    ▼
检出完整历史 (fetch-depth: 0)
    │
    ▼
添加 Gitee 远程仓库 (HTTPS + Token)
    │
    ▼
推送所有分支 (git push gitee --all --force)
推送所有 tag (git push gitee --tags --force)
```

**设计要点**：
- 使用 `GITEE_TOKEN` 环境变量认证
- `--force` 确保覆盖远程差异
- 同步所有分支和 tag

---

## 3. 环境矩阵

| 环境 | 用途 | 触发方式 | 运行平台 |
|------|------|----------|----------|
| CI 检查 | PR 合并前验证 | PR / push to dev | ubuntu-latest |
| 构建发布 | 生成安装包 | push tag v* | windows + macos + ubuntu |
| 代码同步 | 镜像到 Gitee | 任意 push | ubuntu-latest |
| 本地开发 | 日常开发 | `npm run dev` | 开发者机器 |

---

## 4. 构建产物

| 平台 | 文件格式 | 产物名 | 说明 |
|------|----------|--------|------|
| Windows | NSIS | `微连-Setup-{version}-win.exe` | 安装包 |
| Windows | Portable | `微连-{version}-win.exe` | 便携版 |
| macOS | DMG | `微连-{version}-mac.dmg` | 磁盘镜像 |
| macOS | ZIP | `微连-{version}-mac.zip` | 压缩包 |
| Linux | AppImage | `微连-{version}-linux.AppImage` | 免安装 |
| Linux | DEB | `微连-{version}-linux.deb` | Debian 包 |

---

## 5. 发布流程

### 5.1 正式发布

```bash
# 1. 确保代码在 master 分支且测试通过
git checkout master
git pull origin master

# 2. 更新版本号
npm version patch  # 或 minor / major

# 3. 推送 tag 触发自动构建
git push origin master --tags

# 4. 等待 GitHub Actions 完成三平台构建
# 5. GitHub + Gitee Release 自动创建
```

### 5.2 热修复发布

```bash
# 1. 从 master 创建热修复分支
git checkout -b hotfix/v0.0.2 master

# 2. 修复问题并测试
# ... 修改代码 ...
npm run typecheck && npm run dev

# 3. 更新版本号
npm version patch

# 4. 合并回 master 并推送 tag
git checkout master
git merge hotfix/v0.0.2
git push origin master --tags

# 5. 合并回 dev
git checkout dev
git merge hotfix/v0.0.2
git push origin dev
```

---

## 6. 监控策略

### 6.1 应用级监控

| 指标 | 监控方式 | 说明 |
|------|----------|------|
| 应用崩溃 | 用户反馈 + 日志 | 应用日志存储在 `~/.wechat-link-agent/logs/` |
| Agent 调用失败 | 日志记录 | 记录 stderr 输出和退出码 |
| 微信连接断开 | 自动重连 + 日志 | 指数退避重连 |
| WebDAV 同步失败 | last_error 字段 | sync_config 表记录最后错误 |

### 6.2 CI/CD 监控

| 指标 | 监控方式 | 说明 |
|------|----------|------|
| CI 检查状态 | GitHub Actions 面板 | PR 检查结果 |
| 构建成功率 | GitHub Actions 面板 | 三平台构建状态 |
| 发布产物 | GitHub/Gitee Release 页面 | 下载统计 |

---

## 7. 应急预案

### 7.1 构建失败

| 场景 | 处理步骤 |
|------|----------|
| 单平台构建失败 | 检查平台特定代码，修复后重新打 tag |
| 全平台构建失败 | 检查公共代码（类型错误、依赖问题），修复后重新打 tag |
| Gitee 发布失败 | GitHub Release 已成功，手动上传到 Gitee |

### 7.2 发布后严重 Bug

1. 删除 GitHub/Gitee Release（保留 tag）
2. 创建 hotfix 分支修复
3. 更新 patch 版本号
4. 重新打 tag 触发构建
5. 通知用户更新

### 7.3 数据库损坏

1. 用户应用内恢复：设置 → 数据备份 → 选择备份恢复
2. WebDAV 恢复：设置 → 数据同步 → 下载
3. 手动恢复：关闭应用 → 替换 `~/.wechat-link-agent/wla.db` → 重启

---

## 8. 关联文档

| 文档 | 关系 |
|------|------|
| [安全设计](./05-security-design.md) | 安全架构与威胁分析 |
| [上线发布手册](./03-release-guide.md) | 详细发布流程 |
| [环境部署文档](../03-phase-development/03-environment-setup.md) | 开发环境搭建 |
| [ADR-011](../02-phase-design/07-adr.md#adr-011-cicd-双平台发布策略) | CI/CD 决策记录 |

---

*最后更新：2026-07-20*
