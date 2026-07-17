# 数据库设计说明书 (DDL) - 微连

## 文档信息

| 项目 | 内容 |
|------|------|
| 文档名称 | 数据库设计说明书 |
| 项目名称 | 微连 (WeChat Link Agent) |
| 版本号 | v1.0 |
| 创建日期 | 2025-01-10 |

---

## 1. 数据库概述

### 1.1 技术选型

- **数据库引擎**：SQLite 3
- **运行方式**：sql.js（内存数据库）
- **存储位置**：`~/.wechat-link-agent/wla.db`
- **持久化策略**：每次关键操作后保存到磁盘

### 1.2 数据库特性

- **轻量级**：无需独立服务器进程
- **跨平台**：Windows/macOS/Linux 均可运行
- **事务支持**：ACID 特性保证数据一致性
- **加密**：敏感字段使用 AES-GCM 加密

---

## 2. ER 图

```
┌──────────────────────┐         ┌─────────────────────┐
│  agent_registry      │         │  agent_install_cmds  │
│  ├─ id (PK)          │◄────────┤  ├─ id (PK)          │
│  ├─ command (UQ)     │  1:N    │  ├─ agent_command    │
│  ├─ name             │         │  ├─ platform         │
│  ├─ provider_type    │         │  └─ ...              │
│  └─ ...              │         └─────────────────────┘
└──────────┬───────────┘
           │ 1:1 (id = agent_registry.id)
           │
┌──────────▼──────────┐         ┌─────────────────────┐
│  agents              │         │  accounts            │
│  ├─ id (PK=reg.id)   │         │  ├─ id (PK)          │
│  ├─ command (UQ)     │         │  ├─ bot_token (ENC)  │
│  ├─ cli_path         │         │  └─ ...              │
│  └─ ...              │         └─────────────────────┘
└──────────┬──────────┘
           │ 1
           │
           │ N
┌──────────▼──────────┐         ┌─────────────────────┐
│  sessions            │         │  messages            │
│  ├─ id (PK)          │◄────────┤  ├─ id (PK)          │
│  ├─ agent_id (FK)    │  1:N    │  ├─ session_id (FK)  │
│  └─ ...              │         │  └─ ...              │
└──────────────────────┘         └─────────────────────┘

┌──────────────────────┐         ┌─────────────────────┐
│  llm_providers       │         │  llm_models          │
│  ├─ id (PK)          │◄────────┤  ├─ id (PK)          │
│  ├─ name             │  1:N    │  ├─ provider_id (FK) │
│  ├─ api_key_encrypted│         │  └─ ...              │
│  └─ ...              │         └─────────────────────┘
└──────────────────────┘

┌──────────────────────┐         ┌─────────────────────┐
│  provider_templates  │         │  agent_commands      │
│  ├─ id (PK)          │         │  ├─ id (PK)          │
│  └─ ...              │         │  ├─ agent_command    │
└──────────────────────┘         │  ├─ slash            │
                                 │  └─ ...              │
┌──────────────────────┐         └─────────────────────┘
│  app_config          │
│  ├─ key (PK)         │         ┌─────────────────────┐
│  └─ value            │         │  store_categories    │
└──────────────────────┘         │  ├─ category_key(PK) │n                                 │  └─ ...              │
┌──────────────────────┐         └──────────┬──────────┘
│  sync_config         │                    │ N:1
│  ├─ id (PK)          │         ┌──────────▼──────────┐
│  └─ ...              │         │  store_items         │
└──────────────────────┘         │  ├─ id (PK)          │
                                 │  └─ ...              │
                                 └─────────────────────┘
```

---

## 3. 表结构设计

### 3.1 app_config - 应用配置表

存储应用配置项（主题、语言等），key-value 存储，替代 config.json 文件

```sql
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,  -- 配置键名
  name  TEXT DEFAULT '',   -- 配置项显示名称（中文）
  value TEXT DEFAULT ''    -- 配置值（TEXT 存储，应用层做类型转换）
);
```

