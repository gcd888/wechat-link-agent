# 数据字典 - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 数据字典 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2026-05-01 |
| 关联文档 | [数据库设计说明书 (DDL)](./03-database-ddl.md)、[系统设计](./06-system-design.md) |

---

## 1. 概述

本文档提供微连项目 14 张数据库表的字段级说明、索引设计理由和迁移历史，作为 [DDL](./03-database-ddl.md) 的补充文档。

### 表清单

| 序号 | 表名 | 说明 | 所属上下文 |
|------|------|------|------------|
| 1 | app_config | 应用配置表（key-value） | 配置管理 |
| 2 | agent_registry | Agent 注册表（静态种子数据） | Agent 管理 |
| 3 | agent_install_commands | Agent 安装命令（按平台） | Agent 管理 |
| 4 | agents | 已安装 Agent 实例表 | Agent 管理 |
| 5 | provider_templates | LLM 供应商模板表 | 配置管理 |
| 6 | llm_providers | LLM 供应商表（API Key 加密） | 安全加密 |
| 7 | llm_models | LLM 模型表 | 安全加密 |
| 8 | sessions | 会话表 | 会话管理 |
| 9 | messages | 消息记录表 | 消息处理 |
| 10 | accounts | 微信账号绑定表 | 微信集成 |
| 11 | sync_config | WebDAV 同步配置表 | 数据同步 |
| 12 | store_categories | 商城分类表 | 配置管理 |
| 13 | store_items | 商城项目表 | 配置管理 |
| 14 | agent_commands | Agent 斜杠命令表 | Agent 管理 |

---

## 2. 字段说明

### 2.1 app_config

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| key | TEXT | PRIMARY KEY | - | 配置键名（如 theme, language） |
| name | TEXT | - | '' | 配置项显示名称 |
| value | TEXT | - | '' | 配置值（字符串存储，应用层做类型转换） |

**常用配置项**：`theme`（dark/light/system）、`language`（zh-CN/zh-TW/en）、`workingDirectory`、`systemPrompt`、`launchOnStartup`、`minimizeToTray`

---

### 2.2 agent_registry

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键，被 agents.id 引用 |
| command | TEXT | NOT NULL UNIQUE | - | CLI 命令名（如 claude） |
| name | TEXT | NOT NULL | - | 显示名称（如 Claude Code） |
| provider_type | TEXT | - | 'generic' | Provider 类型: claude/opencode/codebuddy/codex/mimo/trae/generic |
| icon | TEXT | - | '' | SVG 图标文件名 |
| default_args | TEXT | - | '' | 建议启动参数 |
| default_model | TEXT | - | '' | 建议默认模型 |
| vendor_en | TEXT | - | '' | 厂商英文名 |
| vendor_zh | TEXT | - | '' | 厂商中文名（简体） |
| vendor_tw | TEXT | - | '' | 厂商中文名（繁体） |
| platforms | TEXT | - | '' | 支持平台（逗号分隔: win32,darwin,linux） |
| flag | TEXT | - | '' | 标签（如"企业用户,个人不可用"） |
| status | INTEGER | - | 1 | 启用状态: 0=关闭 1=开启 |
| sort_order | INTEGER | - | 0 | 排序权重（越小越靠前） |

---

### 2.3 agent_install_commands

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| agent_command | TEXT | NOT NULL | - | 对应 agent_registry.command |
| platform | TEXT | NOT NULL | - | 平台: win32/darwin/linux |
| install_hint | TEXT | - | '' | 安装提示文字 |
| install_command | TEXT | - | '' | 一键安装命令 |
| uninstall_command | TEXT | - | '' | 一键卸载命令 |
| | | UNIQUE(agent_command, platform) | | 防止同平台重复 |

---

### 2.4 agents

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY | - | 对应 agent_registry.id（1:1） |
| command | TEXT | NOT NULL UNIQUE | - | 关联 agent_registry.command |
| cli_path | TEXT | - | '' | CLI 可执行文件全路径（扫描 PATH 获得） |
| args | TEXT | - | '' | 用户自定义启动参数 |
| cwd | TEXT | - | '' | 用户自定义工作目录 |
| model | TEXT | - | '' | 用户自定义模型 |
| enabled | INTEGER | - | 1 | 是否启用: 1=启用 0=禁用 |
| is_default | INTEGER | - | 0 | 是否为默认 Agent |
| llm_provider_id | INTEGER | - | NULL | 关联 llm_providers.id |
| model_config | TEXT | - | '' | 模型配置 JSON（model/temperature/max_tokens） |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |
| updated_at | TEXT | - | datetime('now','localtime') | 更新时间 |

