# 微连项目文档索引

> 本文档为微连项目的所有文档索引，方便快速查找。

## 📚 文档导航

### 第一阶段：立项与需求

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 商业需求文档 (BRD) | [01-phase-requirements/01-brd.md](./01-phase-requirements/01-brd.md) | 项目定位、市场分析、商业模式 |
| 产品需求文档 (PRD) | [01-phase-requirements/02-prd.md](./01-phase-requirements/02-prd.md) | 功能清单、业务流程、数据字典 |

### 第二阶段：设计

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| UI 设计规范文档 | [02-phase-design/01-ui-design.md](./02-phase-design/01-ui-design.md) | 色彩系统、字体、组件规范 |
| 系统架构设计文档 | [02-phase-design/02-system-architecture.md](./02-phase-design/02-system-architecture.md) | 架构图、模块划分、技术选型 |
| 数据库设计说明书 (DDL) | [02-phase-design/03-database-ddl.md](./02-phase-design/03-database-ddl.md) | 表结构、字段说明、索引策略 |
| IPC 接口设计文档 | [02-phase-design/04-ipc-api.md](./02-phase-design/04-ipc-api.md) | 主进程与渲染进程通信协议 |
| **高层架构设计** ⭐ | [02-phase-design/05-high-level-architecture.md](./02-phase-design/05-high-level-architecture.md) | AICoding 架构专家团 G3 产物：业务边界/MVP/In-Out Scope |
| **系统设计** ⭐ | [02-phase-design/06-system-design.md](./02-phase-design/06-system-design.md) | AICoding 架构专家团 G4 产物：DDD 7 限界上下文/14 表/IPC 契约/部署形态 |
| **ADR 集** ⭐ | [02-phase-design/07-adr.md](./02-phase-design/07-adr.md) | 架构决策记录（12 条，X1~X22 代码真相固化） |
| **数据字典** ⭐ | [02-phase-design/08-data-dictionary.md](./02-phase-design/08-data-dictionary.md) | 14 张表字段级说明 + 索引理由 + 迁移 changelog |
| **术语表** ⭐ | [02-phase-design/09-glossary.md](./02-phase-design/09-glossary.md) | 五份架构交付物术语统一（含云→本地等价映射） |
| **微信 iLink Bot API** ⭐ | [02-phase-design/10-wechat-ilink-bot-api.md](./02-phase-design/10-wechat-ilink-bot-api.md) | 微信 iLink Bot 全部 HTTP 接口（登录/消息/媒体/CDN） |

### 第三阶段：开发

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 详细设计说明书 (LLD) | [03-phase-development/01-lld.md](./03-phase-development/01-lld.md) | 关键模块内部逻辑实现 |
| 编码规范文档 | [03-phase-development/02-coding-standards.md](./03-phase-development/02-coding-standards.md) | TypeScript/React 规范、Git 策略 |
| 环境部署文档 | [03-phase-development/03-environment-setup.md](./03-phase-development/03-environment-setup.md) | 开发环境初始化、构建命令 |
| **贡献 / CI 门禁说明** ⭐ | [03-phase-development/04-contributing.md](./03-phase-development/04-contributing.md) | Doc-as-Code：PR 评审 + CI 校验门禁 + 分支模型 |

### 第四阶段：测试

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 测试策略与计划 | [04-phase-testing/01-test-strategy.md](./04-phase-testing/01-test-strategy.md) | 测试范围、测试方法、执行计划 |

### 第五阶段：运维

| 文档名称 | 文件路径 | 说明 |
|----------|----------|------|
| 用户操作手册 | [05-phase-operations/01-user-manual.md](./05-phase-operations/01-user-manual.md) | 安装、配置、使用指南、FAQ |
| 开发者指南 | [05-phase-operations/02-developer-guide.md](./05-phase-operations/02-developer-guide.md) | 贡献指南、开发规范、调试技巧 |
| 上线发布手册 | [05-phase-operations/03-release-guide.md](./05-phase-operations/03-release-guide.md) | 版本管理、构建打包、签名公证 |
| **部署设计** ⭐ | [05-phase-operations/04-deployment-design.md](./05-phase-operations/04-deployment-design.md) | AICoding 架构专家团 G5 产物：环境矩阵/资源清单/拓扑/CI-CD/监控/应急/容量成本 |
| **安全设计** ⭐ | [05-phase-operations/05-security-design.md](./05-phase-operations/05-security-design.md) | AICoding 架构专家团 G5 产物：STRIDE/IAM/数据安全/密钥分级/审计/应急 |
| **CHANGELOG** ⭐ | [05-phase-operations/06-changelog.md](./05-phase-operations/06-changelog.md) | 版本可追溯（app v0.1.0 / docs v1.0 语义分离） |

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
→ 查看 [安全设计](./05-phase-operations/05-security-design.md) → [部署设计](./05-phase-operations/04-deployment-design.md)（含 Runbook）→ [术语表](./02-phase-design/09-glossary.md)

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

**如何编写测试？**
→ 查看 [测试策略与计划](./04-phase-testing/01-test-strategy.md)

**微信 iLink Bot 有哪些接口？**
→ 查看 [微信 iLink Bot API 接口文档](./02-phase-design/10-wechat-ilink-bot-api.md)

---

## 📂 文档目录结构

```
docs/
├── README.md (本文件)
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
│   ├── 05-high-level-architecture.md   # ⭐ AICoding 架构团 G3
│   ├── 06-system-design.md             # ⭐ AICoding 架构团 G4
│   ├── 07-adr.md                       # ⭐ 架构决策记录
│   ├── 08-data-dictionary.md           # ⭐ 数据字典
│   ├── 09-glossary.md                  # ⭐ 术语表
│   └── 10-wechat-ilink-bot-api.md      # ⭐ 微信 iLink Bot API 接口
│
├── 03-phase-development/     # 开发
│   ├── 01-lld.md
│   ├── 02-coding-standards.md
│   ├── 03-environment-setup.md
│   └── 04-contributing.md              # ⭐ 贡献/CI 门禁
│
├── 04-phase-testing/         # 测试
│   └── 01-test-strategy.md
│
├── 05-phase-operations/      # 运维
│   ├── 01-user-manual.md
│   ├── 02-developer-guide.md
│   ├── 03-release-guide.md
│   ├── 04-deployment-design.md         # ⭐ AICoding 架构团 G5
│   ├── 05-security-design.md           # ⭐ AICoding 架构团 G5
│   └── 06-changelog.md                 # ⭐ 版本追溯
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
- **问题反馈**: https://github.com/gcd888/wechat-link-agent/issues

---

> ⭐ 标记文档为 **AICoding 架构专家团（齐构成等 8 人）** 于 2026-07-15 评估产出，遵循「现有代码为事实基准」铁律。评估覆盖：5 份架构交付物（G0→G6 阶段门闭环）+ 4 份补全缺失文档（ADR/数据字典/术语表/贡献说明/CHANGELOG）。已知非阻塞隐患：H-01 WebDAV 密码明文、H-02 bot_token 明文、H-03 changeMasterPassword 拼接 SQL（建议后续整改）。

*最后更新：2026-07-15*