**字段说明**：
- `key`：配置项键名（如 `theme`, `language`）
- `name`：配置项显示名称
- `value`：配置项值（字符串形式存储，类型转换在应用层）

**常用配置**：
- `theme`: `dark` | `light` | `system`
- `language`: `zh-CN` | `zh-TW` | `en`
- `workingDirectory`: 工作目录路径
- `systemPrompt`: 默认系统提示词
- `launchOnStartup`: `true` | `false`
- `minimizeToTray`: `true` | `false`

---

### 3.2 agent_registry - Agent 注册表

预定义的 Agent 配置（种子数据），所有支持的 Agent CLI 工具的定义信息

```sql
CREATE TABLE IF NOT EXISTS agent_registry (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  command       TEXT NOT NULL UNIQUE,  -- CLI 命令，如 "claude"
  name          TEXT NOT NULL,         -- 显示名称，如 "Claude Code"
  provider_type TEXT DEFAULT 'generic', -- Provider 类型: claude|opencode|codebuddy|codex|mimo|trae|generic
  icon          TEXT DEFAULT '',       -- SVG 图标文件名
  default_args  TEXT DEFAULT '',       -- 建议启动参数
  default_model TEXT DEFAULT '',       -- 建议默认模型
  vendor_en     TEXT DEFAULT '',       -- 厂商（英文）
  vendor_zh     TEXT DEFAULT '',       -- 厂商（中文简体）
  vendor_tw     TEXT DEFAULT '',       -- 厂商（中文繁体）
  platforms     TEXT DEFAULT '',       -- 支持平台: win32,darwin,linux
  flag          TEXT DEFAULT '',       -- 标签，如 "企业用户,个人不可用"
  status        INTEGER DEFAULT 1,    -- 启用状态: 0=关闭 1=开启
  sort_order    INTEGER DEFAULT 0     -- 排序权重
);
```

**字段说明**：
- `id`：主键，`agents.id` 直接引用此值（1:1 关系）
- `command`：CLI 命令（如 `claude`, `opencode`），唯一约束
- `provider_type`：Provider 类型，决定流式输出解析方式
- `platforms`：支持平台，逗号分隔
- `flag`：标签，逗号分隔
- `sort_order`：排序权重（越小越靠前）

> **注意**：安装命令存储在独立的 `agent_install_commands` 表中，按平台分行存储。

---

### 3.3 agent_install_commands - Agent 安装命令（按平台）

每个 Agent 在不同平台的安装命令各不相同，按平台分行存储

```sql
CREATE TABLE IF NOT EXISTS agent_install_commands (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_command      TEXT NOT NULL,    -- 对应 agent_registry.command
  platform           TEXT NOT NULL,    -- win32 | darwin | linux
  install_hint       TEXT DEFAULT '',  -- 安装提示
  install_command    TEXT DEFAULT '',  -- 一键安装命令
  uninstall_command  TEXT DEFAULT '',  -- 一键卸载命令
  UNIQUE(agent_command, platform)
);
```

**字段说明**：
- `agent_command`：对应 `agent_registry.command`
- `platform`：平台（`win32` | `darwin` | `linux`）
- `install_hint` / `install_command` / `uninstall_command`：安装提示和命令

---

### 3.4 agents - 已安装 Agent 表

存储启动时自动扫描发现的已安装 Agent CLI。与 `agent_registry` 通过 `command` 字段 JOIN 读取 name/icon/provider_type/vendor 等元信息。

```sql
CREATE TABLE IF NOT EXISTS agents (
  id            INTEGER PRIMARY KEY,     -- 对应 agent_registry.id（稳定标识符）
  command       TEXT NOT NULL UNIQUE,    -- 关联 agent_registry.command
  cli_path      TEXT DEFAULT '',          -- CLI 可执行文件全路径（扫描 PATH 获得）
  args          TEXT DEFAULT '',          -- 用户自定义启动参数
  cwd           TEXT DEFAULT '',          -- 用户自定义工作目录
  model         TEXT DEFAULT '',          -- 用户自定义模型
  enabled       INTEGER DEFAULT 1,        -- 是否启用: 1=启用, 0=禁用
  is_default    INTEGER DEFAULT 0,        -- 是否为默认 Agent
  llm_provider_id INTEGER DEFAULT NULL,   -- 关联的 LLM 供应商 ID
  model_config  TEXT DEFAULT '',          -- 模型配置 JSON（含 model/temperature/max_tokens）
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);
```