**设计说明**：本表只存储运行时数据和用户自定义配置，不冗余 registry 中已有的字段。元信息通过 JOIN 读取。

---

### 2.5 provider_templates

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| name | TEXT | NOT NULL | - | 模板名称 |
| logo_url | TEXT | - | '' | Logo URL |
| website | TEXT | - | '' | 官网地址 |
| description | TEXT | - | '' | 描述 |
| base_uris | TEXT | - | '[]' | JSON 格式的 base URI 列表 |
| sort_order | INTEGER | - | 0 | 排序权重 |

---

### 2.6 llm_providers

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| name | TEXT | NOT NULL | - | 供应商名称 |
| description | TEXT | - | '' | 描述 |
| website | TEXT | - | '' | 官网 |
| base_uris | TEXT | - | '[]' | JSON: [{protocol, url}] |
| api_key_encrypted | TEXT | - | '' | 加密后的 API Key（Base64） |
| api_key_iv | TEXT | - | '' | 初始化向量（Base64） |
| api_key_tag | TEXT | - | '' | 认证标签（Base64） |
| logo_url | TEXT | - | '' | Logo URL |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |
| updated_at | TEXT | - | datetime('now','localtime') | 更新时间 |

**安全**：API Key 使用 AES-256-GCM 加密，密钥由主密码通过 PBKDF2 派生。

---

### 2.7 llm_models

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| provider_id | INTEGER | NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE | - | 关联供应商 ID |
| display_name | TEXT | NOT NULL | - | 显示名称（如 GPT-4o） |
| model_name | TEXT | NOT NULL | - | 实际请求模型名（如 gpt-4o） |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |

**索引**：`idx_llm_models_provider` ON `llm_models(provider_id)`

---

### 2.8 sessions

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| agent_id | INTEGER | NOT NULL REFERENCES agents(id) ON DELETE CASCADE | - | 关联 Agent ID |
| title | TEXT | - | '' | 会话标题（首条消息自动更新） |
| cwd | TEXT | - | NULL | 会话级工作目录（优先级高于 Agent 默认） |
| sdk_session_id | TEXT | - | NULL | Agent CLI 侧的 session ID |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |
| updated_at | TEXT | - | datetime('now','localtime') | 更新时间 |

**索引**：`idx_sessions_agent` ON `sessions(agent_id)`

---

### 2.9 messages

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| session_id | INTEGER | NOT NULL REFERENCES sessions(id) ON DELETE CASCADE | - | 关联会话 ID |
| agent_name | TEXT | NOT NULL DEFAULT '' | - | Agent 名称（冗余字段，便于检索） |
| role | TEXT | NOT NULL CHECK(role IN ('user','assistant','system')) | - | 消息角色 |
| content | TEXT | NOT NULL | - | 消息内容 |
| source | TEXT | DEFAULT 'desktop' CHECK(source IN ('desktop','wechat')) | 'desktop' | 消息来源 |
| timestamp | INTEGER | NOT NULL | - | Unix 毫秒时间戳 |

**索引**：
- `idx_messages_session` ON `messages(session_id)` — 按会话查询消息
- `idx_messages_agent` ON `messages(agent_name)` — 按 Agent 统计
- `idx_messages_time` ON `messages(timestamp)` — 按时间排序

---

### 2.10 accounts

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | TEXT | PRIMARY KEY | - | 微信 account_id |
| bot_token | TEXT | NOT NULL | - | iLink Bot API 访问令牌（safeStorage 加密存储，ENC1: 前缀） |
| user_id | TEXT | - | NULL | 微信用户标识 |
| base_url | TEXT | - | NULL | API 基础地址 |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |

---

