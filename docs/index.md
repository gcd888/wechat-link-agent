# 微连项目文档索引

> 本文档为微连项目的所有文档索引，方便快速查找。

## 📚 文档导航

### 第一阶段：立项与需求

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 商业需求文档 (BRD) | [01-phase-requirements/01-brd.md](./01-phase-requirements/01-brd.md) | 项目定位、市场分析、商业模式、里程碑 |
| 产品需求文档 (PRD) | [01-phase-requirements/02-prd.md](./01-phase-requirements/02-prd.md) | 功能清单、业务流程、数据字典、异常处理 |

### 第二阶段：设计

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| UI 设计规范文档 | [02-phase-design/01-ui-design.md](./02-phase-design/01-ui-design.md) | 色彩系统、字体、组件规范、布局规范 |
| 系统架构设计文档 | [02-phase-design/02-system-architecture.md](./02-phase-design/02-system-architecture.md) | 架构图、模块划分、技术选型、IPC 设计 |
| 数据库设计说明书 (DDL) | [02-phase-design/03-database-ddl.md](./02-phase-design/03-database-ddl.md) | 14 张表结构、字段说明、索引策略 |
| IPC 接口设计文档 | [02-phase-design/04-ipc-api.md](./02-phase-design/04-ipc-api.md) | 主进程与渲染进程通信协议、全部通道定义 |
| 高层架构设计 | [02-phase-design/05-high-level-architecture.md](./02-phase-design/05-high-level-architecture.md) | 业务边界、MVP 范围、In-Scope/Out-of-Scope、干系人分析 |
| 系统设计 | [02-phase-design/06-system-design.md](./02-phase-design/06-system-design.md) | DDD 限界上下文划分、表与领域模型映射、IPC 契约总览、部署形态 |
| ADR 集 | [02-phase-design/07-adr.md](./02-phase-design/07-adr.md) | 12 条架构决策记录（技术选型、加密方案、分支模型等） |
| 数据字典 | [02-phase-design/08-data-dictionary.md](./02-phase-design/08-data-dictionary.md) | 14 张表字段级说明、索引策略、迁移历史 |
| 术语表 | [02-phase-design/09-glossary.md](./02-phase-design/09-glossary.md) | 核心术语、微信集成、安全、架构、数据库、开发流程术语 |
| 微信 iLink Bot API | [02-phase-design/10-wechat-ilink-bot-api.md](./02-phase-design/10-wechat-ilink-bot-api.md) | 微信 iLink Bot 全部 HTTP 接口（登录/消息/媒体/CDN） |

### 第三阶段：开发

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 详细设计说明书 (LLD) | [03-phase-development/01-lld.md](./03-phase-development/01-lld.md) | 关键模块内部逻辑实现（Agent 扫描、消息发送、加密等） |
| 编码规范文档 | [03-phase-development/02-coding-standards.md](./03-phase-development/02-coding-standards.md) | TypeScript/React 规范、Git 分支策略、提交规范 |
| 环境部署文档 | [03-phase-development/03-environment-setup.md](./03-phase-development/03-environment-setup.md) | 开发环境初始化、构建命令、调试技巧、CI/CD 配置 |
| 贡献 / CI 门禁说明 | [03-phase-development/04-contributing.md](./03-phase-development/04-contributing.md) | PR 评审、CI 校验门禁、分支模型、Code Review 标准 |

### 第四阶段：测试

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 测试策略与计划 | [04-phase-testing/01-test-strategy.md](./04-phase-testing/01-test-strategy.md) | 测试范围、单元/集成/E2E 测试、手动测试计划、性能与安全测试 |

### 第五阶段：运维

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 用户操作手册 | [05-phase-operations/01-user-manual.md](./05-phase-operations/01-user-manual.md) | 安装、配置、使用指南、FAQ、快捷键 |
| 开发者指南 | [05-phase-operations/02-developer-guide.md](./05-phase-operations/02-developer-guide.md) | 项目结构、开发环境、核心概念、开发指南、调试技巧 |
| 上线发布手册 | [05-phase-operations/03-release-guide.md](./05-phase-operations/03-release-guide.md) | 版本管理、构建打包、签名公证、应用商店上架 |
| 部署设计 | [05-phase-operations/04-deployment-design.md](./05-phase-operations/04-deployment-design.md) | 部署架构、CI/CD 流水线、环境矩阵、构建产物、应急预案 |
| 安全设计 | [05-phase-operations/05-security-design.md](./05-phase-operations/05-security-design.md) | STRIDE 威胁分析、密钥管理、访问控制、数据安全、已知隐患 |
| CHANGELOG | [05-phase-operations/06-changelog.md](./05-phase-operations/06-changelog.md) | 版本变更记录、SemVer 版本号规则、Keep a Changelog 格式 |

