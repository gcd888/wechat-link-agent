# 变更日志 - 微连 (WeChat Link Agent)

> 本文档记录微连应用每个版本的变更历史。
> 版本号遵循 [SemVer 语义化版本](https://semver.org/lang/zh-CN/) 规范。
> 格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [Unreleased] — 开发中

### Added
- CI 持续集成检查工作流（`.github/workflows/ci.yml`），PR 自动触发类型检查 + 构建验证
- GitHub Pull Request 模板（`.github/PULL_REQUEST_TEMPLATE.md`）
- 贡献指南文档（`docs/03-phase-development/04-contributing.md`）
- 变更日志文档（`docs/05-phase-operations/06-changelog.md`）

### Changed
- README 贡献章节补充分支保护说明和贡献指南链接

---

## [0.1.0] — 开发中（下一版本）

### 计划中
- Agent 多 Agent 串并行调度
- 微信多媒体消息支持（图片/文件上传）
- WebDAV 云同步备份与恢复
- LLM 供应商管理工具箱
- 商城功能

---

## [0.0.1] — 2026-07-15

### Added
- 🎉 微连 (WeChat Link Agent) 初始版本
- Electron 33 + React 18 + TypeScript 5.7 三栏布局桌面应用
- **Agent 管理**：自动扫描系统 PATH 发现 CLI 工具，支持 Claude Code / OpenCode / CodeBuddy / 通用 Provider
- **微信集成**：基于 iLink Bot API 扫码登录、长轮询消息接收、流式输出实时推送
- **会话管理**：多会话独立隔离、消息持久化（SQLite）、Markdown 导出
- **命令路由**：斜杠命令体系（`/wlh`、`/wla`、`/wls`、`/version`、`/stop`、`/wlc`、`/history`、`/model`、`/cwd` 等）
- **配置中心**：深色/浅色主题、简体中文/繁体中文/英文国际化、托盘最小化、主密码保护
- **安全设计**：API Key AES-GCM 本地加密、PBKDF2 密钥派生、参数化查询
- GitHub Actions 自动三平台打包发布工作流（Windows / macOS / Linux）
- GitHub → Gitee 代码镜像同步工作流
- 项目完整文档体系（BRD / PRD / 架构设计 / 编码规范 / 用户手册等）

### Infrastructure
- `.npmrc` 配置 `legacy-peer-deps=true` 解决 electron-vite 与 vite peer 冲突
- `electron-builder.yml` 打包配置
- CI/CD 双平台发布（GitHub Releases + Gitee Releases）

---

## 版本号规则说明

```
v0.0.1  ← 初始版本
   ↓
v0.0.2  ← 紧急 bug 修复（hotfix，末位号递增）
   ↓
v0.1.0  ← 月度常规版本（新需求，中位号递增）
   ↓
v1.0.0  ← 首次正式发布（首位号递增，里程碑）
   ↓
v2.0.0  ← 破坏性变更（首位号递增，很少使用）
```

| 变更类型 | 版本号变化 | 触发条件 |
|---------|-----------|---------|
| 紧急 hotfix | 末位号递增（v0.1.0 → v0.1.1） | 生产环境 bug 修复 |
| 月度常规版本 | 中位号递增（v0.1.0 → v0.2.0） | 新功能 / 常规迭代 |
| 破坏性变更 | 首位号递增（v1.x.x → v2.0.0） | 不兼容的 API 变更 |

---

## 变更类型说明

| 类型 | 说明 |
|------|------|
| `Added` | 新增功能 |
| `Changed` | 对已有功能的变更 |
| `Deprecated` | 即将移除的功能 |
| `Removed` | 已移除的功能 |
| `Fixed` | Bug 修复 |
| `Security` | 安全相关修复 |
| `Infrastructure` | 构建/CI/工具链变更 |

---

*最后更新：2026-07-20*