### 2.11 sync_config

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| sync_type | TEXT | NOT NULL | 'webdav' | 同步类型 |
| enabled | INTEGER | - | 0 | 是否启用 |
| base_url | TEXT | - | NULL | WebDAV 服务器地址 |
| username | TEXT | - | NULL | WebDAV 用户名 |
| password | TEXT | - | NULL | WebDAV 密码（safeStorage 加密存储） |
| remote_root | TEXT | - | 'wechat-link-agent-sync' | 远程同步根目录 |
| profile | TEXT | - | 'default' | 同步配置档案名 |
| auto_sync | INTEGER | - | 0 | 是否自动同步 |
| auto_sync_interval | INTEGER | - | 30 | 自动同步间隔（分钟） |
| last_sync_at | INTEGER | - | NULL | 最后同步时间戳 |
| last_error | TEXT | - | NULL | 最后一次同步错误 |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |
| updated_at | TEXT | - | datetime('now','localtime') | 更新时间 |

---

### 2.12 store_categories

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| category_key | TEXT | PRIMARY KEY | - | 分类标识（如 api、agent） |
| name_zh | TEXT | NOT NULL | - | 中文名称（简体） |
| name_tw | TEXT | NOT NULL | - | 中文名称（繁体） |
| name_en | TEXT | NOT NULL | - | 英文名称 |
| icon | TEXT | - | '' | 图标名称 |

---

### 2.13 store_items

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| name | TEXT | NOT NULL | - | 商品名称 |
| category | TEXT | NOT NULL | - | 对应 store_categories.category_key |
| provider | TEXT | - | NULL | 提供方 |
| description | TEXT | - | NULL | 描述 |
| link | TEXT | NOT NULL | - | 项目链接 |
| logo_url | TEXT | - | NULL | Logo URL |
| sort_order | INTEGER | - | 0 | 排序权重 |
| enabled | INTEGER | - | 1 | 是否启用 |
| is_partner | INTEGER | - | 0 | 是否为合作伙伴 |
| commission | TEXT | - | NULL | 佣金/返利信息 |
| tag | TEXT | - | '官方' | 标签（官方/第三方/中转站） |
| icon | TEXT | - | '' | 图标 |
| created_at | TEXT | - | datetime('now','localtime') | 创建时间 |

**注意**：无 UNIQUE 约束，seed 插入前会 DELETE 清空。

---

### 2.14 agent_commands

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | - | 主键 |
| agent_command | TEXT | NOT NULL | - | 对应 agent_registry.command |
| slash | TEXT | NOT NULL | - | 斜杠命令（如 /init） |
| description_en | TEXT | - | '' | 英文描述 |
| description_zh | TEXT | - | '' | 中文描述（简体） |
| description_tw | TEXT | - | '' | 中文描述（繁体） |
| source | TEXT | - | 'builtin' | 来源: builtin/skill/plugin |
| alias | TEXT | - | '' | 命令别名（逗号分隔） |
| sort_order | INTEGER | - | 0 | 排序权重 |
| | | UNIQUE(agent_command, slash) | | 防止重复 |

**索引**：`idx_agent_commands_agent` ON `agent_commands(agent_command)`、`idx_agent_commands_source` ON `agent_commands(source)`

**注意**：每次启动时先删除 `source != 'builtin'` 的记录，再重新扫描插入 skill/plugin 命令。

---

## 3. 索引策略汇总

| 索引名 | 表 | 字段 | 设计理由 |
|--------|------|------|----------|
| idx_llm_models_provider | llm_models | provider_id | 按供应商查询模型列表 |
| idx_sessions_agent | sessions | agent_id | 按 Agent 查询会话列表 |
| idx_messages_session | messages | session_id | 按会话查询消息历史 |
| idx_messages_agent | messages | agent_name | 按 Agent 统计消息 |
| idx_messages_time | messages | timestamp | 按时间排序消息 |
| idx_agent_commands_agent | agent_commands | agent_command | 按 Agent 查询命令 |
| idx_agent_commands_source | agent_commands | source | 按来源筛选命令 |

---

## 4. 迁移历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0.0 | 2026-05-01 | 初始 Schema，14 张表 |
| 1.1.0 | 2026-06-01 | agents 表新增 llm_provider_id、model_config 字段 |
| 1.2.0 | 2026-06-15 | 新增 agent_install_commands、agent_commands、provider_templates 表 |

**版本控制**：在 `app_config` 表中存储 `db_version` 配置项。

---

## 5. 关联文档

| 文档 | 关系 |
|------|------|
| [数据库设计说明书 (DDL)](./03-database-ddl.md) | 完整 DDL 定义 |
| [系统设计](./06-system-design.md) | 限界上下文与表映射 |
| [术语表](./09-glossary.md) | 术语统一 |

---

*最后更新：2026-07-20*