**字段说明**：
- `id`：直接使用 `agent_registry.id`（1:1 关系），确保 session 外键不漂移
- `command`：关联 `agent_registry.command`，唯一约束
- `cli_path`：CLI 可执行文件全路径（扫描 PATH 获得）
- `llm_provider_id`：关联 `llm_providers.id`（可为空）
- `model_config`：JSON 格式的模型配置

> **设计说明**：本表只存储运行时数据和用户自定义配置，不冗余 registry 中已有的字段。元信息通过 JOIN 读取。

---

### 3.5 provider_templates - 供应商模板表

预置常见 LLM 供应商的模板数据，用户新增供应商时可搜索选择模板

```sql
CREATE TABLE IF NOT EXISTS provider_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  logo_url        TEXT DEFAULT '',
  website         TEXT DEFAULT '',
  description     TEXT DEFAULT '',
  base_uris       TEXT DEFAULT '[]',  -- JSON 格式的 base URI 列表
  sort_order      INTEGER DEFAULT 0
);
```

---

### 3.6 llm_providers - LLM 供应商表（工具箱）

存储用户自定义的 LLM 模型供应商信息，API Key 以 AES-256-GCM 加密存储

```sql
CREATE TABLE IF NOT EXISTS llm_providers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  website         TEXT DEFAULT '',
  base_uris       TEXT DEFAULT '[]',     -- JSON: [{protocol, url}]
  api_key_encrypted TEXT DEFAULT '',     -- 加密后的 API Key（Base64）
  api_key_iv        TEXT DEFAULT '',     -- 初始化向量（Base64）
  api_key_tag       TEXT DEFAULT '',     -- 认证标签（Base64）
  logo_url        TEXT DEFAULT '',
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);
```

**字段说明**：
- `base_uris`：JSON 数组，支持多种协议（`openai` | `anthropic` | `gemini`）
- `api_key_encrypted` / `api_key_iv` / `api_key_tag`：AES-256-GCM 加密参数

**安全**：API Key 加密存储，加密密钥由用户主密码通过 PBKDF2 派生，仅存内存

---

### 3.7 llm_models - LLM 模型表（工具箱）

每个供应商下可配置多个模型

```sql
CREATE TABLE IF NOT EXISTS llm_models (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id     INTEGER NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL,    -- 显示名称，如 "GPT-4o"
  model_name      TEXT NOT NULL,    -- 实际请求模型名，如 "gpt-4o-2024-08-06"
  created_at      TEXT DEFAULT (datetime('now','localtime'))
);
```

**索引**：
- `CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models(provider_id);`

---

### 3.8 sessions - 会话表

每个 Agent 的对话会话

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id       INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title          TEXT DEFAULT '',
  cwd            TEXT DEFAULT NULL,   -- 会话级工作目录
  sdk_session_id TEXT,                -- Agent CLI 侧的 session_id
  created_at     TEXT DEFAULT (datetime('now','localtime')),
  updated_at     TEXT DEFAULT (datetime('now','localtime'))
);
```

**字段说明**：
- `agent_id`：关联 `agents.id`，级联删除
- `title`：会话标题（默认空字符串，由首条消息自动更新）
- `cwd`：会话级工作目录，优先级高于 Agent 默认工作目录
- `sdk_session_id`：某些 CLI 返回的会话 ID（如 Claude Code 的 session ID）

**索引**：
- `CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);`

---

### 3.9 messages - 消息记录表

存储所有聊天消息，支持桌面和微信双来源

```sql
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL DEFAULT '',  -- Agent 名称（冗余，方便检索）
  role       TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content    TEXT NOT NULL,
  source     TEXT DEFAULT 'desktop' CHECK(source IN ('desktop','wechat')),
  timestamp  INTEGER NOT NULL           -- Unix 毫秒时间戳
);
```

**字段说明**：
- `session_id`：关联 `sessions.id`，级联删除
- `agent_name`：Agent 名称（冗余字段，便于查询）
- `role`：消息角色，CHECK 约束限定 `user` | `assistant` | `system`
- `source`：消息来源，CHECK 约束限定 `desktop` | `wechat`
- `timestamp`：Unix 毫秒时间戳

**索引**：
- `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);`
- `CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_name);`
- `CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp);`

---

### 3.10 accounts - 微信账号绑定表

存储微信 iLink Bot API 的认证凭证

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,       -- 微信 account_id
  bot_token  TEXT NOT NULL,          -- iLink Bot API 访问令牌（safeStorage 加密存储）
  user_id    TEXT,                   -- 微信用户标识
  base_url   TEXT,                   -- API 基础地址
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
```