---

## 🎯 快速查找

### 我想了解...

**项目是什么？**
→ 查看 [商业需求文档 (BRD)](./01-phase-requirements/01-brd.md)

**项目有哪些功能？**
→ 查看 [产品需求文档 (PRD)](./01-phase-requirements/02-prd.md)

**系统如何设计？**
→ 查看 [高层架构设计](./02-phase-design/05-high-level-architecture.md)（业务边界/MVP）→ [系统设计](./02-phase-design/06-system-design.md)（模块/数据/IPC）→ [ADR 集](./02-phase-design/07-adr.md)（决策追溯）→ [数据字典](./02-phase-design/08-data-dictionary.md)（字段级）

**安全与部署如何保障？**
→ 查看 [安全设计](./05-phase-operations/05-security-design.md) → [部署设计](./05-phase-operations/04-deployment-design.md)（含应急预案）→ [术语表](./02-phase-design/09-glossary.md)

**文档术语有哪些？**
→ 查看 [术语表](./02-phase-design/09-glossary.md)

**数据库结构是什么？**
→ 查看 [数据库设计说明书 (DDL)](./02-phase-design/03-database-ddl.md)

**如何开发新功能？**
→ 查看 [开发者指南](./05-phase-operations/02-developer-guide.md)

**如何使用应用？**
→ 查看 [用户操作手册](./05-phase-operations/01-user-manual.md)

**如何发布新版本？**
→ 查看 [上线发布手册](./05-phase-operations/03-release-guide.md)

**如何贡献代码？**
→ 查看 [贡献指南](./03-phase-development/04-contributing.md)（分支模型 / CI 门禁 / PR 流程 / Code Review 标准）

**版本有哪些变更？**
→ 查看 [变更日志](./05-phase-operations/06-changelog.md)

**如何编写测试？**
→ 查看 [测试策略与计划](./04-phase-testing/01-test-strategy.md)

**微信 iLink Bot 有哪些接口？**
→ 查看 [微信 iLink Bot API 接口文档](./02-phase-design/10-wechat-ilink-bot-api.md)

---

## 📂 文档目录结构

```
docs/
├── index.md (本文件)
│
├── 01-phase-requirements/     # 立项与需求
│   ├── 01-brd.md
│   └── 02-prd.md
│
├── 02-phase-design/          # 设计
│   ├── 01-ui-design.md
│   ├── 02-system-architecture.md
│   ├── 03-database-ddl.md
│   ├── 04-ipc-api.md
│   ├── 05-high-level-architecture.md   # 高层架构设计
│   ├── 06-system-design.md             # 系统设计
│   ├── 07-adr.md                       # 架构决策记录
│   ├── 08-data-dictionary.md           # 数据字典
│   ├── 09-glossary.md                  # 术语表
│   └── 10-wechat-ilink-bot-api.md      # 微信 iLink Bot API 接口
│
├── 03-phase-development/     # 开发
│   ├── 01-lld.md
│   ├── 02-coding-standards.md
│   ├── 03-environment-setup.md
│   └── 04-contributing.md              # 贡献/CI 门禁
│
├── 04-phase-testing/         # 测试
│   └── 01-test-strategy.md
│
├── 05-phase-operations/      # 运维
│   ├── 01-user-manual.md
│   ├── 02-developer-guide.md
│   ├── 03-release-guide.md
│   ├── 04-deployment-design.md         # 部署设计
│   ├── 05-security-design.md           # 安全设计
│   └── 06-changelog.md                 # 变更日志
│
├── 06-marketing/             # 营销素材
│   └── ai-prompt-release-banner.md   # AI 海报提示词
│
├── img/                      # 图片资源
│   ├── logo/
│   └── wechat group.jpg
│
└── old/                      # 旧文档归档
    └── (legacy docs)
```

---

## 📝 文档维护

### 更新规范

- 文档更新后，同步更新本索引的「文档导航」和「快速查找」部分
- 重大变更在文档头部添加「更新日期」和「变更内容」
- 过期文档移至 `old/` 目录

### 贡献文档

欢迎贡献文档，请遵循以下规范：

1. 使用 Markdown 格式
2. 添加必要的中文注释
3. 包含代码示例
4. 更新本文档索引

---

## 🔗 相关链接

- **项目仓库**: https://github.com/gcd888/wechat-link-agent
- **Gitee 镜像**: https://gitee.com/gcd888/wechat-link-agent
- **问题反馈**: https://github.com/gcd888/wechat-link-agent/issues

---

> 📅 项目时间线：2026-04 立项 → 2026-05 设计 → 2026-06 开发 → 2026-07 发布 v0.0.1。

*最后更新：2026-07-20*