**字段说明**：
- `id`：微信 account_id（主键）
- `bot_token`：iLink Bot API 访问令牌，使用 Electron safeStorage 加密存储（`ENC1:` 前缀标识密文）

---

### 3.11 sync_config - WebDAV 同步配置表

```sql
CREATE TABLE IF NOT EXISTS sync_config (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type    TEXT NOT NULL DEFAULT 'webdav',  -- 同步类型
  enabled      INTEGER DEFAULT 0,               -- 是否启用同步
  base_url     TEXT,                            -- WebDAV 服务器地址
  username     TEXT,                            -- WebDAV 用户名
  password     TEXT,                            -- WebDAV 密码（safeStorage 加密存储）
  remote_root  TEXT DEFAULT 'wechat-link-agent-sync',  -- 远程同步根目录
  profile      TEXT DEFAULT 'default',          -- 同步配置档案名
  auto_sync    INTEGER DEFAULT 0,               -- 是否自动同步
  auto_sync_interval INTEGER DEFAULT 30,        -- 自动同步间隔（分钟）
  last_sync_at INTEGER,                         -- 最后同步时间戳（Unix 毫秒）
  last_error   TEXT,                            -- 最后一次同步错误信息
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime'))
);
```

**字段说明**：
- `sync_type`：同步类型（目前仅支持 `webdav`）
- `base_url`：WebDAV 服务器地址
- `password`：使用 Electron safeStorage 加密存储（`ENC1:` 前缀标识密文）
- `auto_sync_interval`：自动同步间隔，单位为分钟（可选 5/10/15/30/60）
- `last_sync_at` / `last_error`：记录同步状态

---

### 3.12 store_categories - 商城分类表

商城商品的分组名称（支持中英文），由种子数据初始化

```sql
CREATE TABLE IF NOT EXISTS store_categories (
  category_key TEXT PRIMARY KEY,   -- 分类标识，如 "api"、"agent"
  name_zh      TEXT NOT NULL,      -- 中文名称（简体）
  name_tw      TEXT NOT NULL,      -- 中文名称（繁体）
  name_en      TEXT NOT NULL,      -- 英文名称
  icon         TEXT DEFAULT ''     -- 图标名称
);
```

---

### 3.13 store_items - 商城项目表

商城页面展示数据，由种子数据初始化

```sql
CREATE TABLE IF NOT EXISTS store_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,        -- 对应 store_categories.category_key
  provider    TEXT,
  description TEXT,
  link        TEXT NOT NULL,        -- 项目链接（官网或注册地址）
  logo_url    TEXT,
  sort_order  INTEGER DEFAULT 0,
  enabled     INTEGER DEFAULT 1,
  is_partner  INTEGER DEFAULT 0,
  commission  TEXT,
  tag         TEXT DEFAULT '官方',  -- 标签：官方 / 第三方 / 中转站
  icon        TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now','localtime'))
);
```

**字段说明**：
- `category`：对应 `store_categories.category_key`
- `is_partner`：是否为合作伙伴（1=是, 0=否）
- `commission`：佣金/返利信息
- `tag`：标签（官方 / 第三方 / 中转站）
- `enabled`：是否启用

> **注意**：`store_items` 表无 UNIQUE 约束，seed 插入前会 DELETE 清空。

---

### 3.14 agent_commands - Agent 斜杠命令表

每个 Agent CLI 支持的斜杠命令，按 `agent_command` 关联 `agent_registry.command`

```sql
CREATE TABLE IF NOT EXISTS agent_commands (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_command TEXT NOT NULL,      -- 对应 agent_registry.command，如 "claude"
  slash         TEXT NOT NULL,      -- 斜杠命令，如 "/init"
  description_en TEXT DEFAULT '',
  description_zh TEXT DEFAULT '',
  description_tw TEXT DEFAULT '',
  source        TEXT DEFAULT 'builtin',  -- builtin | skill | plugin
  alias         TEXT DEFAULT '',    -- 命令别名（逗号分隔）
  sort_order    INTEGER DEFAULT 0,
  UNIQUE(agent_command, slash)      -- 防止重复插入
);
```

**字段说明**：
- `agent_command`：对应 `agent_registry.command`
- `slash`：斜杠命令
- `source`：来源（`builtin` = CLI 内置 / `skill` = 用户级技能 / `plugin` = 插件提供）
- `alias`：命令别名（逗号分隔），如 `new,reset` 表示 `/clear` 也可通过 `/new`、`/reset` 触发

**索引**：
- `CREATE INDEX IF NOT EXISTS idx_agent_commands_agent ON agent_commands(agent_command);`
- `CREATE INDEX IF NOT EXISTS idx_agent_commands_source ON agent_commands(source);`

> **注意**：每次启动时先删除 `source != 'builtin'` 的记录，再重新扫描插入 skill/plugin 命令。

---

## 4. 数据库操作规范

### 4.1 初始化

应用启动时执行 `schema.sql` 和 `seed.sql`：

```typescript
// src/database/db.ts
const db = new SQL.Database()

// 创建表
const schema = await fs.readFile('src/database/schema.sql', 'utf-8')
db.run(schema)

// 插入种子数据
const seed = await fs.readFile('src/database/seed.sql', 'utf-8')
db.run(seed)

// 保存到磁盘
await saveDb(db)
```

### 4.2 持久化

关键操作后调用 `saveDb()`：

```typescript
async function saveDb() {
  const data = db.export()
  await fs.writeFile(dbPath, Buffer.from(data))
}
```

### 4.3 备份恢复

```typescript
// 创建备份
function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `backup-${timestamp}.db`)
  fs.copyFileSync(dbPath, backupPath)
}

// 恢复备份
async function restoreFromBackup(backupPath: string) {
  const data = await fs.readFile(backupPath)
  db = new SQL.Database(new Uint8Array(data))
  await saveDb(db)
}
```

---

## 5. 性能优化

### 5.1 索引策略

- 所有外键字段建立索引
- 频繁查询字段建立索引（如 `sessions.updated_at`）
- 全文搜索使用 `LIKE` 配合索引

### 5.2 查询优化

```sql
-- 获取 Agent 最新会话（使用索引）
SELECT * FROM sessions
WHERE agent_id = ?
ORDER BY updated_at DESC
LIMIT 1;

-- 搜索消息（使用索引）
SELECT * FROM messages
WHERE content LIKE ?
ORDER BY timestamp DESC
LIMIT 50;
```

### 5.3 批量操作

```sql
-- 批量插入（事务）
BEGIN TRANSACTION;
INSERT INTO messages (...) VALUES (...);
INSERT INTO messages (...) VALUES (...);
COMMIT;
```

---

## 6. 数据迁移

### 6.1 版本控制

在 `app_config` 表中存储数据库版本：

```sql
INSERT OR IGNORE INTO app_config (key, value) VALUES ('db_version', '1.0.0');
```

### 6.2 升级脚本

```sql
-- 示例：新增字段
ALTER TABLE agents ADD COLUMN llm_provider_id INTEGER;

UPDATE app_config SET value = '2.0.0' WHERE key = 'db_version';
```

---

*本文档定义了微连项目的数据库结构，所有数据操作需遵循此规范*